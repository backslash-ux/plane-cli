# Contributing

## Overview

This project is intended to be a clean, scriptable, open-source CLI for Plane, with a strong focus on AI-assisted and spec-driven development workflows. Contributions should preserve that bias toward discoverability, predictable output, and small end-to-end increments.

Participation in this project is also governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Security issues should be reported using the process in [SECURITY.md](./SECURITY.md), not filed as public bug reports.

## Before You Start

1. Read [README.md](./README.md) for setup and command usage.
2. If you are using an AI coding agent, read [AGENTS.md](./AGENTS.md) for the repo baseline context.
3. Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the code layout and boundaries.
4. Read [docs/PLAN.md](./docs/PLAN.md) and match your work to an existing plan item.

## Development Workflow

1. Start from a plan slice in [docs/PLAN.md](./docs/PLAN.md).
2. If the requested change is not represented yet, add the smallest useful plan item before or alongside implementation.
3. Keep the change scoped to one vertical slice when practical.
4. Update tests and user-facing docs together with code.
5. Update [docs/PLAN.md](./docs/PLAN.md) with implementation status, review status, touched files, and validation notes before finishing.

## Local Setup

```bash
bun install
bun run dev
```

Use Bun for all local work in this repository.

## Quality Gates

Run the narrowest relevant checks for the change:

```bash
bun test
bun run typecheck
```

Run the full shared checks when command behavior, schemas, or output behavior changes:

```bash
bun run check:all
```

`bun run check:all` is the closest thing to the repository gate. It covers type checking, formatting, file-size enforcement, and coverage-threshold validation.

## Code Conventions

- Keep CLI behavior in `src/commands/*.ts`.
- Route HTTP through `src/api.ts`.
- Validate API responses with `decodeOrFail` and schemas from `src/config.ts`.
- Reuse `src/resolve.ts` for project, issue, member, state, and label lookup logic.
- Preserve shared machine-readable output behavior in `src/output.ts`.
- Keep human-readable formatting in `src/format.ts`.
- Match the existing TypeScript style in `src/`: tabs, semicolons, and small explicit payload interfaces.
- Keep TypeScript files below the enforced 700-line limit.

## Testing Conventions

- Use Bun plus MSW for tests.
- Mock HTTP responses instead of calling real Plane endpoints.
- Set `PLANE_HOST`, `PLANE_WORKSPACE`, and `PLANE_API_TOKEN` in test setup.
- Clear `_clearProjectCache()` in tests when project resolution caching could affect behavior.

## Documentation Expectations

When the CLI surface changes, update the relevant public docs together:

- [README.md](./README.md) for installation and common usage.
- [AGENTS.md](./AGENTS.md) for public AI-agent contribution context.
- [CHANGELOG.md](./CHANGELOG.md) for notable user-facing changes.
- [SKILL.md](./SKILL.md) for AI-agent usage of the CLI.
- [docs/PLAN.md](./docs/PLAN.md) for implementation and review status.

## Release Notes

Maintainers should keep [CHANGELOG.md](./CHANGELOG.md) and [docs/RELEASING.md](./docs/RELEASING.md) aligned with the actual release process and publish workflow.

## Pull Request Checklist

- The change maps to a plan item in [docs/PLAN.md](./docs/PLAN.md).
- Tests or validation were run and recorded.
- Public docs were updated if behavior changed.
- No local-only AI/editor customization files were included in the diff.