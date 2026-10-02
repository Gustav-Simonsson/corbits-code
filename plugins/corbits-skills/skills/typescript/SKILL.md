---
name: typescript
description: How we write TypeScript and verify it. Load when writing TypeScript.
user-invocable: false
---

# TypeScript

Five rules. Everything else follows the repo's existing code and `AGENTS.md`.

## 1. Types are real

Use `unknown` and narrow, never `any`. No `as Type` and no `x!`: both hide an interface problem and give no runtime safety. Let the compiler infer what it can, and use `import type` for type-only imports.

## 2. Validate at the boundary

Validate external data (fetch, filesystem, env, user input) once, where it enters, with the repo's validation library. Check the result before using it, and trust the typed value everywhere inside:

```typescript
const payload = parsePayload(input);
if (isValidationError(payload)) {
  logger.debug(`couldn't validate payload: ${payload.summary}`);
  return sendBadRequest();
}
```

## 3. Functions, named exports, real names

Factory functions (`create*`) over classes. Named exports only, no default exports, no file extensions in imports unless the runtime requires them. Modules are lowercase with hyphens, tests are `{name}.test.ts`. Acronyms keep their case (`URL`, `JSONSchema`, `parseHTTPHeaders`); `ID` is an abbreviation (`userId`).

## 4. Errors keep their cause

Re-throw with `{ cause }`. A handler that does not own a request returns `null` so another can try. Use the logger, not `console.log`.

```typescript
try {
  transaction = parseTransaction(input);
} catch (cause) {
  throw new Error("Failed to parse transaction", { cause });
}
```

## 5. Tests prove behavior

Use `bun:test`. Test the logic that is yours (domain rules, error paths, edge cases), not the libraries you call. Inject time instead of sleeping, and land the test in the same commit as the code:

```typescript
import { expect, test } from "bun:test";

test("entry expires after maxAge", () => {
  let now = 0;
  const cache = createCache({ maxAge: 1000, now: () => now });
  cache.set("key", 42);
  now += 1500;
  expect(cache.get("key")).toBeUndefined();
});
```
