# Contributing

## Overview

This project is intended to be a clean, scriptable, open-source CLI for Plane, with a strong focus on AI-assisted and spec-driven development workflows. Contributions should preserve that bias toward discoverability, predictable output, and small end-to-end increments.

Participation in this project is also governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Security issues should be reported using the process in [SECURITY.md](./SECURITY.md), not filed as public bug reports.

## Before You Start

1. Read [README.md](./README.md) for setup and command usage.
2. If you are using an AI coding agent, read [AGENTS.md](./AGENTS.md) for the repo baseline context.
3. Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the code layout and boundaries.
4. Check existing GitHub issues and pull requests to understand whether the work is already proposed, in progress, or intentionally deferred.

## Development Workflow

1. Start from a GitHub issue or open one before beginning non-trivial work.
2. Keep the change scoped to one useful vertical slice when practical.
3. Update tests and user-facing docs together with code.
4. Reference the related issue or discussion in your pull request.
5. Record notable user-facing changes in [CHANGELOG.md](./CHANGELOG.md) when appropriate.

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

## Release Notes

Maintainers should keep [CHANGELOG.md](./CHANGELOG.md) and [docs/RELEASING.md](./docs/RELEASING.md) aligned with the actual release process and publish workflow.

## Pull Request Checklist

- The change links to a related GitHub issue, discussion, or clearly explains why one is not needed.
- Tests or validation were run and recorded.
- Public docs were updated if behavior changed.
- No local-only AI/editor customization files were included in the diff.