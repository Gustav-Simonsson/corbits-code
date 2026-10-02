---
name: corbits-ui-apps
description: Build agent UIs with @corbits/react-ui and find the reference apps (workbench, Solution Builder) that show everything wired together. Load when building a chat, run, or approval UI.
user-invocable: false
---

# Corbits UI and reference apps

## `@corbits/react-ui`

Props in, markup out React components for agent products. They fetch nothing: you pass data from your hub client. Tailwind v4 theme. Stateful modules are marked `"use client"`.

```tsx
import "@corbits/react-ui/styles.css";
import { ThemeProvider, ChatThread } from "@corbits/react-ui";

<ThemeProvider>
  <ChatThread messages={messages} identity={{ name: "Scout" }} />
</ThemeProvider>;
```

- CSS: import `styles.css` once (includes preflight), or `theme.css` if you already run Tailwind v4. Never both. Fonts are not bundled. Dark mode is the `.dark` class.
- Message parts are `{ type: "text" | "reasoning" | "tool", ... }`. Roles are `user`, `agent`, and `system`, and parts also include `file`. A tool part carries `toolCallId`, `toolName`, `label`, `state`, `output`.
- Components: chat (`ChatThread`, `ChatComposer`, `ToolBlock`, `ReasoningBlock`), runs (`ApprovalCard`, `GateBlock`, `StepList`, `LiveRunBanner`, `TraceWaterfall`), artifacts (`ArtifactBody`, `CsvTable`), charts, and layout shells.
- Dialog, menu, tooltip, toast, and command palette live on subpaths (`ui/dialog`, `ui/menu`, ...) because they need optional peers (Radix, sonner).
- Needs React 18.2+ or 19.

Feed it from your own typed hub client (`use_skill interchange-hub-setup`; `@intx/hub-client` is private) and the hub libraries (`use_skill corbits-hub-libs`). For chat data, `use_skill interchange-chat`.

## Reference apps (private, read them, do not depend on them)

- **workbench** (`corbitsdev/workbench`): a multiplayer workspace for people and agents, built on Corbits. `apps/hub` composes every hub library (see `server.ts` and `migrate.ts`), `apps/web` is the React client, `apps/sidecar` is the execution host. It pins older git SHAs of some libraries, so when a call differs from a library README, trust the README. Run with Bun plus Postgres 17 with pgvector: `bun install`, copy `.env.example`, `bun run dev`.
- **Solution Builder** (`corbitsdev/corbits-solution-builder`): a desktop app (Tauri over a local Bun host) that takes a problem to shipped software through nine human-gated stages, using Interchange as an embedded or remote hub. It is the reference client-driven app: the app owns first-run setup (owner account, tenants, grants, provider credentials, workflow assets, deploys) through `packages/installer` over a stock hub, and `packages/embed-hub` runs that hub in process on pglite. Start there (`use_skill interchange-hub-setup`, `use_skill interchange-embed-hub`). Stage 8 (bounded build), delivery evidence, and signing are unfinished. `solutions-builder-alpha` is an older snapshot.

## Need more

- An app that sets up and drives its own hub: `use_skill interchange-client-apps`. Hosting the hub: `use_skill interchange-embed-hub`. Chat and run status: `use_skill interchange-chat`.
- Mounting the libraries the UI reads from: `use_skill corbits-hub-libs`.
- Catalog: `use_skill corbits`.
