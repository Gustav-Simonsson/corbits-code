// Small, explicit tool allowlists for director packages.
// Prefer tools.allow at mount (CapabilityFilter include) over huge deny lists.
// manage_tasks is always mounted by runSubAgent after the filter — omit it here.
// skill_search + use_skill mount on every worker, scoped at mount to the
// union of attachedSkills and optionalSkills. ask_operator stays
// primary-session-only: workers never mount it (Do not #1).

/** Skill discovery + loading — mounted on every worker surface below. */
export const SKILL_TOOLS = ["skill_search", "use_skill"] as const;

/** Read/search/shell + skill tools — no product mutation. */
export const READ_TOOLS = [
  "read_file",
  "grep",
  "search_files",
  "list_dir",
  "lsp",
  "run_shell",
  "web_fetch",
  "web_search",
  ...SKILL_TOOLS,
] as const;

/**
 * Path mutation tools shared by closed directors. Review/explore/orchestrator
 * mount these path tools (lane discipline lives in prompts, not the
 * capability filter). delete is advertised on write surfaces, omitted from
 * READ_TOOLS only.
 */
export const PRODUCT_WRITE_TOOLS = [
  "write_file",
  "edit_file",
  "delete_file",
] as const;

/**
 * Build: read + full file mutation. Codex natives are not advertised and are
 * not mounted as extra AgentTools — hidden aliases dispatch onto run_shell /
 * manage_tasks when those engines are mounted.
 */
export const BUILD_TOOLS = [...READ_TOOLS, ...PRODUCT_WRITE_TOOLS] as const;

/**
 * Docs workers: read/search/lsp/web + file writes — no run_shell.
 * Envelope policy only: docs workers omit shell so they cannot mutate via the
 * terminal. There is no separate path-level lock on top of the tool envelope.
 *
 * Composed from READ_TOOLS minus run_shell so it tracks the read surface
 * automatically; path writes come from PRODUCT_WRITE_TOOLS.
 */
export const DOCS_TOOLS = [
  ...READ_TOOLS.filter((t) => t !== "run_shell"),
  ...PRODUCT_WRITE_TOOLS,
] as const;

/** Review / planner / explorer: read surface + path writes. */
export const REVIEW_TOOLS = [...READ_TOOLS, ...PRODUCT_WRITE_TOOLS] as const;

/**
 * Nested orchestrator surface (package filter): dispatch + path writes.
 * wait_agents is NOT here: TUI primary and nested orchestrators collect through
 * mailbox mail. Exec primary mounts it separately (mountWaitAgents) and extends
 * its advertised allow in resolveExecDirectorOverlay.
 */
export const ORCHESTRATOR_TOOLS = [
  ...READ_TOOLS,
  ...PRODUCT_WRITE_TOOLS,
  "spawn_agent",
  "list_agents",
  "close_agent",
  "resume_agent",
  "interrupt_agent",
  "send_input",
  "read_agent_trace",
] as const;

/** Dispatch primary: orchestrator surface plus fleet discovery (Tier-1 only). */
export const DISPATCH_TOOLS = [...ORCHESTRATOR_TOOLS, "search_agents"] as const;

/** Legacy alias for backwards compatibility during migration. */
export const SKYWALKER_TOOLS = DISPATCH_TOOLS;
