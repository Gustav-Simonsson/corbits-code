// Resume path for reactor approval suspensions.
//
// When the reactor's authz hook suspends an ask-tier call, agent.send()
// settles with { type: "suspended", correlationId, approvalSnapshot }. The
// parked call has no tool result and no resolve closure — its identity is the
// correlationId, persisted as a PendingOperation by the reactor. This module
// rebuilds the operator-facing request from the approval snapshot, resolves it
// through the gate's requestApproval seam (the same modal surface the
// middleware path uses), and delivers the operator's decision back to the
// reactor as a correlated inbound message. An approved decision grants the
// call's one-shot bypass and the reactor re-dispatches the exact parked call;
// a rejected one answers it with an error result.

import type { Agent, SendResult } from "@intx/agent";
import type { ApprovalSnapshot, InboundMessage } from "@intx/types/runtime";
import { type } from "arktype";

import { getLogger } from "@intx/log";

import { LOG_NAMESPACE_ROOT } from "../branding.js";
import { commandReferencesSensitivePath } from "../plugins/secret-guard-plugin.js";
import { APPROVAL_TIMEOUT_RESULT_TEXT } from "../permission/decline-markers.js";
import { buildRequests } from "../permission/classify.js";
import type { PermissionGate } from "../permission/gate.js";
import type { PermissionRequest } from "../permission/types.js";

const logger = getLogger([LOG_NAMESPACE_ROOT, "approval-resume"]);

export const APPROVAL_DROPPED_NOTICE =
  "Approval dropped because the session changed.";

const ApprovalSnapshotShape = type({
  name: "string",
  "arguments?": "Record<string, unknown>",
});

export interface ApprovalResume {
  /**
   * Settle a suspended send: show the approval surface, then deliver the
   * operator's decision to the reactor on the correlationId signal channel.
   * Resolves once the decision is delivered (the resumed run continues
   * asynchronously on the reactor loop). Returns false for non-suspension
   * results so callers can forward them unchanged.
   */
  handle: (result: SendResult) => Promise<boolean>;
}

// Rebuild the operator-facing request from the persisted snapshot. Scopes come
// from buildRequests (the same decomposition the middleware path shows), with
// the secret-path rule re-applied: secret shell never offers a persistent
// scope, because future secret-path shell always re-asks.
export function requestFromApprovalSnapshot(
  snapshot: ApprovalSnapshot,
  correlationId: string,
): PermissionRequest | null {
  const parsed = ApprovalSnapshotShape(snapshot);
  if (parsed instanceof type.errors) return null;
  const call = {
    id: correlationId,
    name: parsed.name,
    arguments: parsed.arguments ?? {},
  };
  const [request] = buildRequests(call);
  if (request === undefined) return null;
  const anySecret =
    request.tool === "run_shell" &&
    commandReferencesSensitivePath(request.subject) !== undefined;
  return anySecret ? { ...request, scopes: [] } : request;
}

// The reactor's approval timeout answers the parked call with this exact
// upstream text (see permission/decline-markers.ts) before removing the
// correlation, so its presence after the suspension watermark marks the
// correlation as settled — but only when the result answers this very call.
// Parallel-parked calls each time out into their own tool result (callId is
// the original tool-call id, not the minted correlationId), so matching text
// alone abandons a still-valid sibling decision. The parked call id must come
// along and match block.callId; without it the text-only scan stays as the
// fallback so a genuinely late decision is still dropped.

function settledAfterSuspend(
  turns: Awaited<ReturnType<Agent["history"]>>,
  fromIndex: number,
  parkedCallId: string | undefined,
): boolean {
  return turns
    .slice(fromIndex)
    .flatMap((turn) => turn.content)
    .some(
      (block) =>
        block.type === "tool_result" &&
        (parkedCallId === undefined || block.callId === parkedCallId) &&
        block.content.some(
          (part) =>
            part.type === "text" && part.text === APPROVAL_TIMEOUT_RESULT_TEXT,
        ),
    );
}

