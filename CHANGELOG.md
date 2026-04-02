# Changelog

All notable changes to this project will be documented in this file.

This project aims to follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

Earlier project history may predate this file.

## [Unreleased]

### Added

- **Project Stats & Analytics.** `plane stats` aggregates issues by state group, priority, assignment, and period counts. Supports `--since`/`--until` date windows, `--cycle`/`--module` scoping, `--assignee` filtering, and workspace-wide aggregation via `plane stats workspace`. Outputs human-readable summaries or structured data via `--json`/`--xml`. All aggregation is client-side with paginated issue fetches, and workspace mode skips inaccessible projects while reporting which ones were skipped.
- **Issue Data Visibility.** `plane issue get` and `plane issues list --json` now include `start_date`, `target_date`, `completed_at`, `created_at`, `updated_at`, `estimate_point`, and full label objects (with `id`, `name`, `color`). The API expand was broadened from `state` to `state,labels`.
- **Issue Attribute Writing.** `plane issue create` and `plane issue update` support new flags: `--start-date`, `--target-date` (alias `--due-date`), `--estimate`, `--cycle` (name or UUID), and `--module` (name or UUID). `--label` can now be passed multiple times for multi-label assignment.
- **Advanced Issue Filtering.** `plane issues list` supports `--no-assignee`, `--stale <days>` (issues not updated in N+ days), and `--cycle <name|UUID>` filters.
- **Cycle Lifecycle Management.** `plane cycles create`, `plane cycles update`, and `plane cycles delete` commands with date validation and name-based resolution. `plane cycles list` now shows issue stats (`total_issues`, `completed_issues`, `cancelled_issues`) and a computed cycle status (draft, upcoming, current, completed).
- **Smart Resolution.** `resolveCycle` joins `resolveModule` for name-to-UUID resolution so automation scripts stay readable.

### Changed

- **Archived project defaults.** Project-listing contexts now exclude archived projects by default, including interactive init selection and workspace stats aggregation. Use `--include-archived` to opt back in when needed.
- Extracted issue link, comments, and worklogs sub-commands into `src/commands/issue-sub.ts` to keep `issue.ts` under the 700-line file-size limit.

## 1.1.0

### Added

- `plane modules create` with optional description, status, schedule, and lead resolution.
- `plane init --local` now prompts whether to import the SKILL.md CLI usage guide into AGENTS.md. First-time prompt defaults to `N`; subsequent runs (section already present) default to `Y`. The skill section is wrapped in idempotent HTML comment markers so repeated runs update it in place.

### Changed

- **Consistent project defaulting for create commands.** `issue create`, `modules create`, `labels create`, and `pages create` now use `--title`/`--name` options instead of positional args, so the project positional can be omitted to use the saved current project.
- `hasSkillSectionInAgentsFile` now requires both the start and end delimiters to be present before treating an existing skill section as complete, preventing duplicate sections in malformed files.

### Validated

- `plane init --local` skill import prompt exercised: accept (`y`), decline (empty/default N), and idempotent re-run paths all verified via tests.
- All 261 tests pass with line and function coverage above the 95% threshold.

## 1.0.0

### Added

- Public open-source repository baseline with contributor, governance, security, architecture, and release documentation.
- GitHub issue and pull request templates plus issue intake routing.
- Stricter repository quality gates covering formatting, file-size limits, and coverage thresholds.
- Fork-specific package identity and public metadata alignment under `@backslash-ux/plane-cli`.
- A versioned root `AGENTS.md` file that provides baseline context for AI coding agents contributing to the repository.
- `plane labels delete` and `plane modules delete` cleanup commands.

### Changed

- Tightened published CLI documentation so README and SKILL examples match the validated command grammar, identifier semantics, and deployment-compatibility behavior.
- Updated compatibility notes in README and SKILL to document confirmed page and worklog deployment dependencies.

### Validated

- Full live test sweep completed against a real Plane instance. All core CLI workflows exercised: init (global, local, alias), project resolution, issue CRUD with rich options, comments, links, activity, cycles, modules, intake mutations, states, labels, members, and structured output.
- Confirmed the CLI's project-page endpoint routes are correct; both page API surfaces (project pages and workspace wiki pages) return 404 on some deployments regardless of feature flags.
- Confirmed worklogs are a Pro-plan-gated feature; the CLI returns explicit compatibility errors on non-Pro deployments.
- Added and validated first-class CLI cleanup commands for label delete and module delete.
