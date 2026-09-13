import { resolve } from "node:path";
import type { ToolPlugin } from "@intx/tools-posix";
import { isToolOutputLike } from "../util/tool-output-uri.js";
import { isArchiveLike } from "../session/archive-uri.js";
import { resolveWorkspacePath } from "../permission/path-restriction.js";
import type { RootsProvider } from "../permission/worktree-roots.js";

export interface PathEscapeOptions {
  // When true (yolo / --dangerously-skip-permissions), paths outside the
  // workspace still resolve to absolute form and pass through. Secret-guard and
  // authz remain the hard-deny layers; the permission gate already auto-allows.
  // A getter is resolved per call so `/yolo` mid-session takes effect without
  // rebuilding the plugin stack.
  allowOutside?: boolean | (() => boolean);
}

function resolveAllowOutside(
  value: boolean | (() => boolean) | undefined,
): boolean {
  if (typeof value === "function") return value();
  return value === true;
}

export function pathEscapePlugin(
  cwd: string,
  rootsProvider: RootsProvider = () => [],
  options: PathEscapeOptions = {},
): ToolPlugin {
  return {
    middleware: (next) => async (call, signal) => {
      let escaped: Record<string, unknown>;
      try {
        escaped = escapeArgs(
          call.arguments,
          cwd,
          rootsProvider,
          resolveAllowOutside(options.allowOutside),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { callId: call.id, content: message, isError: true };
      }
      return next({ ...call, arguments: escaped }, signal);
    },
  };
}

function escapeArgs(
  args: Record<string, unknown>,
  cwd: string,
  rootsProvider: RootsProvider,
  allowOutside: boolean,
): Record<string, unknown> {
  if (!allowOutside) {
    const reason = pathEscapeBlockReason(args, cwd, rootsProvider);
    if (reason !== undefined) throw new Error(reason);
  }
  return escapeValue(args, cwd, rootsProvider, allowOutside) as Record<
    string,
    unknown
  >;
}

function escapeValue(
  value: unknown,
  cwd: string,
  rootsProvider: RootsProvider,
  allowOutside: boolean,
  key?: string,
): unknown {
  if (typeof value === "string") {
    return key !== undefined && looksLikePath(key)
      ? sanitizePath(value, cwd, rootsProvider, allowOutside)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      escapeValue(entry, cwd, rootsProvider, allowOutside, key),
    );
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      out[entryKey] = escapeValue(
        entryValue,
        cwd,
        rootsProvider,
        allowOutside,
        entryKey,
      );
    }
    return out;
  }
  return value;
}

// Explicit allowlist of argument keys treated as filesystem paths. Keys are
// matched case- and separator-insensitively, so `filePath`, `FILE_PATH`,
// and `file-path` all count alongside `file_path`; any key ending in
// `path`/`paths` (e.g. `somepath`, `outputPaths`) counts too. Anything else
// passes through untouched by design: MCP and custom tools may use arbitrary
// keys whose values only their server interprets, so unknown keys are that
// server's contract, not this sandbox's.
export function looksLikePath(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return (
    normalized === "path" ||
    normalized === "paths" ||
    normalized === "filepath" ||
    normalized === "filepaths" ||
    normalized === "target" ||
    normalized === "cwd" ||
    normalized === "directory" ||
    normalized === "dir" ||
    normalized === "dest" ||
    normalized === "source" ||
    normalized === "from" ||
    normalized === "to" ||
    normalized === "filename" ||
    normalized === "filenames" ||
    normalized.endsWith("path") ||
    normalized.endsWith("paths")
  );
}

// Same sandbox pathEscapePlugin enforces at execution. The permission gate
// consults this at authorize time so it can deny instead of asking for a call
// the plugin will reject after Accept.
export function pathEscapeBlockReason(
  args: Record<string, unknown>,
  cwd: string,
  rootsProvider: RootsProvider = () => [],
): string | undefined {
  return blockReasonFor(args, cwd, rootsProvider);
}

function blockReasonFor(
  value: unknown,
  cwd: string,
  rootsProvider: RootsProvider,
  key?: string,
): string | undefined {
  if (typeof value === "string") {
    if (key === undefined || !looksLikePath(key)) return undefined;
    if (isToolOutputLike(value) || isArchiveLike(value)) return undefined;
    if (resolveWorkspacePath(cwd, value, rootsProvider) === undefined) {
      return `Path escapes working directory: ${value}`;
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const reason = blockReasonFor(entry, cwd, rootsProvider, key);
      if (reason !== undefined) return reason;
    }
    return undefined;
  }
  if (typeof value === "object" && value !== null) {
    for (const [entryKey, entryValue] of Object.entries(value)) {
      const reason = blockReasonFor(entryValue, cwd, rootsProvider, entryKey);
      if (reason !== undefined) return reason;
    }
  }
  return undefined;
}

function sanitizePath(
  value: string,
  cwd: string,
  rootsProvider: RootsProvider,
  allowOutside: boolean,
): string {
  if (isToolOutputLike(value) || isArchiveLike(value)) {
    return value;
  }
  const resolved = resolveWorkspacePath(cwd, value, rootsProvider);
  if (resolved !== undefined) {
    return resolved;
  }
  if (allowOutside) {
    // Same lexical resolve as resolveWorkspacePath's in-bounds branch — absolute
    // so later plugins see a stable path, not a relative escape fragment.
    return resolve(cwd, value);
  }
  throw new Error(`Path escapes working directory: ${value}`);
}
