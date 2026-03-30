# Architecture Overview

## Goal

The Plane CLI is structured to keep Plane workflows scriptable, discoverable, and safe for both humans and AI agents. Commands should mirror Plane concepts closely and avoid forcing users to depend on hidden IDs or UI-only context.

## Execution Flow

The CLI starts in `bin/plane`, initializes runtime wiring in `src/bin.ts`, and registers subcommands in `src/app.ts`.

## Main Boundaries

### Command Layer

- `src/commands/*.ts`
- Defines CLI args and options with `@effect/cli`.
- Implements command handlers with `Effect.gen(function* () { ... })`.
- Owns user-facing command descriptions and examples.

### API Layer

- `src/api.ts`
- Centralizes HTTP access, configuration loading, and response handling.
- Includes intentional lenient JSON parsing for Plane responses that may contain bare control characters inside HTML fields.

### Schema Layer

- `src/config.ts`
- Defines Effect schemas used to validate API responses.
- New API integrations should decode responses here instead of passing untyped payloads deeper into the CLI.

### Resolution Layer

- `src/resolve.ts`
- Handles project resolution, issue reference parsing, and common ID lookup flows.
- Includes process-local project caching used across commands.

### Output And Formatting

- `src/output.ts` owns shared `--json` and `--xml` behavior.
- `src/format.ts` owns human-readable formatting helpers.

## Design Principles

- Prefer discoverable workflows. If a command needs a UUID, the CLI should also expose a list or get path that helps users obtain it.
- Preserve shared output behavior rather than inventing command-specific machine formats.
- Keep changes small and vertical so docs, tests, and command behavior stay aligned.
- Favor explicit validation over implicit assumptions when consuming the Plane API.

## Testing Model

- Tests live in `tests/`.
- The project uses Bun's test runner plus MSW.
- Tests should mock HTTP interactions and avoid real user configuration.

## Planning Model

Non-trivial work should start from [docs/PLAN.md](./PLAN.md). The plan tracks the slice being implemented, what changed, and whether the work has only been validated or fully reviewed.