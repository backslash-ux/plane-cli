---
name: plane-cli
description: >
  Use when working with Plane project management via the `plane` CLI. Covers
  listing/creating/updating/deleting issues, managing cycles, modules, pages,
  intake, comments, worklogs, links, states, labels, and members. Works with
  any Plane instance (cloud or self-hosted). Supports structured --xml/--json
  output for AI agents.
---

# Plane CLI Skill Guide

The `plane` CLI wraps the Plane REST API. It is designed for both human and AI
agent use. Install it globally with bun:

```bash
bun install -g @backslash-ux/plane-cli
```

## Configuration

Run once to save credentials interactively:

```bash
plane init -g
```

Saves to `~/.config/plane/config.json` (mode 0600). Safe to re-run. The interactive flow can also save a current project for repeated project-scoped commands.

For path-local overrides in the current directory:

```bash
plane init --local
plane . init
```

Local setup writes `./.plane/config.json`. Effective config resolution is:

```text
PLANE_* environment variables > nearest .plane/config.json > ~/.config/plane/config.json
```

`plane init --local` also fetches the project's feature flags from Plane and reports which project-scoped features are actually enabled. Cycles, modules, pages, and intake commands fail with explicit feature-disabled errors when the project has them turned off.
It also writes `.plane/project-context.json`, a machine-readable helper snapshot of the project's existing states, labels, and estimate points so agents can reuse current project conventions instead of creating duplicates.
It also creates or updates `AGENTS.md` in that directory with a managed Plane context section at the bottom so AI agents know to read `.plane/project-context.json`, prefer the repo-local `plane` CLI, and clear inherited `PLANE_*` overrides before relying on local project config.

Or set environment variables (override saved config):

```bash
export PLANE_API_TOKEN=your-token
export PLANE_HOST=https://plane.so
export PLANE_WORKSPACE=your-workspace
export PLANE_PROJECT=PROJ                   # optional current-project override
```

You can also save a current project explicitly:

```bash
plane projects list
plane projects use PROJ
plane projects use PROJ --local
plane projects use PROJ --global
plane projects current
```

If a local config is active in the current path, `plane projects use PROJ` writes there by default.

---

## Concepts

| Term | Meaning |
|---|---|
| **Project identifier** | Short uppercase string, e.g. `ACME`, `WEB`. Shown by `plane projects list`. |
| **Current project** | Optional saved project identifier used when a list-style command omits the project argument or when a command uses `@current`. |
| **Issue ref** | `PROJ-29` — identifier + sequence number. |
| **State group** | `backlog` \| `unstarted` \| `started` \| `completed` \| `cancelled` |
| **Priority** | `urgent` \| `high` \| `medium` \| `low` \| `none` |

---

## Structured Output for AI Agents

All list commands support `--xml` and `--json` flags.

- **`--xml`** — outputs a `<results>` document with one `<item>` per record (attributes HTML-escaped). Most reliable for AI parsing.
- **`--json`** — outputs a JSON array.
- **`plane issue get PROJ-N`** — always outputs full JSON, no flag needed.

```bash
plane projects list --xml
plane issues list PROJ --xml
plane issues list PROJ --state started --xml
plane states list PROJ --xml
plane labels list PROJ --xml
plane members list --xml
plane cycles list PROJ --xml
plane modules list PROJ --xml
```

## Compatibility Notes

- Project-scoped feature availability depends on the target project's Plane feature flags.
- Some Plane deployments expose pages or worklogs in project settings but still do not provide the backing API routes. In those cases, the CLI returns an explicit compatibility error instead of a raw backend `404`.
- **Pages**: The CLI targets the project-page API surface. Plane also has a separate workspace wiki page surface that the CLI does not cover. Both may be absent on some deployments even when feature flags are present.
- **Worklogs**: Time tracking (worklogs) is a Pro-plan feature in Plane. Non-Pro deployments will not expose worklog endpoints.

---

## Projects

