import { describe, expect, test } from "bun:test";
import type { InboundMessage } from "@intx/types/runtime";
import {
  applyReconnectRecoverySelection,
  buildReconnectCommand,
  createReconnectRecoveryPresenter,
  createReconnectRecoveryState,
  parseConnectScopeArgs,
  reconnectRecoveryItemId,
  reconnectRecoveryItemLabel,
  type ReconnectScope,
} from "./reconnect-recovery.js";

function operatorMessage(): InboundMessage {
  return {
    ref: { uid: 1, mailbox: "INBOX" },
    headers: {
      from: "user@local",
      to: ["agent@local"],
      date: "2026-09-26T00:00:00.000Z",
      messageId: "<original@local>",
      interchangeType: "conversation.message",
    },
    flags: ["operator-originated"],
    signatureStatus: "missing",
    content: "inspect this",
  };
}

function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`expected ${label}`);
  return value;
}

function credentialFailure(providerId: string) {
  return {
    type: "inference.error",
    data: {
      error: { category: "credential_failure", message: "401", providerId },
    },
  };
}

function credentialRetry() {
  return {
    type: "inference.retry",
    data: {
      previousError: { category: "credential_failure", message: "401" },
    },
  };
}

describe("reconnect recovery accept gate", () => {
  test("arms for reconnect-class failures with a valid scope split", () => {
    const state = createReconnectRecoveryState();
    const attempt = state.begin(operatorMessage(), "xai");
    state.observe(attempt, credentialRetry());
    state.observe(attempt, credentialFailure("xai/default-2"));
    const pending = required(state.settle(attempt), "pending recovery");
    expect(pending.failedProvider).toBe("xai/default-2");
    expect(pending.scope).toEqual({ kind: "xai", profile: "default-2" });
    expect(pending.message.content).toBe("inspect this");
    expect(pending.committed).toBe(false);
  });

  test("does not arm without the retry, for non-credential terminals, or non-OAuth ids", () => {
    const state = createReconnectRecoveryState();
    const oneFailure = state.begin(operatorMessage(), "xai");
    state.observe(oneFailure, credentialFailure("xai/default-2"));
    expect(state.settle(oneFailure)).toBeNull();

    const fatal = state.begin(operatorMessage(), "xai");
    state.observe(fatal, credentialRetry());
    state.observe(fatal, {
      type: "inference.error",
      data: { error: { category: "fatal", message: "boom" } },
    });
    expect(state.settle(fatal)).toBeNull();

    const apiKey = state.begin(operatorMessage(), "custom");
    state.observe(apiKey, credentialRetry());
    state.observe(apiKey, credentialFailure("custom"));
    expect(state.settle(apiKey)).toBeNull();
  });

  test("cancel consumes the matching generation without reconnecting or replaying", () => {
    const state = createReconnectRecoveryState();
    const attempt = state.begin(operatorMessage(), "xai");
    state.observe(attempt, credentialRetry());
    state.observe(attempt, credentialFailure("xai/default-2"));
    const pending = required(state.settle(attempt), "pending recovery");
    expect(state.cancel(pending.generation)).toBe(true);
    expect(
      state.accept(pending.generation, reconnectRecoveryItemId(pending.scope)),
    ).toEqual({ kind: "stale" });
  });

  test("accept consumes once, validates generation + id, and vetoes replay after commitment", () => {
    const state = createReconnectRecoveryState();
    const first = state.begin(operatorMessage(), "xai");
    state.observe(first, credentialRetry());
    state.observe(first, credentialFailure("xai/default-2"));
    const pending = required(state.settle(first), "pending recovery");

    expect(
      state.accept(
        pending.generation + 1,
        reconnectRecoveryItemId(pending.scope),
      ),
    ).toEqual({ kind: "stale" });
    // A foreign id is invalid — and, like the sibling picker, consumes the
    // pending offer so a wrong profile can never re-key the failed one.
    expect(state.accept(pending.generation, "model:other/model")).toEqual({
      kind: "invalid",
    });

    const second = state.begin(operatorMessage(), "xai");
    state.observe(second, credentialRetry());
    state.observe(second, credentialFailure("xai/default-2"));
    const pending2 = required(state.settle(second), "pending recovery");
    expect(pending2.scope).toEqual(pending.scope);
    expect(
      state.accept(
        pending2.generation,
        reconnectRecoveryItemId(pending2.scope),
      ),
    ).toEqual({
      kind: "accepted",
      generation: pending2.generation,
      scope: pending2.scope,
      replay: true,
    });
    expect(
      state.accept(
        pending2.generation,
        reconnectRecoveryItemId(pending2.scope),
      ),
    ).toEqual({ kind: "stale" });

    const committed = state.begin(operatorMessage(), "xai");
    state.observe(committed, credentialRetry());
    state.observe(committed, { type: "inference.tool-call", data: {} });
    state.observe(committed, credentialFailure("xai/default-2"));
    const committedPending = required(state.settle(committed), "committed");
    expect(
      state.accept(
        committedPending.generation,
        reconnectRecoveryItemId(committedPending.scope),
      ),
    ).toEqual({
      kind: "accepted",
      generation: committedPending.generation,
      scope: committedPending.scope,
      replay: false,
    });
  });
});

