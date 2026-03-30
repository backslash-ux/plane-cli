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
bun install -g @backslash-ux/plane
```

## Configuration

Run once to save credentials interactively:

```bash
plane init
```

Saves to `~/.config/plane/config.json` (mode 0600). Safe to re-run.

Or set environment variables (override saved config):

```bash
export PLANE_API_TOKEN=your-token
export PLANE_HOST=https://plane.so          # or your self-hosted URL
export PLANE_WORKSPACE=your-workspace-slug
```

---

## Concepts

| Term | Meaning |
|---|---|
| **Project identifier** | Short uppercase string, e.g. `ACME`, `WEB`. Shown by `plane projects list`. |
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

---

## Projects

```bash
plane projects list
plane projects list --xml
```

---

## Issues

### List

```bash
plane issues list PROJ
plane issues list PROJ --state started
plane issues list PROJ --state backlog
plane issues list PROJ --assignee "Jane Doe"
plane issues list PROJ --priority high
plane issues list PROJ --xml
```

Filtering is client-side (no server search endpoint). Fetch all and filter locally.

### Get (full JSON)

```bash
plane issue get PROJ-29
```

### Create

```bash
plane issue create PROJ "Issue title"
plane issue create --priority high --state started PROJ "Fix lint pipeline"
plane issue create --description "Detailed context" PROJ "Add dark mode"
plane issue create --assignee "Jane Doe" PROJ "Onboarding bug"
plane issue create --label "bug" PROJ "Regression in login flow"
```

### Update

> **Important:** Options must come *before* the ref argument.
> `plane issue update --state done PROJ-29` ✅
> `plane issue update PROJ-29 --state done` ❌ (flags after positional args are ignored)

```bash
plane issue update --state completed PROJ-29
plane issue update --priority high WEB-5
plane issue update --title "New title" PROJ-29
plane issue update --description "Updated context" PROJ-29
plane issue update --assignee "Jane Doe" PROJ-29
plane issue update --no-assignee PROJ-29
plane issue update --label "enhancement" PROJ-29
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

---

## States

```bash
plane states list PROJ
plane states list PROJ --xml
```

State IDs are UUIDs unique per project. Always fetch live — never hardcode.

---

## Labels

```bash
plane labels list PROJ
plane labels list PROJ --xml
plane labels create PROJ "bug"
plane labels create --color "#ff0000" PROJ "critical"
```

---

## Members

```bash
plane members list
plane members list --xml
```

---

## Cycles (sprints)

```bash
plane cycles list PROJ
plane cycles list PROJ --xml
plane cycles issues list PROJ <cycle-id>
plane cycles issues add PROJ <cycle-id> PROJ-29
```

Cycle IDs are UUIDs. Fetch them from `plane cycles list PROJ`.

---

## Modules

```bash
plane modules list PROJ
plane modules list PROJ --xml
plane modules issues list PROJ <module-id>
plane modules issues add PROJ <module-id> PROJ-29
plane modules issues remove PROJ <module-id> <module-issue-id>  # use join ID, not issue ref
```

---

## Intake (triage)

```bash
plane intake list PROJ
plane intake accept PROJ <intake-id>
plane intake reject PROJ <intake-id>
```

Statuses: `pending`, `accepted`, `rejected`, `snoozed`, `duplicate`.

---

## Pages (documentation)

```bash
plane pages list PROJ
plane pages list PROJ --xml
plane pages get PROJ <page-id>             # full JSON including description_html
plane pages create --name "My Page" PROJ
plane pages create --name "My Page" --description "Content here" PROJ
plane pages update --name "New Title" PROJ <page-id>
plane pages update --description "New content" PROJ <page-id>
plane pages delete PROJ <page-id>
plane pages archive PROJ <page-id>
plane pages unarchive PROJ <page-id>
plane pages lock PROJ <page-id>
plane pages unlock PROJ <page-id>
plane pages duplicate PROJ <page-id>
```

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
| `label_ids` | Array of label UUIDs |
| `due_date` | null or ISO date string |

---

## Tips

- No server-side text search — fetch all issues and filter locally.
- No epics — use labels or modules to group related issues.
- `description` in `issue create`/`update` is plain text; the CLI wraps it in `<p>` tags automatically.
- Always fetch state/label/member IDs live — never hardcode UUIDs across workspaces.
- `plane issue get PROJ-N` is the fastest way to inspect all fields on a single issue.

---

## Full API Reference

For advanced operations not covered by the CLI, use the Plane REST API directly:

**https://developers.plane.so/api-reference/introduction**