```bash
plane projects list
plane projects use PROJ
plane projects use PROJ --local
plane projects current
plane projects list --xml
```

---

## Issues

### List

```bash
plane issues list
plane issues list PROJ
plane issues list PROJ --state started
plane issues list PROJ --state backlog
plane issues list PROJ --assignee "Jane Doe"
plane issues list PROJ --priority high
plane issues list PROJ --no-assignee
plane issues list PROJ --stale 7
plane issues list PROJ --cycle "Week 14"
plane issues list PROJ --xml
```

Filtering is client-side (no server search endpoint). Fetch all and filter locally.

### Get (full JSON)

```bash
plane issue get PROJ-29
```

### Create

```bash
plane issue create --title "Issue title"
plane issue create --title "Issue title" PROJ
plane issue create --priority high --state started --title "Fix lint pipeline"
plane issue create --description '<p>Detailed context</p>' --title "Add dark mode" PROJ
plane issue create --assignee "Jane Doe" --title "Onboarding bug" PROJ
plane issue create --label "bug" --label "urgent" --title "Regression in login flow" PROJ
plane issue create --start-date 2025-04-01 --target-date 2025-04-14 --title "Sprint task" PROJ
plane issue create --estimate <UUID> --title "Sized work" PROJ
plane issue create --cycle "Week 14" --title "Scoped to cycle" PROJ
plane issue create --module "Sprint 3" --title "Scoped to module" PROJ
```

### Update

> **Important:** Options must come *before* the ref argument.
> `plane issue update --state done PROJ-29` ✅
> `plane issue update PROJ-29 --state done` ❌ (flags after positional args are ignored)

```bash
plane issue update --state completed PROJ-29
plane issue update --priority high WEB-5
plane issue update --title "New title" PROJ-29
plane issue update --description '<p>Updated context</p>' PROJ-29
plane issue update --assignee "Jane Doe" PROJ-29
plane issue update --no-assignee PROJ-29
plane issue update --label "enhancement" PROJ-29
plane issue update --label "bug" --label "critical" PROJ-29
plane issue update --start-date 2025-04-01 --target-date 2025-04-14 PROJ-29
plane issue update --estimate <UUID> PROJ-29
plane issue update --cycle "Week 14" PROJ-29
plane issue update --module "Sprint 3" PROJ-29
```

### Delete

```bash
plane issue delete PROJ-29   # permanent, cannot be undone
```

### Comment (add)

```bash
plane issue comment PROJ-29 "Fixed in latest build"
```

### Comments (manage)

```bash
plane issue comments list PROJ-29
plane issue comments update PROJ-29 <comment-id> "Updated text"
plane issue comments delete PROJ-29 <comment-id>
```

### Activity (audit trail)

```bash
plane issue activity PROJ-29
```

### Links

```bash
plane issue link list PROJ-29
plane issue link add PROJ-29 https://github.com/org/repo/pull/42
plane issue link add --title "Design doc" PROJ-29 https://docs.example.com
plane issue link remove PROJ-29 <link-id>
```

### Worklogs (time tracking)

```bash
plane issue worklogs list PROJ-29
plane issue worklogs add PROJ-29 90                          # 90 minutes
plane issue worklogs add --description "code review" PROJ-29 30
```

Some deployments do not expose worklog endpoints even when time tracking appears enabled. Expect an explicit compatibility error in that case.

---

## States

```bash
plane states list
plane states list PROJ
plane states list PROJ --xml
```

State IDs are UUIDs unique per project. Always fetch live — never hardcode.

---

## Labels

```bash
plane labels list
plane labels list PROJ
plane labels list PROJ --xml
plane labels create --name "bug"
plane labels create --name "critical" --color "#ff0000" PROJ
plane labels delete PROJ bug
```

---

## Members

```bash
plane members list
plane members list --xml
```

Members are workspace-scoped. This command does not take a project argument.

---

## Cycles (sprints)

