/**
 * URL click-through (CL-7346): Ctrl+click opens http(s) URLs in the
 * transcript. Plain and structured rows are armed per node (armLinkLine):
 * holding Ctrl over a link highlights it, press-and-release on the same URL
 * opens it. Assistant markdown paints through childless library renderers
 * with no node to arm, so it is covered by a bubbling handler on the
 * transcript root (armMarkdownLinks) that resolves clicks through
 * markdownLinkAt below — click-to-open only, no hover highlight.
 *
 * The gesture is modifier-gated end to end. Without the modifier nothing here
 * runs: rows keep today's expand and selection behavior, and with mouse
 * capture off (Alt+M) the terminal owns every click because OpenTUI never
 * sees one. Only http(s) targets ever open; every other scheme is ignored.
 */
import {
  CodeRenderable,
  Renderable,
  StyledText,
  TextAttributes,
  TextRenderable,
  bold as boldChunk,
  fg as fgChunk,
  link as linkChunk,
  underline as underlineChunk,
  type CliRenderer,
  type LineInfo,
  type MouseEvent,
  type TextChunk,
} from "@opentui/core";
import { stringWidth } from "./view/height.js";
import { UI } from "./theme.js";

/** A styled text run split so URL runs carry their target. */
export interface LinkSpan {
  readonly text: string;
  readonly fg: string;
  readonly bold?: boolean | undefined;
  readonly url: string | null;
}