describe("reconnect recovery selection", () => {
  test("reconnects the failed scope and replays only after success", () => {
    const state = createReconnectRecoveryState();
    const attempt = state.begin(operatorMessage(), "xai");
    state.observe(attempt, credentialRetry());
    state.observe(attempt, credentialFailure("xai/default-2"));
    const pending = required(state.settle(attempt), "pending recovery");

    const seen: string[] = [];
    let armed: number | null = null;
    const delivered: InboundMessage[] = [];
    let completeReconnect: ((connected: boolean) => void) | undefined;
    const outcome = applyReconnectRecoverySelection({
      state,
      generation: pending.generation,
      selectedId: reconnectRecoveryItemId(pending.scope),
      reconnect: (scope, onComplete) => {
        seen.push(`${scope.kind}/${scope.profile}`);
        completeReconnect = onComplete;
      },
      armContinuation: (generation) => {
        armed = generation;
      },
      cancelContinuation: () => {
        throw new Error("should not cancel");
      },
      deliverContinuation: (message) => {
        delivered.push(message);
      },
    });
    expect(outcome).toBe("reconnected");
    expect(seen).toEqual(["xai/default-2"]);
    expect(armed).toBeNull();
    expect(delivered).toEqual([]);
    completeReconnect?.(true);
    expect(armed ?? -1).toBe(pending.generation);
    expect(delivered).toHaveLength(1);
    completeReconnect?.(true);
    expect(delivered).toHaveLength(1);
  });

  test("cancel, failure, and committed attempts never replay", () => {
    for (const connected of [false, true]) {
      const state = createReconnectRecoveryState();
      const attempt = state.begin(operatorMessage(), "xai");
      state.observe(attempt, credentialRetry());
      if (connected) {
        state.observe(attempt, { type: "inference.tool-call", data: {} });
      }
      state.observe(attempt, credentialFailure("xai/default-2"));
      const pending = required(state.settle(attempt), "pending recovery");
      let completeReconnect: ((result: boolean) => void) | undefined;
      applyReconnectRecoverySelection({
        state,
        generation: pending.generation,
        selectedId: reconnectRecoveryItemId(pending.scope),
        reconnect: (_scope, onComplete) => {
          completeReconnect = onComplete;
        },
        armContinuation: () => {
          throw new Error("should not arm");
        },
        cancelContinuation: () => undefined,
        deliverContinuation: () => {
          throw new Error("should not deliver");
        },
      });
      completeReconnect?.(connected);
    }
  });

  test("reconnect failure and stale generations never arm a continuation", () => {
    const state = createReconnectRecoveryState();
    expect(
      applyReconnectRecoverySelection({
        state,
        generation: 42,
        selectedId: "reconnect:xai/default-2",
        reconnect: () => undefined,
        armContinuation: () => {
          throw new Error("should not arm");
        },
        cancelContinuation: () => undefined,
        deliverContinuation: () => undefined,
      }),
    ).toBe("stale");

    const attempt = state.begin(operatorMessage(), "xai");
    state.observe(attempt, credentialRetry());
    state.observe(attempt, credentialFailure("xai/default-2"));
    const pending = required(state.settle(attempt), "pending recovery");
    expect(
      applyReconnectRecoverySelection({
        state,
        generation: pending.generation,
        selectedId: reconnectRecoveryItemId(pending.scope),
        reconnect: () => {
          throw new Error("browser closed");
        },
        armContinuation: () => {
          throw new Error("should not arm");
        },
        cancelContinuation: () => undefined,
        deliverContinuation: () => undefined,
      }),
    ).toBe("reconnect-failed");
  });
});

