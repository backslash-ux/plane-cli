# plane

[![CI](https://github.com/backslash-ux/plane-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/backslash-ux/plane-cli/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

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
bun install -g @backslash-ux/plane
```

## Setup

```bash
plane init
```

Prompts for your Plane host, workspace slug, and API token. Saves to `~/.config/plane/config.json` (mode 0600). Safe to re-run.

You can also use environment variables (override saved config):

```
PLANE_API_TOKEN=...
PLANE_HOST=https://plane.so
PLANE_WORKSPACE=myworkspace
```

## Common Commands

```bash
# Projects
plane projects list

# Issues
plane issues list PROJ
plane issues list PROJ --state started
plane issue get PROJ-29
plane issue create PROJ "Title"
plane issue update PROJ-29 --state done --priority high
plane issue delete PROJ-29

# Comments
plane issue comments list PROJ-29
plane issue comments add PROJ-29 "text"
plane issue comments update PROJ-29 COMMENT_ID "new text"
plane issue comments delete PROJ-29 COMMENT_ID

# Links
plane issue link list PROJ-29
plane issue link add PROJ-29 https://example.com "title"
plane issue link remove PROJ-29 LINK_ID

# Activity
plane issue activity PROJ-29

# Worklogs
plane issue worklogs list PROJ-29
plane issue worklogs add PROJ-29 --duration 90
plane issue worklogs add PROJ-29 --duration 30 --description "standup"

# Cycles
plane cycles list PROJ
plane cycles issues list PROJ CYCLE_ID
plane cycles issues add PROJ CYCLE_ID PROJ-29

# Modules
plane modules list PROJ
plane modules issues list PROJ MODULE_ID
plane modules issues add PROJ MODULE_ID PROJ-29
plane modules issues remove PROJ MODULE_ID PROJ-29

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
plane members list PROJ
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

## Upgrade

```bash
bun update -g @backslash-ux/plane
```

## Development

```bash
git clone https://github.com/backslash-ux/plane-cli
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
- [docs/PLAN.md](./docs/PLAN.md) for the planned implementation slices and current status.
- [docs/RELEASING.md](./docs/RELEASING.md) for the maintainer release flow.
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community behavior expectations.
- [SECURITY.md](./SECURITY.md) for vulnerability reporting guidance.
- [SKILL.md](./SKILL.md) for AI-agent usage patterns when operating the CLI itself.

## Contributing

Contributions should start from [docs/PLAN.md](./docs/PLAN.md) for any non-trivial change. Prefer small end-to-end slices, keep command/help/docs updates aligned, and run the narrowest relevant tests plus `bun run typecheck` before sending a change.

## License

MIT. See [LICENSE](./LICENSE).