interface LinkHit {
  readonly url: string;
  readonly start: number;
  readonly end: number;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`\]]+/gi;
const TRAILING_PUNCTUATION = new Set([
  ".",
  ",",
  ";",
  ":",
  "!",
  "?",
  "'",
  '"',
  "]",
  "}",
  ">",
]);

/**
 * Only http(s) targets ever open. Markdown authors can point a link at any
 * scheme (`javascript:`, `file:`, `mailto:`), so the gate parses rather than
 * prefix-matching.
 */
export function isOpenableUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** http(s) runs inside plain text, without trailing prose punctuation. */
export function findLinks(text: string): LinkHit[] {
  const hits: LinkHit[] = [];
  URL_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const end = trimUrlEnd(text, match.index, match.index + match[0].length);
    if (end > match.index)
      hits.push({ url: text.slice(match.index, end), start: match.index, end });
  }
  return hits;
}

/**
 * The end of a URL match once prose punctuation is out: trailing sentence
 * punctuation never belongs to the link, and a closing paren only does when
 * the match opened one to balance it.
 */
function trimUrlEnd(text: string, start: number, end: number): number {
  let trimmed = end;
  while (trimmed > start) {
    const tail = text[trimmed - 1];
    if (tail === undefined || !TRAILING_PUNCTUATION.has(tail)) break;
    trimmed -= 1;
  }
  let depth = 0;
  for (let i = start; i < trimmed; i += 1) {
    if (text[i] === "(") depth += 1;
    if (text[i] === ")") depth -= 1;
  }
  while (trimmed > start && text[trimmed - 1] === ")" && depth < 0) {
    trimmed -= 1;
    depth += 1;
  }
  return trimmed;
}

/** Split styled segments so URL runs become their own spans. */
export function splitLinkSpans(
  segments: readonly { text: string; fg: string; bold?: boolean | undefined }[],
): LinkSpan[] {
  const spans: LinkSpan[] = [];
  for (const segment of segments) {
    spans.push(
      ...sliceSpans(
        segment,
        findLinks(segment.text).map((hit): SliceHit => ({
          ...hit,
          text: hit.url,
        })),
      ),
    );
  }
  return spans;
}

/** A hit with the exact text its span paints (trimmed of prose punctuation). */
interface SliceHit extends LinkHit {
  readonly text: string;
}

/** Cut one segment on explicit hits; a hitless segment stays one null span. */
function sliceSpans(
  segment: { text: string; fg: string; bold?: boolean | undefined },
  hits: readonly SliceHit[],
): LinkSpan[] {
  if (hits.length === 0) {
    return [
      { text: segment.text, fg: segment.fg, bold: segment.bold, url: null },
    ];
  }
  const spans: LinkSpan[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor)
      spans.push({
        text: segment.text.slice(cursor, hit.start),
        fg: segment.fg,
        bold: segment.bold,
        url: null,
      });
    spans.push({
      text: hit.text,
      fg: segment.fg,
      bold: segment.bold,
      url: hit.url,
    });
    cursor = hit.end;
  }
  if (cursor < segment.text.length)
    spans.push({
      text: segment.text.slice(cursor),
      fg: segment.fg,
      bold: segment.bold,
      url: null,
    });
  return spans;
}

/**
 * Split pre-wrapped plain-row lines so a URL broken across continuation lines
 * resolves to one target: every fragment highlights and opens the full URL.
 *
 * `wrapWidth` is the painted width the row was wrapped at. Only a full line
 * ending in a URL run can start a chain, and only a full line the run
 * reaches the end of continues one — a short line ends the chain unless
 * nothing textual follows it (end of text, bubble padding), because a short
 * line with text after it is a natural break, not a wrap. A chain is accepted
 * when its fragments reassemble to one of `sourceUrls`, the links the row's
 * pre-wrap text actually holds: word wrap can orphan a short fragment line
 * with wrapped text after it (indistinguishable from a natural break by
 * geometry alone), and the source is what tells the two apart. Without known
 * source URLs the joined candidate still has to scan as exactly one clean
 * http(s) URL, which keeps an unfortunate line break (a full line that
 * happens to end in a URL, followed by a word) from fusing two unrelated
 * runs. That coincidence is indistinguishable from a real wrap after the
 * fact, so it stays a documented approximation: it needs a URL ending
 * exactly at the wrap edge. A seed with no detectable hit on its own line
 * (a hard split inside the scheme or host) only continues through a full
 * first line: the full line broke at a wrap edge, while a short next line
 * behind a bare scheme reads as prose that happens to scan, not a wrap —
 * unless the fragments reassemble to a known source URL, which settles it.
 */
export function splitWrappedLinkSpans(
  lines: readonly { text: string; fg: string }[],
  wrapWidth: number,
  sourceUrls: readonly string[] = [],
): LinkSpan[][] {
  const hits = lines.map((line) =>
    findLinks(line.text).map((hit): SliceHit => ({ ...hit, text: hit.url })),
  );
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const seed = line === undefined ? null : wrapSeed(line.text, wrapWidth);
    if (line === undefined || seed === null) {
      index += 1;
      continue;
    }
    const chain = followWrapChain(
      lines,
      index + 1,
      seed,
      (hits[index] ?? []).some((hit) => hit.end >= seed.end),
      wrapWidth,
      sourceUrls,
    );
    if (chain === null) {
      index += 1;
      continue;
    }
    hits[index] = (hits[index] ?? []).filter((hit) => hit.start < seed.start);
    hits[index]?.push({
      url: chain.full,
      start: seed.start,
      end: seed.end,
      text: seed.text,
    });
    for (const run of chain.runs) {
      hits[run.line] = (hits[run.line] ?? []).filter(
        (hit) => hit.end <= run.start || hit.start >= run.end,
      );
      hits[run.line]?.push({
        url: chain.full,
        start: run.start,
        end: run.end,
        text: lines[run.line]?.text.slice(run.start, run.end) ?? "",
      });
    }
    index = chain.endLine + 1;
  }
  return lines.map((line, i) =>
    sliceSpans(
      line,
      [...(hits[i] ?? [])].sort((a, b) => a.start - b.start),
    ),
  );
}

/** A full line's trailing URL run seeds a wrapped chain, if URL-shaped. */
function wrapSeed(
  text: string,
  wrapWidth: number,
): {
  readonly start: number;
  readonly end: number;
  readonly text: string;
} | null {
  if (stringWidth(text) !== wrapWidth) return null;
  const run = text.match(/[^\s]+$/)?.[0] ?? "";
  // The :// marks the run as URL-shaped even when a hard split inside the
  // scheme or host leaves no detectable hit; the joined candidate still has
  // to scan as one clean URL before anything merges. Prose punctuation the
  // wrap left at the edge is not part of the seed, same as for a hit.
  if (!run.includes("://")) return null;
  const start = text.length - run.length;
  const end = trimUrlEnd(text, start, text.length);
  if (end <= start) return null;
  return { start, end, text: text.slice(start, end) };
}

/** Fragments a chain picks up past its seed line, through its final line. */
interface WrapChain {
  readonly full: string;
  readonly runs: readonly {
    readonly line: number;
    readonly start: number;
    readonly end: number;
  }[];
  readonly endLine: number;
}

/**
 * Walk continuation lines past their indent, fusing leading runs onto the
 * seed. A run ending mid-line ends the chain; a run reaching its line's end
 * continues it only through a full line, and a short line ends the chain
 * unless nothing textual follows it (end of text, bubble padding) — a short
 * line with text after it is a natural break, not a wrap. A hitless seed
 * only continues through a full first line, because a short next line behind
 * a bare scheme reads as prose that happens to scan. Against known source
 * URLs the chain also ends the moment its fragments reassemble to one of
 * them, which is what resolves a wrap the geometry alone cannot see: a
 * short fragment line with wrapped text after it. Without source URLs the
 * joined candidate has to scan as one clean URL instead.
 */
function followWrapChain(
  lines: readonly { text: string; fg: string }[],
  from: number,
  seed: { readonly start: number; readonly end: number; readonly text: string },
  seedAnchored: boolean,
  wrapWidth: number,
  sourceUrls: readonly string[],
): WrapChain | null {
  let full = seed.text;
  const runs: { line: number; start: number; end: number }[] = [];
  let line = from;
  for (;;) {
    const text = lines[line]?.text;
    if (text === undefined) break;
    const start = text.match(/^[\s▍]*/)?.[0].length ?? 0;
    const raw = text.slice(start).match(/^[^\s]+/)?.[0] ?? "";
    if (raw.length === 0) {
      if (runs.length === 0 || !isWrapEndLine(text)) return null;
      break;
    }
    const end = trimUrlEnd(text, start, start + raw.length);
    if (end <= start) return null;
    full += text.slice(start, end);
    runs.push({ line, start, end });
    if (sourceUrls.includes(full)) return { full, runs, endLine: line };
    if (runs.length === 1 && !seedAnchored && stringWidth(text) !== wrapWidth)
      return null;
    if (end !== text.length) break;
    if (stringWidth(text) === wrapWidth) {
      line += 1;
      continue;
    }
    if (!isWrapEndLine(lines[line + 1]?.text)) return null;
    break;
  }
  if (runs.length === 0) return null;
  if (sourceUrls.length > 0) return null;
  if (!isOpenableUrl(full)) return null;
  const check = findLinks(full);
  if (check.length !== 1 || check[0]?.url !== full) return null;
  return { full, runs, endLine: runs[runs.length - 1]?.line ?? from };
}

/**
 * A line nothing textual follows on: the end of the text, or a user-bubble
 * pad row (the bare bar with no body). A blank source line is not one — it
 * is a natural break. Paint trims each line's trailing space, so the pad
 * compares exactly.
 */
function isWrapEndLine(text: string | undefined): boolean {
  if (text === undefined) return true;
  return text.trimEnd() === "▍";
}

/** Native chunks for one span: link spans carry OSC-8 metadata. */
export function linkSpanChunks(
  span: LinkSpan,
  highlighted: boolean,
): TextChunk[] {
  let chunk = fgChunk(span.fg)(span.text);
  if (span.bold === true) chunk = boldChunk(chunk);
  if (span.url !== null) chunk = linkChunk(span.url)(chunk);
  if (highlighted && span.url !== null)
    chunk = underlineChunk(fgChunk(UI.inFlightBright)(chunk));
  return [chunk];
}

/**
 * The open gesture: left press while Ctrl is held. Cmd on macOS is the
 * terminal's own OSC-8 click (it handles Cmd+click itself and the app never
 * sees the press); Ctrl is what SGR mouse reports carry on every platform.
 */
export function isUrlOpenClick(
  event: Pick<MouseEvent, "button" | "modifiers">,
): boolean {
  return event.button === 0 && event.modifiers.ctrl === true;
}

export type UrlOpener = (url: string) => void;

/**
 * Argv for opening a URL with the platform handler, without a shell. Windows
 * must never route through `cmd /c start`: cmd.exe re-parses the assembled
 * command line, so `&`, `|` and `&&` in an attacker-influenceable transcript
 * URL would execute as command separators. `rundll32 url.dll,FileProtocolHandler`
 * takes the URL as a plain argv element instead.
 */
export function platformUrlCommand(platform: string, url: string): string[] {
  if (platform === "darwin") return ["open", url];
  if (platform === "win32")
    return ["rundll32", "url.dll,FileProtocolHandler", url];
  return ["xdg-open", url];
}

function defaultUrlOpener(url: string): void {
  const command = platformUrlCommand(process.platform, url);
  try {
    Bun.spawn(command, {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    }).unref();
  } catch {
    // Fire-and-forget from a hover/click handler with no status line to
    // report to; a missing opener must not break the transcript.
  }
}

let currentOpener: UrlOpener = defaultUrlOpener;

/** Test seam: swap the browser opener, `resetUrlOpener` restores it. */
export function setUrlOpener(opener: UrlOpener): void {
  currentOpener = opener;
}

export function resetUrlOpener(): void {
  currentOpener = defaultUrlOpener;
}

/** Open an http(s) URL in the default browser; anything else is ignored. */
export function openUrl(url: string): void {
  if (!isOpenableUrl(url)) return;
  try {
    currentOpener(url);
  } catch {
    // Same fire-and-forget contract as the default opener above.
  }
}

/**
 * One painted line's openable-URL column ranges. Every armed text node keeps
 * a single text node shape — retext and selection never see anything else —
 * and resolves clicks through these ranges instead.
 */
export interface LinkColumnHit {
  readonly url: string;
  /** Inclusive column where the URL starts. */
  readonly start: number;
  /** Exclusive column where it ends. */
  readonly end: number;
}

/** Column ranges of the openable URLs across one line's spans. */
export function linkColumnHits(spans: readonly LinkSpan[]): LinkColumnHit[] {
  const hits: LinkColumnHit[] = [];
  let column = 0;
  for (const span of spans) {
    const width = stringWidth(span.text);
    if (span.url !== null && isOpenableUrl(span.url))
      hits.push({ url: span.url, start: column, end: column + width });
    column += width;
  }
  return hits;
}

/** The URL under a column, if the column lands on one. */
export function hitUrlAt(
  hits: readonly LinkColumnHit[],
  column: number,
): string | null {
  for (const hit of hits) {
    if (column >= hit.start && column < hit.end) return hit.url;
  }
  return null;
}

/**
 * One link line's paint node: always a single text node, whether or not it
 * holds URLs, so retext and selection see the shape they always have. URL
 * spans carry OSC-8 metadata, which is also what lets the terminal own
 * Cmd+click on macOS.
 */
export function buildLinkLine(
  ctx: CliRenderer,
  spans: readonly LinkSpan[],
): TextRenderable {
  const node = new TextRenderable(ctx, {
    content: new StyledText(
      spans.flatMap((span) => linkSpanChunks(span, false)),
    ),
  });
  armLinkLine(node, [spans]);
  return node;
}

/**
 * Rewrite a link line's text on its existing node and re-arm it. The node
 * never changes shape, so unlike a span-row split this always succeeds —
 * callers rebuild only when their own layout (line count, arrow presence)
 * changes, exactly as before.
 */
export function paintLinkLine(
  node: TextRenderable,
  lines: readonly (readonly LinkSpan[])[],
): void {
  node.content = new StyledText(linkLinesChunks(lines, null));
  armLinkLine(node, lines);
}

/**
 * Chunks for caller-built per-line spans, joining lines with newlines and
 * marking the highlighted URL underlined while keeping its own color.
 */
function linkLinesChunks(
  lines: readonly (readonly LinkSpan[])[],
  highlighted: string | null,
): TextChunk[] {
  const chunks: TextChunk[] = [];
  for (const [index, spans] of lines.entries()) {
    if (index > 0) chunks.push({ __isChunk: true, text: "\n" });
    for (const span of spans)
      chunks.push(...linkSpanChunks(span, span.url === highlighted));
  }
  return chunks;
}

/**
 * Arm a text node as a link hit target over caller-built per-line spans:
 * Ctrl+hover highlights the URL under the pointer, Ctrl+press and release on
 * the same URL opens it. When no line holds a URL the node is disarmed — any
 * handlers a previous arming installed are cleared — so a retext that drops
 * the last URL leaves no stale hit target behind; handler assignment
 * replaces, so re-arming after a retext never stacks.
 *
 * The press deliberately keeps bubbling — stopping it would break drag-select
 * starting on a URL — and the open fires on release only when the pointer
 * resolves to the same URL it pressed on, so a Ctrl+drag still selects.
 * Columns map over the unwrapped line; on a wrapped line the continuation
 * rows resolve against the same ranges, and the press/release equality check
 * keeps a stray resolution from opening.
 */
export function armLinkLine(
  node: TextRenderable,
  lines: readonly (readonly LinkSpan[])[],
): void {
  const hits = lines.map(linkColumnHits);
  if (!hits.some((line) => line.length > 0)) {
    node.onMouseDown = undefined;
    node.onMouseUp = undefined;
    node.onMouseOver = undefined;
    node.onMouseMove = undefined;
    node.onMouseOut = undefined;
    return;
  }
  const at = (event: MouseEvent): string | null => {
    // Events carry terminal-absolute coordinates with no per-node transform,
    // so map through the node's own screen position (scroll-aware through the
    // translate chain, matching the dispatch hit test).
    const line = Math.max(0, Math.min(hits.length - 1, event.y - node.screenY));
    return hitUrlAt(hits[line] ?? [], event.x - node.screenX);
  };
  const repaint = (highlighted: string | null): void => {
    node.content = new StyledText(linkLinesChunks(lines, highlighted));
  };
  let press: string | null = null;
  let hover: string | null = null;
  node.onMouseDown = (event) => {
    press = isUrlOpenClick(event) ? at(event) : null;
  };
  node.onMouseUp = (event) => {
    const start = press;
    press = null;
    if (start !== null && isUrlOpenClick(event) && at(event) === start) {
      openUrl(start);
      // The bubbled release would otherwise be resolved again by the
      // transcript-root armMarkdownLinks handler. This handler runs
      // first in the bubble; stopping propagation starves the root of the
      // release and keeps exactly one open per gesture. The press
      // deliberately keeps bubbling so drag-select still works.
      event.stopPropagation();
    }
  };
  node.onMouseOver = (event) => {
    if (event.modifiers.ctrl !== true) return;
    const url = at(event);
    if (url !== hover) {
      hover = url;
      repaint(url);
    }
  };
  node.onMouseMove = (event) => {
    const url = event.modifiers.ctrl === true ? at(event) : null;
    if (url !== hover) {
      hover = url;
      repaint(url);
    }
  };
  node.onMouseOut = () => {
    press = null;
    if (hover !== null) {
      hover = null;
      repaint(null);
    }
  };
}

export function isUnderlined(attributes: number): boolean {
  return (attributes & TextAttributes.UNDERLINE) !== 0;
}

/**
 * Link-markup characters whose painted width the resolver cannot know. The
 * renderer conceals markdown link markup — observed: `[guide](…)` paints as
 * `guide (…)` — and highlight state is not readable from here, so each of
 * these characters is modeled as taking painted width 0 or 1. Every other
 * character paints at its measured width.
 */
const CONCEALABLE = new Set(["[", "]", "(", ")"]);

/**
 * Inline `[label](target)` links in one source line. The label and the
 * target both open the target. Images (`![alt](target)`) are skipped:
 * nothing specifies their click behavior, and a missed click is safer
 * than a wrong open.
 */
function findMarkdownLinks(line: string): LinkHit[] {
  const spans: LinkHit[] = [];
  const pattern = /\[([^\]]*)\]\(([^)\s]+)\)/g;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > 0 && line[index - 1] === "!") continue;
    const url = match[2] ?? "";
    const rawStart = index + match[0].lastIndexOf(url);
    const end = trimUrlEnd(line, rawStart, rawStart + url.length);
    if (end <= rawStart) continue;
    const target = line.slice(rawStart, end);
    const label = match[1] ?? "";
    if (label.length > 0)
      spans.push({
        url: target,
        start: index + 1,
        end: index + 1 + label.length,
      });
    spans.push({ url: target, start: rawStart, end });
  }
  return spans;
}

/**
 * The link target under one source offset: bare URLs first (fidelity for
 * URL-shaped link labels), then inline `[label](target)` spans.
 */
function markdownUrlAt(line: string, offset: number): string | null {
  for (const hit of findLinks(line)) {
    if (offset >= hit.start && offset < hit.end) return hit.url;
  }
  for (const span of findMarkdownLinks(line)) {
    if (offset >= span.start && offset < span.end) return span.url;
  }
  return null;
}

/**
 * Source offsets a painted column can mean within one rendered row. Each
 * offset starts painting somewhere in [min, max] (the spread comes from
 * concealable markup before it) and paints up to wMax wide; the column hits
 * the offset when it falls in that range. Columns before any markup map
 * exactly; around markup the set holds neighbors too — the caller opens
 * only when every plausible offset agrees on one URL.
 */
function paintedColumnToSource(
  line: string,
  base: number,
  length: number,
  column: number,
): number[] {
  if (column < 0) return [];
  const plausible: number[] = [];
  let min = 0;
  let max = 0;
  let offset = base;
  const end = Math.min(line.length, base + length);
  while (offset < end) {
    const char = line[offset] ?? "";
    const codePoint = line.codePointAt(offset) ?? 0;
    const wMax = CONCEALABLE.has(char)
      ? 1
      : stringWidth(String.fromCodePoint(codePoint));
    if (min <= column && column < max + wMax) plausible.push(offset);
    min += CONCEALABLE.has(char) ? 0 : wMax;
    max += wMax;
    if (min > column) break;
    offset += codePoint > 0xffff ? 2 : 1;
  }
  return plausible;
}

/**
 * The link target under terminal-absolute (x, y) inside one painted code
 * block: the row maps through the block's own line info to a source line,
 * the column maps to plausible source offsets, and the click opens only
 * when every plausible offset agrees on one URL — concealment ambiguity
 * misses rather than opening wrong. Stale layout or an unexpected library
 * shape resolves to null, never throws.
 */
function codeBlockLinkAt(
  block: CodeRenderable,
  x: number,
  y: number,
): string | null {
  let content: string;
  let info: LineInfo;
  try {
    content = block.content;
    info = block.lineInfo;
  } catch {
    return null;
  }
  const row = y - block.screenY;
  const column = x - block.screenX;
  if (row < 0 || column < 0) return null;
  const source = info.lineSources[row];
  const base = info.lineStartCols[row];
  const length = info.lineWidthCols[row];
  if (
    source === undefined ||
    base === undefined ||
    length === undefined ||
    !Number.isInteger(source) ||
    !Number.isInteger(base) ||
    !Number.isInteger(length)
  )
    return null;
  const line = content.split("\n")[source];
  if (typeof line !== "string") return null;
  let found: string | null = null;
  for (const offset of paintedColumnToSource(line, base, length, column)) {
    const url = markdownUrlAt(line, offset);
    if (url === null) continue;
    if (found === null) found = url;
    else if (found !== url) return null;
  }
  return found;
}

/**
 * The markdown click target: the raw link target under terminal-absolute
 * (x, y), or null when the cell paints no link. Walks from the hit leaf up
 * to the nearest painted code block (assistant markdown paints through
 * library CodeRenderables, one per block); clicks landing between blocks
 * still resolve through the parent markdown node, which pairs the same full
 * source with its own line info. TextRenderable rows never resolve here —
 * their own armed node handlers own those clicks. Never throws: anything
 * unexpected resolves to null so a missed click stays a missed click.
 */
export function markdownLinkAt(
  renderer: CliRenderer,
  x: number,
  y: number,
): string | null {
  try {
    let current: Renderable | null | undefined;
    try {
      current = Renderable.renderablesByNumber.get(renderer.hitTest(x, y));
    } catch {
      return null;
    }
    while (current) {
      if (current instanceof CodeRenderable) {
        const url = codeBlockLinkAt(current, x, y);
        if (url !== null) return url;
      }
      current = current.parent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Arm a transcript ancestor as the markdown click target: mouse events bubble
 * up from the hit leaf, and markdown blocks paint through childless library
 * renderers with no node of ours to arm, so this ancestor handler is the only
 * hook that sees their clicks. Ctrl+press stores the link under the pointer
 * (markdownLinkAt reads the same terminal-absolute coordinates events carry);
 * the open fires on release only over the same URL, so a press on a link that
 * drags away never opens. Armed rows stop propagation after opening
 * themselves, so a click there still opens exactly once; everything goes
 * through openUrl, which gates to http(s) — markdown links can carry any
 * scheme and markdownLinkAt hands the raw target back.
 */
export function armMarkdownLinks(
  target: Renderable,
  renderer: CliRenderer,
): void {
  let press: string | null = null;
  target.onMouseDown = (event) => {
    press = isUrlOpenClick(event)
      ? markdownLinkAt(renderer, event.x, event.y)
      : null;
  };
  target.onMouseUp = (event) => {
    const start = press;
    press = null;
    if (start === null || !isUrlOpenClick(event)) return;
    if (markdownLinkAt(renderer, event.x, event.y) === start) openUrl(start);
  };
  target.onMouseOut = () => {
    press = null;
  };
}
