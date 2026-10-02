import { describe, expect, test } from "bun:test";
import {
  buildWorkerContract,
  buildWorkerToolNames,
  type WorkerContractOptions,
} from "./worker-contract.js";
import { buildSubAgentReportContract } from "./prompts.js";

const VARIANTS: WorkerContractOptions[] = [
  {},
  { askDirector: true },
  { orchestrator: true },
  { askDirector: true, orchestrator: true },
];

describe("buildWorkerContract", () => {
  test("report envelope is byte-identical to buildSubAgentReportContract", () => {
    for (const opts of VARIANTS) {
      const askDirector = opts.askDirector === true;
      expect(
        buildWorkerContract(opts).endsWith(
          buildSubAgentReportContract({ askDirector }),
        ),
      ).toBe(true);
    }
  });

  test("contract stays lean (<= ~2.2k chars in every variant)", () => {
    for (const opts of VARIANTS) {
      expect(buildWorkerContract(opts).length).toBeLessThanOrEqual(2200);
    }
  });

  test("ask rule names ask_director only when mounted", () => {
    const withAsk = buildWorkerContract({ askDirector: true });
    expect(withAsk).toContain("ask_director");
    expect(withAsk).toContain("cannot reach the operator");
    const withoutAsk = buildWorkerContract({ askDirector: false });
    expect(withoutAsk).not.toContain("ask_director");
    expect(withoutAsk).toContain("best-judgment");
  });

  test("default worker is told not to spawn, not granted spawn_agent", () => {
    const contract = buildWorkerContract({ askDirector: true });
    expect(contract).toContain("Do not spawn agents");
    expect(contract).not.toContain("You may spawn_agent");
  });

  test("orchestrator variant grants spawn_agent without mailbox copy", () => {
    const contract = buildWorkerContract({
      askDirector: true,
      orchestrator: true,
    });
    expect(contract).toContain("You may spawn_agent");
    expect(contract).not.toContain("Do not spawn agents");
    expect(contract).not.toContain("mailbox");
  });
});

describe("buildWorkerToolNames", () => {
  test("lists names only, no catalog summaries", () => {
    const listed = buildWorkerToolNames(["read_file", "ask_director"]);
    expect(listed).toBe("Tools (names only): read, ask_director");
    expect(listed).not.toContain("cat/head/tail");
  });

  test("projects mounted engine names onto advertised wire names", () => {
    expect(
      buildWorkerToolNames(["read_file", "run_shell", "search_files", "grep"]),
    ).toBe("Tools (names only): read, bash, glob, grep");
  });
});
