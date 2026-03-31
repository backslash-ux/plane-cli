# plane

[![CI](https://github.com/backslash-ux/plane-cli-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/backslash-ux/plane-cli-cli/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

CLI for the [Plane](https://plane.so) project management API.

Built for both human operators and AI agents that need predictable, scriptable, discoverable workflows around Plane projects, issues, cycles, modules, pages, and related resources.

## Upstream Attribution

This repository is a fork of [aaronshaf/plane-cli](https://github.com/aaronshaf/plane-cli) and continues that work under the terms of the MIT license. The upstream project remains the original source for the codebase lineage; this fork carries its own roadmap, planning, and maintenance workflow.

## Why This Exists

- Keep Plane workflows available from the terminal instead of requiring UI navigation.
- Give AI agents stable command grammar and structured output with `--json` and `--xml`.
- Favor discoverable flows so agents can obtain required IDs from the CLI instead of guessing hidden values.

## Highlights

- Bun-based CLI with `@effect/cli` command structure.
- Structured machine-readable output for list commands.
- Project and issue workflows designed for agent composition.
- Strict schema validation and mocked API tests.

## Requirements

- [Bun](https://bun.sh) runtime

## Installation

```bash
curl -fsSL https://bun.sh/install | bash
bun install -g @backslash-ux/plane-cli
```

## Setup

```bash
plane init -g
```

Prompts for your Plane host, workspace, and API token. Global setup saves to `~/.config/plane/config.json` (mode 0600). Safe to re-run.
It also offers an optional current-project selection so repeated project-scoped commands can reuse the same context.

For path-local overrides in the current project directory:

```bash
plane init --local
plane . init
```

Local setup writes `./.plane/config.json`. When the CLI runs, it resolves config with this precedence:

```text
environment variables > nearest .plane/config.json > ~/.config/plane/config.json
```

The local config is discovered from the current working directory upward, so a config written at the repo root applies inside nested folders unless a deeper `.plane/config.json` overrides it.
When you run `plane init --local`, the CLI also reads the project's feature flags from Plane and reports which project-scoped features are actually enabled. Cycles, modules, pages, and intake commands return explicit feature-disabled errors when the project has them turned off.
It also writes `.plane/project-context.json`, a machine-readable helper snapshot of the project's existing states, labels, and estimate points so agents can reuse what already exists instead of inventing duplicates.
If `AGENTS.md` already exists in that directory, `plane init --local` appends a managed Plane project context section at the bottom without removing the existing content. If it does not exist, the CLI creates it. The managed section points agents at `.plane/project-context.json`, tells them to prefer the repo-local `plane` CLI for Plane work, and includes a small command pattern for clearing inherited `PLANE_*` overrides before using the local config.

You can also use environment variables (override saved config):

```
PLANE_API_TOKEN=...
PLANE_HOST=https://plane.so
PLANE_WORKSPACE=myworkspace
PLANE_PROJECT=PROJ               # optional saved-project override
```

To persist a current project after setup:

```bash
plane projects list
plane projects use PROJ
plane projects use PROJ --local
plane projects use PROJ --global
plane projects current
```

When a local config is active in the current path, `plane projects use PROJ` writes there by default; otherwise it writes to global config. Once a current project is saved, list-style commands such as `plane issues list`, `plane cycles list`, `plane modules list`, `plane pages list`, `plane states list`, `plane labels list`, and `plane intake list` can omit the project argument. Other project-scoped commands can use `@current` instead of repeating the identifier.

Project-scoped feature availability still depends on the target Plane project. On deployments where a feature is flagged on but the backing API is unavailable, the CLI returns an explicit compatibility error instead of a raw backend `404`.

**Known deployment dependencies:**

- **Pages**: The CLI targets the project-page API surface (`/projects/{id}/pages/`). Some Plane deployments do not expose page endpoints even when the project feature flag is present. Additionally, Plane has a separate workspace wiki page surface that the CLI does not cover.
- **Worklogs**: Time tracking is a Pro-plan feature. Non-Pro deployments will return compatibility errors for worklog commands.

## Common Commands

```bash
# Projects
plane projects list
plane projects use PROJ
plane projects use PROJ --local
plane projects current

# Issues
plane issues list
plane issues list PROJ
plane issues list PROJ --state started
plane issue get PROJ-29
plane issue create PROJ "Title"
plane issue create @current "Title"
plane issue update --state completed --priority high PROJ-29
plane issue delete PROJ-29

# Comments
plane issue comments list PROJ-29
plane issue comment PROJ-29 "text"
plane issue comments update PROJ-29 COMMENT_ID "new text"
plane issue comments delete PROJ-29 COMMENT_ID

# Links
plane issue link list PROJ-29
plane issue link add --title "title" PROJ-29 https://example.com
plane issue link remove PROJ-29 LINK_ID

# Activity
plane issue activity PROJ-29

# Worklogs
plane issue worklogs list PROJ-29
plane issue worklogs add PROJ-29 90
plane issue worklogs add --description "standup" PROJ-29 30

# Cycles
plane cycles list PROJ
plane cycles issues list PROJ CYCLE_ID
plane cycles issues add PROJ CYCLE_ID PROJ-29

# Modules
plane modules list PROJ
plane modules delete PROJ MODULE_ID
plane modules issues list PROJ MODULE_ID
plane modules issues add PROJ MODULE_ID PROJ-29
plane modules issues remove PROJ MODULE_ID MODULE_ISSUE_ID

# Intake
plane intake list PROJ
plane intake accept PROJ INTAKE_ID
plane intake reject PROJ INTAKE_ID

# Pages
plane pages list PROJ
plane pages get PROJ PAGE_ID

# States, labels, members
plane states list PROJ
plane labels list PROJ
plane labels delete PROJ bug
plane members list
```

Project identifiers: short strings like `PROJ`, `WEB`. Issue refs: `PROJ-29`, `WEB-5`.

State groups: `backlog` | `unstarted` | `started` | `completed` | `cancelled`

Priorities: `urgent` | `high` | `medium` | `low` | `none`

Full API reference: https://developers.plane.so/api-reference/introduction

## Structured Output

List-oriented commands support `--json` and `--xml` for automation. `plane issue get PROJ-N` always returns full JSON.

```bash
plane projects list --json
plane issues list PROJ --xml
plane cycles list PROJ --json
```

## Command Notes

- `plane issue update` expects flags before the issue ref, for example `plane issue update --state completed PROJ-29`.
- `--description` for issue and page create or update commands is sent through to Plane as HTML in `description_html`.
- `plane issue link add` accepts an optional link title via `--title`.
- `plane labels delete` accepts either the label UUID or the exact label name returned by `plane labels list`.
- `plane modules delete` accepts either the module UUID or the exact module name returned by `plane modules list`.
- `plane modules issues remove` expects the module-issue identifier returned by `plane modules issues list`, not an issue ref.
- `plane members list` is workspace-scoped and does not take a project argument.

## Compatibility Notes

- `plane init --local` reports which project-scoped features are enabled for the selected project.
- Pages and worklogs can be deployment-dependent even when a feature flag is present. The CLI now returns explicit compatibility errors for unsupported endpoints.

## Upgrade

```bash
bun update -g @backslash-ux/plane-cli
```

## Development

```bash
git clone https://github.com/backslash-ux/plane-cli-cli
cd plane-cli
bun install

bun run dev          # run locally
bun test             # run tests
bun run test:coverage
bun run typecheck
```

## Project Docs

- [AGENTS.md](./AGENTS.md) for the versioned baseline context shared with AI coding agents contributing to the repo.
- [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow, quality gates, and pull request expectations.
- [CHANGELOG.md](./CHANGELOG.md) for notable project changes.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the CLI structure and design boundaries.
- [docs/RELEASING.md](./docs/RELEASING.md) for the maintainer release flow.
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community behavior expectations.
- [SECURITY.md](./SECURITY.md) for vulnerability reporting guidance.
- [SKILL.md](./SKILL.md) for AI-agent usage patterns when operating the CLI itself.

## Contributing

Contributions should happen through GitHub issues and pull requests. Before starting non-trivial work, check for an existing issue or open one describing the problem, proposed CLI workflow, and user impact. Keep changes scoped, keep command/help/docs updates aligned, and run the narrowest relevant tests plus `bun run typecheck` before sending a change.

## License

MIT. See [LICENSE](./LICENSE).
