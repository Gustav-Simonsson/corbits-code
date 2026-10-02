import type { BackgroundShellExit } from "./background-shell.js";

/** Collects `onExit` deliveries so tests can await one shell's completion. */
export function createExitRecorder(): {
  onExit: (exit: BackgroundShellExit) => void;
  waitFor: (id: string, timeoutMs?: number) => Promise<BackgroundShellExit>;
} {
  const exits = new Map<string, BackgroundShellExit>();
  return {
    onExit: (exit) => {
      exits.set(exit.id, exit);
    },
    waitFor: async (id, timeoutMs = 5_000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const exit = exits.get(id);
        if (exit !== undefined) return exit;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(
        `no exit delivered for shell ${id} within ${timeoutMs}ms`,
      );
    },
  };
}