```bash
plane cycles list
plane cycles list PROJ
plane cycles list PROJ --xml
plane cycles create --name "Week 14" --start-date 2025-04-01 --end-date 2025-04-07 PROJ
plane cycles update --end-date 2025-04-08 PROJ "Week 14"
plane cycles delete PROJ "Week 14"
plane cycles issues list PROJ <cycle-id>
plane cycles issues add PROJ <cycle-id> PROJ-29
```

Cycle IDs are UUIDs. Fetch them from `plane cycles list PROJ`.
Cycle create/update/delete accept cycle names for convenience — the CLI resolves names to UUIDs internally.
`plane cycles list --json` includes `total_issues`, `completed_issues`, and `cancelled_issues` counts plus a computed status (draft, upcoming, current, completed).

---

## Modules

```bash
plane modules list
plane modules list PROJ
plane modules list PROJ --xml
plane modules create --name "Sprint 3"
plane modules delete PROJ <module-id>
plane modules issues list PROJ <module-id>
plane modules issues add PROJ <module-id> PROJ-29
plane modules issues remove PROJ <module-id> <module-issue-id>  # use the identifier returned by `plane modules issues list`
```

---

## Intake (triage)

```bash
plane intake list
plane intake list PROJ
plane intake accept PROJ <intake-id>
plane intake reject PROJ <intake-id>
```

Statuses: `pending`, `accepted`, `rejected`, `snoozed`, `duplicate`.

---

## Pages (documentation)

```bash
plane pages list
plane pages list PROJ
plane pages list PROJ --xml
plane pages get PROJ <page-id>             # full JSON including description_html
plane pages create --name "My Page"
plane pages create --name "My Page" --description '<p>Content here</p>' PROJ
plane pages update --name "New Title" PROJ <page-id>
plane pages update --description '<p>New content</p>' PROJ <page-id>
plane pages delete PROJ <page-id>
plane pages archive PROJ <page-id>
plane pages unarchive PROJ <page-id>
plane pages lock PROJ <page-id>
plane pages unlock PROJ <page-id>
plane pages duplicate PROJ <page-id>
```

Some deployments do not expose page endpoints even when the project advertises page support. Expect an explicit compatibility error in that case.

---

## Issue Fields Reference

| Field | Notes |
|---|---|
| `id` | UUID — use for API calls |
| `sequence_id` | Human-readable number (e.g. `42`) |
| `name` | Issue title |
| `description_html` | HTML body |
| `state` | Full object — access `state.group` and `state.name` |
| `state_detail` | Always null — ignore |
| `priority` | `urgent`, `high`, `medium`, `low`, `none` |
| `assignees` | Array of user UUIDs |
| `labels` | Array of label objects (`id`, `name`, `color`) |
| `label_ids` | Array of label UUIDs |
| `start_date` | null or ISO date string |
| `target_date` | null or ISO date string |
| `completed_at` | null or ISO timestamp (when issue moved to completed state group) |
| `created_at` | ISO timestamp |
| `updated_at` | ISO timestamp |
| `estimate_point` | null or estimate value |

---

## Tips

- No server-side text search — fetch all issues and filter locally.
- No epics — use labels or modules to group related issues.
- `description` in issue or page create and update flows is passed through to `description_html`; send HTML such as `<p>Details</p>` when you want formatted output.
- `--target-date` has an alias `--due-date` for convenience.
- `--label` can be specified multiple times for multi-label assignment.
- `--cycle` and `--module` accept either a UUID or the exact name listed by `plane cycles list` / `plane modules list`. The CLI resolves names internally.
- `plane modules create --lead` accepts a member display name, email, or UUID from `plane members list`.
- `plane modules create --status in_progress` is normalized to Plane's `in-progress` API value.
- Always fetch state/label/member IDs live — never hardcode UUIDs across workspaces.
- `plane issue get PROJ-N` is the fastest way to inspect all fields on a single issue.

---

## Full API Reference

For advanced operations not covered by the CLI, use the Plane REST API directly:

**https://developers.plane.so/api-reference/introduction**
