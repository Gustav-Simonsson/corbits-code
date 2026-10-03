import type { ToolDefinition } from "@intx/types/runtime";
import {
  isKimiLeafProvider,
  isXaiGrokLeafProvider,
} from "../subagent/provider-family.js";

/** Context used to decide whether a provider needs wire-schema rewrites. */
export interface NormalizeToolDefsContext {
  providerName: string;
  model?: string;
}

/**
 * Shared primitives / view guidance for `present`. Used by both the canonical
 * `presentDefinition.description` and the kimi wire `view.description` so the
 * two never drift.
 */
export const PRESENT_VIEW_PRIMITIVES_GUIDANCE =
  "Primitives: text{text, tone?, bold?, dim?}; " +
  "stack{children:[node], gap?:0|1}; row{children:[node], gap?:0|1}; " +
  "box{border?, padding?, children:[node]}; divider; " +
  "grid{columns?:[{align?}], rows: [ [cellNode, ...], ... ] } for aligned columns (cells are usually text nodes). " +
  "tone is one of default|muted|success|warning|danger|accent. " +
  "Compose freely rather than targeting named shapes.";

const TONE_ENUM = [
  "default",
  "muted",
  "success",
  "warning",
  "danger",
  "accent",
] as const;
const ALIGN_ENUM = ["left", "right", "center"] as const;
const GAP_ENUM = [0, 1] as const;

/** Fully-specified leaf text node (no children). */
const TEXT_NODE = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["text"] },
    text: { type: "string" },
    tone: { type: "string", enum: [...TONE_ENUM] },
    bold: { type: "boolean" },
    dim: { type: "boolean" },
  },
  required: ["type", "text"],
  additionalProperties: false,
} as const;

/** Fully-specified leaf divider node. */
const DIVIDER_NODE = {
  type: "object",
  properties: { type: { type: "string", enum: ["divider"] } },
  required: ["type"],
  additionalProperties: false,
} as const;

/**
 * Nested child: leafs fully typed, plus a depth-capped open object for deeper
 * containers. Documents type/children/text/rows without recursive `$ref`.
 * Runtime `validateView` still accepts full nested trees.
 */
