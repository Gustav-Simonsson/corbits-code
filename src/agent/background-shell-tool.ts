import { type BackgroundShellExit } from "../shell/background-shell.js";
import type { SpillBlobWriter } from "../plugins/result-truncation-plugin.js";

export function createSpillingBackgroundShellExitNotifier(args: {
  getBlobWriter?: () => SpillBlobWriter | undefined;
  notify: (exit: BackgroundShellExit) => void;
}): (exit: BackgroundShellExit) => void {
  return (exit) => {
    void (async () => {
      // Truncated output spills to the session blob store so the completion
      // message can point at a readable tool-output:/// URI.
      let spillUri: string | undefined;
      if (exit.outputTruncated) {
        const writeBlob = args.getBlobWriter?.();
        if (writeBlob !== undefined) {
          const key = `bg-shell-${exit.id}`;
          await writeBlob(
            key,
            new TextEncoder().encode(exit.output),
            "text/plain",
          );
          spillUri = `tool-output:///${key}`;
        }
      }
      args.notify(spillUri !== undefined ? { ...exit, spillUri } : exit);
    })();
  };
}
