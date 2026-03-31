# AGENTS.md

This file provides baseline context for AI coding agents contributing to this repository. It is public, versioned, and intended to be shared across contributors and tools.

## Project Goal

This repository builds an agent-friendly CLI for Plane, especially for project-defined and spec-driven workflows. Changes should improve predictability, discoverability, and structured automation instead of adding one-off behaviors that are hard for humans or agents to compose.

## Start Here

Before making non-trivial changes:

1. Read [README.md](./README.md) for installation and user-facing command expectations.
2. Read [CONTRIBUTING.md](./CONTRIBUTING.md) for workflow and quality gates.
3. Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for code boundaries.
4. Check GitHub issues and pull requests for related work before starting a non-trivial change.

## Workflow Expectations

- Keep changes scoped to one useful vertical slice when practical.
- Treat GitHub issues and pull requests as the public work-tracking system for this repository.
- When command behavior changes, keep user-facing docs aligned: [README.md](./README.md), [SKILL.md](./SKILL.md), and any relevant plan or release notes.
- Prefer public repository guidance over local-only editor customizations. Maintainers may keep private planning notes in `.vscode/docs/`, but those are not the source of truth for contributors.

## Technical Boundaries

- CLI entry flow: `bin/plane` -> `src/bin.ts` -> `src/app.ts`.
- Command behavior belongs in `src/commands/*.ts`.
- Route HTTP through `src/api.ts`.
- Validate API responses with `decodeOrFail` and schemas from `src/config.ts`.
- Reuse `src/resolve.ts` for project, issue, member, state, and label lookup flows.
- Keep human-readable formatting in `src/format.ts` and shared machine-readable output behavior in `src/output.ts`.

## Design Principles

- Prefer discoverable workflows. If a command depends on UUIDs or join IDs, the CLI should expose a list or get path that helps agents obtain them.
- Preserve shared `--json` and `--xml` behavior instead of inventing per-command machine formats.
- Keep Plane concepts explicit and close to the underlying API domain.
- Fix root causes instead of layering on ad hoc patches when practical.

## Testing And Validation

- Use Bun for local work.
- Run the narrowest relevant tests plus `bun run typecheck`.
- Use `bun run check:all` when shared command behavior, schemas, output formatting, or repo-wide quality gates are affected.
- Tests use Bun plus MSW. Prefer mocked HTTP responses over real Plane endpoints.
- Clear `_clearProjectCache()` in tests when cached project resolution could affect results.

## Open Source Hygiene

- Keep public documentation presentable and accurate.
- Use [CHANGELOG.md](./CHANGELOG.md) for notable user-facing changes.
- Follow [docs/RELEASING.md](./docs/RELEASING.md) for release workflow expectations.
- Respect [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) and [SECURITY.md](./SECURITY.md).

## Known Deployment Compatibility

The CLI has been validated against a real Plane instance. Be aware of these deployment-dependent behaviors when developing or testing:

- **Pages**: The CLI targets the project-page API surface. Plane also has a separate workspace wiki page surface that the CLI does not cover. Both may return 404 on some deployments even when the project feature flag is enabled.
- **Worklogs**: Time tracking is a Pro-plan feature. Non-Pro deployments will not expose worklog API endpoints.
- **Feature gating**: The CLI returns explicit compatibility errors (not raw 404s) when a project feature is flagged on but the backing API route is absent.
- **Missing CLI commands**: `labels delete` and `modules delete` are not yet implemented. Use the Plane REST API directly for these operations.

<!-- plane-cli local project context start -->
## Plane Project Context
This directory is scoped to Plane project PLANECLI (Plane CLI).

When working as an AI agent in this directory:
- Read `./.plane/project-context.json` before planning or applying Plane project changes.
- Reuse the existing states, labels, and estimate points in that snapshot instead of creating duplicates.
- Respect the feature flags in that snapshot before using cycles, modules, pages, intake, or estimates.
- Prefer the `plane` CLI from this repository root for Plane project work instead of direct API calls.
- Use `@current` as the default project selector once local init has been run.
- If the shell may contain inherited `PLANE_*` variables, clear them before relying on `./.plane/config.json`.

Common agent commands:

```sh
unset PLANE_HOST PLANE_WORKSPACE PLANE_API_TOKEN PLANE_PROJECT
plane projects current
plane issues list @current
plane issue get PLANECLI-12
plane issue update --state started PLANECLI-12
```

- Rerun `plane init --local` from this directory whenever the Plane project configuration changes so this context stays current.

This section is managed by `plane-cli` and is updated by `plane init --local`.
<!-- plane-cli local project context end -->