const NESTED_CHILD = {
  oneOf: [
    TEXT_NODE,
    DIVIDER_NODE,
    {
      type: "object",
      description:
        "Nested layout node (stack/row/box/grid or deeper). Runtime validates structure.",
      properties: {
        type: {
          type: "string",
          enum: ["stack", "row", "box", "grid", "text", "divider"],
        },
        text: { type: "string" },
        children: {
          type: "array",
          items: { type: "object", additionalProperties: true },
        },
        rows: {
          type: "array",
          items: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
        gap: { type: "integer", enum: [...GAP_ENUM] },
        border: { type: "boolean" },
        padding: { type: "integer", enum: [...GAP_ENUM] },
        columns: {
          type: "array",
          items: {
            type: "object",
            properties: { align: { type: "string", enum: [...ALIGN_ENUM] } },
            additionalProperties: false,
          },
        },
        tone: { type: "string", enum: [...TONE_ENUM] },
        bold: { type: "boolean" },
        dim: { type: "boolean" },
      },
      required: ["type"],
      additionalProperties: true,
    },
  ],
} as const;

const COLUMNS_PROP = {
  type: "array",
  items: {
    type: "object",
    properties: { align: { type: "string", enum: [...ALIGN_ENUM] } },
    additionalProperties: false,
  },
} as const;

/**
 * Non-recursive `present` parameters for Moonshot/kimi-class backends.
 * Those providers reject JSON Schema `$ref` cycles on `tools.function.parameters`
 * (recursive ViewNode). This shape inlines depth-capped oneOf primitives so the
 * model still sees type/children/text fields — not a bare freeform object.
 * Runtime still validates full nested trees via `validateView`.
 */
export const KIMI_PRESENT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    view: {
      description:
        "Root layout node. Runtime validates full nested trees. " +
        PRESENT_VIEW_PRIMITIVES_GUIDANCE,
      oneOf: [
        TEXT_NODE,
        DIVIDER_NODE,
        {
          type: "object",
          properties: {
            type: { type: "string", enum: ["stack"] },
            children: { type: "array", items: NESTED_CHILD },
            gap: { type: "integer", enum: [...GAP_ENUM] },
          },
          required: ["type", "children"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            type: { type: "string", enum: ["row"] },
            children: { type: "array", items: NESTED_CHILD },
            gap: { type: "integer", enum: [...GAP_ENUM] },
          },
          required: ["type", "children"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            type: { type: "string", enum: ["box"] },
            children: { type: "array", items: NESTED_CHILD },
            border: { type: "boolean" },
            padding: { type: "integer", enum: [...GAP_ENUM] },
          },
          required: ["type", "children"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            type: { type: "string", enum: ["grid"] },
            columns: COLUMNS_PROP,
            rows: {
              type: "array",
              items: { type: "array", items: NESTED_CHILD },
            },
          },
          required: ["type", "rows"],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ["view"],
} as const;

function rewritePresentForKimi(def: ToolDefinition): ToolDefinition {
  return {
    ...def,
    // structuredClone so callers cannot mutate the shared const via the tool def.
    inputSchema: structuredClone(
      KIMI_PRESENT_INPUT_SCHEMA,
    ) as ToolDefinition["inputSchema"],
  };
}

const OPEN_OBJECT = {
  type: "object",
  additionalProperties: true,
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function schemaDeclaresShape(node: Record<string, unknown>): boolean {
  return (
    node["type"] !== undefined ||
    node["$ref"] !== undefined ||
    node["oneOf"] !== undefined ||
    node["anyOf"] !== undefined ||
    node["allOf"] !== undefined
  );
}

/**
 * Grok's Responses proxy 400s the whole infer on one invalid tool schema
 * (empty body, statusText "Bad Request"). Untyped properties and `$schema`
 * are the shapes MCP tools and submit_result historically advertised.
 */
function sanitizeSchemaForGrok(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSchemaForGrok);
  if (!isPlainObject(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "$schema" || key === "$id") continue;
    if (key === "properties" && isPlainObject(child)) {
      const props: Record<string, unknown> = {};
      for (const [name, prop] of Object.entries(child)) {
        const sanitized = sanitizeSchemaForGrok(prop);
        if (isPlainObject(sanitized) && !schemaDeclaresShape(sanitized)) {
          props[name] = { ...sanitized, ...OPEN_OBJECT };
        } else {
          props[name] = sanitized;
        }
      }
      next[key] = props;
      continue;
    }
    next[key] = sanitizeSchemaForGrok(child);
  }
  return next;
}

function sanitizeToolDefForGrok(def: ToolDefinition): ToolDefinition {
  return {
    ...def,
    inputSchema: sanitizeSchemaForGrok(
      structuredClone(def.inputSchema),
    ) as ToolDefinition["inputSchema"],
  };
}

/**
 * Family-gated wire rewrite of tool definitions before they reach the director /
 * provider. Moonshot/kimi get a non-recursive `present` schema. Grok/xAI get
 * schema sanitization so an untyped property or `$schema` cannot 400 the
 * infer. Other providers receive the definitions unchanged (identity).
 *
 * Does not alter runtime validation or the canonical `presentDefinition` used
 * as the source of truth for non-kimi advertise paths.
 *
 * Call this at every advertise path that may include `present` (main TUI/exec
 * sessions). Sub-agent toolsets currently omit `present` (main-session only);
 * still safe to call — identity when no present tool, rewrite if one appears.
 */
export function normalizeToolDefinitionsForProvider(
  defs: readonly ToolDefinition[],
  ctx: NormalizeToolDefsContext,
): ToolDefinition[] {
  const kimi = isKimiLeafProvider(ctx);
  const grok = isXaiGrokLeafProvider(ctx);
  if (!kimi && !grok) {
    return defs as ToolDefinition[];
  }
  return defs.map((def) => {
    let next = def;
    if (kimi && def.name === "present") next = rewritePresentForKimi(next);
    if (grok) next = sanitizeToolDefForGrok(next);
    return next;
  });
}