function stableArgs(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableArgs).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableArgs(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// Derive this suspension's parked call id from history: the pre-watermark
// tool_call matching the snapshot's name and arguments that has no tool
// result anywhere yet. A parked call is neither run nor answered, so the only
// unanswered match is this suspension's own call; a timed-out sibling is
// answered by its timeout result and drops out of the candidates. Returns
// undefined unless exactly one candidate matches.
function parkedCallIdFromHistory(
  turns: Awaited<ReturnType<Agent["history"]>>,
  fromIndex: number,
  snapshot: ApprovalSnapshot,
): string | undefined {
  const answered = new Set<string>();
  for (const turn of turns) {
    for (const block of turn.content) {
      if (block.type === "tool_result") answered.add(block.callId);
    }
  }
  const wanted = stableArgs(snapshot.arguments ?? {});
  const candidates = new Set<string>();
  for (const turn of turns.slice(0, fromIndex)) {
    for (const block of turn.content) {
      if (
        block.type === "tool_call" &&
        block.name === snapshot.name &&
        stableArgs(block.arguments) === wanted &&
        !answered.has(block.id)
      ) {
        candidates.add(block.id);
      }
    }
  }
  return candidates.size === 1 ? [...candidates][0] : undefined;
}

function decisionMessage(
  correlationId: string,
  outcome: "approved" | "rejected",
  message?: string,
) {
  const body: { outcome: "approved" | "rejected"; message?: string } = {
    outcome,
  };
  if (message !== undefined && message.length > 0) body.message = message;
  return {
    ref: { uid: 0, mailbox: "approval" },
    headers: {
      from: "approval@local",
      to: ["agent@local"],
      date: new Date().toISOString(),
      messageId: `approval-${correlationId}`,
      interchangeCorrelationId: correlationId,
    },
    flags: [],
    content: JSON.stringify(body),
    signatureStatus: "missing",
  } satisfies InboundMessage;
}

export function createApprovalResume(args: {
  // Live agent at history/deliver time. TUI occupancy holds this identity
  // until the correlated resume is accepted; a generation bump aborts the
  // gate rather than retargeting a rebuilt agent.
  getAgent: () => Pick<Agent, "deliver" | "history"> | undefined;
  // TUI session queue. When present, each decision is awaited through this
  // seam; exec omits it and uses getAgent().deliver.
  deliver?: (
    message: InboundMessage,
    stillCurrent: () => boolean,
  ) => void | Promise<void>;
  // TUI: capture at handle() start so interrupt, /clear, or /new during the
  // overlay aborts the gate and drops the decision. Exec omits this.
  captureGeneration?: () => () => boolean;
  // TUI: operator-visible notice when an overlay decision is dropped after
  // a generation bump.
  onDropped?: (text: string) => void;
  // TUI: interrupt/clear bump this to reject the parked call on the old
  // agent before close/rebuild. Cleared when handle returns.
  registerParkedCancel?: (cancel: (() => void) | undefined) => void;
  // Pending-operation lookup: map this suspension's correlationId to the
  // parked tool-call id (PendingOperation.suspendedCall.id). The timeout
  // result carries the original call id while the suspension carries only
  // the minted correlationId, so this is what ties them together. Takes
  // precedence over the history derivation below; absent callers fall back
  // to it.
  resolveParkedCallId?: (correlationId: string) => string | undefined;
  gate: PermissionGate;
}): ApprovalResume {
  const { getAgent, gate } = args;

  const requireAgent = (): Pick<Agent, "deliver" | "history"> => {
    const agent = getAgent();
    if (agent === undefined) {
      throw new Error("approval resume: no live agent");
    }
    return agent;
  };

  return {
    handle: async (result) => {
      if (result.type !== "suspended") return false;
      const stillCurrent = args.captureGeneration?.() ?? (() => true);
      const parkedAgent = requireAgent();
      const { correlationId, approvalSnapshot } = result;

      let cancelled = false;
      const cancelParked = (): void => {
        if (cancelled) return;
        cancelled = true;
        parkedAgent.deliver(
          decisionMessage(correlationId, "rejected", APPROVAL_DROPPED_NOTICE),
        );
      };
      args.registerParkedCancel?.(cancelParked);

      const dropParked = (): void => {
        args.onDropped?.(APPROVAL_DROPPED_NOTICE);
        cancelParked();
      };

      try {
        const deliverDecision = async (
          message: InboundMessage,
        ): Promise<void> => {
          if (!stillCurrent()) return;
          if (args.deliver !== undefined) {
            await args.deliver(message, stillCurrent);
            return;
          }
          requireAgent().deliver(message);
        };

        // Turn-count watermark for the settled guard below: a "approval timed
        // out" tool result appended after this point means the reactor settled
        // this very correlation before our decision lands.
        const turnsAtSuspend = (await parkedAgent.history()).length;
        if (!stillCurrent()) {
          dropParked();
          return true;
        }

        if (approvalSnapshot === undefined) {
          // A suspension without a snapshot cannot be surfaced; fail closed by
          // rejecting the parked call so the run does not hang on an invisible
          // gate.
          args.registerParkedCancel?.(undefined);
          await deliverDecision(
            decisionMessage(
              correlationId,
              "rejected",
              "approval surface unavailable",
            ),
          );
          return true;
        }

        const request = requestFromApprovalSnapshot(
          approvalSnapshot,
          correlationId,
        );
        if (request === null) {
          args.registerParkedCancel?.(undefined);
          await deliverDecision(
            decisionMessage(
              correlationId,
              "rejected",
              "approval surface unavailable",
            ),
          );
          return true;
        }

        const outcome = await gate.resolveSuspended(request, stillCurrent);
        if (!stillCurrent()) {
          dropParked();
          return true;
        }
        args.registerParkedCancel?.(undefined);
        const history = await requireAgent().history();
        const parkedCallId =
          args.resolveParkedCallId?.(correlationId) ??
          parkedCallIdFromHistory(history, turnsAtSuspend, approvalSnapshot);
        if (settledAfterSuspend(history, turnsAtSuspend, parkedCallId)) {
          // The reactor already answered the parked call (its approval timeout
          // fired while the surface was still up). Delivering now would append
          // the raw decision JSON as an uncorrelated user turn — drop and log.
          logger.warn`late approval decision dropped correlation=${correlationId} outcome=${outcome?.allow === true ? "approved" : "rejected"}`;
          return true;
        }
        if (outcome === undefined || !outcome.allow) {
          await deliverDecision(
            decisionMessage(correlationId, "rejected", outcome?.message),
          );
          return true;
        }
        await deliverDecision(decisionMessage(correlationId, "approved"));
        return true;
      } finally {
        args.registerParkedCancel?.(undefined);
      }
    },
  };
}