describe("reconnect recovery presenter (runTUI wiring)", () => {
  function settleArmed() {
    const recovery = createReconnectRecoveryState();
    const attempt = recovery.begin(operatorMessage(), "xai");
    recovery.observe(attempt, credentialRetry());
    recovery.observe(attempt, credentialFailure("xai/default-2"));
    return {
      recovery,
      pending: required(recovery.settle(attempt), "pending recovery"),
    };
  }

  function wirePresenter(options?: {
    dialogOpens?: boolean;
    directorMissing?: boolean;
    reconnectOpens?: boolean;
  }) {
    const dialogOpens = options?.dialogOpens ?? true;
    const { recovery, pending } = settleArmed();
    type ReconnectDialog = {
      scope: ReconnectScope;
      onAccept: (id: string) => void;
      onCancel: () => void;
    };
    const dialogs: ReconnectDialog[] = [];
    const reconnected: ReconnectScope[] = [];
    let completeReconnect: ((connected: boolean) => void) | undefined;
    const armed: number[] = [];
    const cancelled: number[] = [];
    const delivered: InboundMessage[] = [];
    const present = createReconnectRecoveryPresenter({
      recovery,
      openDialog: (next) => {
        dialogs.push(next);
        return dialogOpens;
      },
      openReconnect: (scope, onComplete?: (connected: boolean) => void) => {
        reconnected.push(scope);
        completeReconnect = onComplete;
        return options?.reconnectOpens ?? true;
      },
      readDirector: () =>
        options?.directorMissing === true
          ? undefined
          : {
              armCredentialRecoveryContinuation: (generation: number) => {
                armed.push(generation);
              },
              cancelCredentialRecoveryContinuation: (generation: number) => {
                cancelled.push(generation);
              },
            },
      deliverContinuation: (message) => {
        delivered.push(message);
      },
    });
    present(pending);
    const dialog = dialogs.at(0);
    if (dialog === undefined) throw new Error("expected open dialog");
    return {
      recovery,
      pending,
      dialog,
      reconnected,
      completeReconnect: (connected: boolean) => completeReconnect?.(connected),
      armed,
      cancelled,
      delivered,
    };
  }

  test("accept waits for a successful re-key before replaying the turn once", () => {
    const wired = wirePresenter();
    expect(wired.dialog.scope).toEqual(wired.pending.scope);
    wired.dialog.onAccept(reconnectRecoveryItemId(wired.pending.scope));
    expect(wired.reconnected).toEqual([wired.pending.scope]);
    expect(wired.armed).toEqual([]);
    expect(wired.delivered).toEqual([]);

    wired.completeReconnect(true);
    expect(wired.armed).toEqual([wired.pending.generation]);
    expect(wired.cancelled).toEqual([]);
    // The continuation message carries a build-time timestamp, so pin the
    // stable replay-binding fields rather than the whole message.
    const continuation = wired.delivered.at(0);
    if (continuation === undefined) throw new Error("expected continuation");
    expect(wired.delivered).toHaveLength(1);
    expect(continuation.headers.messageId).toBe(
      `credential-recovery-${wired.pending.generation}@local`,
    );
    expect(continuation.headers.interchangeCorrelationId).toBe(
      String(wired.pending.generation),
    );
    wired.completeReconnect(true);
    expect(wired.armed).toEqual([wired.pending.generation]);
    expect(wired.delivered).toHaveLength(1);
    // The generation is consumed: a late cancel is a no-op.
    expect(wired.recovery.cancel(wired.pending.generation)).toBe(false);
  });

  test("dismiss cancels the generation without reconnecting or arming", () => {
    const wired = wirePresenter();
    wired.dialog.onCancel();
    expect(wired.reconnected).toEqual([]);
    expect(wired.armed).toEqual([]);
    expect(wired.delivered).toEqual([]);
    expect(wired.recovery.cancel(wired.pending.generation)).toBe(false);
  });

  test("closed dialog cancels the generation without reconnecting", () => {
    const wired = wirePresenter({ dialogOpens: false });
    expect(wired.reconnected).toEqual([]);
    expect(wired.armed).toEqual([]);
    expect(wired.delivered).toEqual([]);
    expect(wired.recovery.cancel(wired.pending.generation)).toBe(false);
  });

  test("unavailable reconnect surface never arms a continuation", () => {
    const wired = wirePresenter({ reconnectOpens: false });
    wired.dialog.onAccept(reconnectRecoveryItemId(wired.pending.scope));
    expect(wired.reconnected).toEqual([wired.pending.scope]);
    expect(wired.armed).toEqual([]);
    expect(wired.delivered).toEqual([]);
  });

  test("missing director cancels without reconnecting or throwing", () => {
    const wired = wirePresenter({ directorMissing: true });
    expect(() =>
      wired.dialog.onAccept(reconnectRecoveryItemId(wired.pending.scope)),
    ).not.toThrow();
    expect(wired.reconnected).toEqual([]);
    expect(wired.armed).toEqual([]);
    expect(wired.delivered).toEqual([]);
    expect(wired.recovery.cancel(wired.pending.generation)).toBe(false);
  });

  test("a foreign row id never re-keys the wrong profile", () => {
    const wired = wirePresenter();
    wired.dialog.onAccept("reconnect:other/profile");
    expect(wired.reconnected).toEqual([]);
    expect(wired.armed).toEqual([]);
    expect(wired.delivered).toEqual([]);
  });
});

describe("reconnect descriptor", () => {
  test("single row id/label spell the failed kind/profile", () => {
    const scope = { kind: "xai", profile: "default-2" };
    expect(reconnectRecoveryItemId(scope)).toBe("reconnect:xai/default-2");
    expect(reconnectRecoveryItemLabel(scope)).toBe(
      'Reconnect xai/default-2 — re-authenticate "default-2"',
    );
    expect(buildReconnectCommand(scope)).toBe("/connect xai default-2");
  });

  test("/connect args parse to a kind/profile scope, defaulting the profile", () => {
    expect(parseConnectScopeArgs("xai default-2")).toEqual({
      kind: "xai",
      profile: "default-2",
    });
    expect(parseConnectScopeArgs("xai")).toEqual({
      kind: "xai",
      profile: "default",
    });
    expect(parseConnectScopeArgs("")).toBeUndefined();
    expect(parseConnectScopeArgs("a b c")).toBeUndefined();
    expect(parseConnectScopeArgs("xai; rm")).toBeUndefined();
  });
});
