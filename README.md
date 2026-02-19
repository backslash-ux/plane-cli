# plane

CLI for the [Plane](https://plane.so) project management API.

## Requirements

- [Bun](https://bun.sh) runtime

## Installation

```bash
curl -fsSL https://bun.sh/install | bash
bun install -g @aaronshaf/plane
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

## Upgrade

```bash
bun update -g @aaronshaf/plane
```

## Development

```bash
git clone https://github.com/aaronshaf/plane-cli
cd plane-cli
bun install

bun run dev          # run locally
bun test             # run tests
bun run test:coverage
bun run typecheck
```

## License

MIT
