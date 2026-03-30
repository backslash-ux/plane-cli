# Plane CLI Development Plan

## Mission

Build the best CLI for AI agents operating Plane in project-defined and spec-driven workflows. The CLI should mirror Plane concepts, keep workflows discoverable, and make structured automation reliable without requiring hidden IDs or UI-only context.

## Planning Workflow

1. Every non-trivial implementation should map to a plan item in this file.
2. If the requested work is missing, add the smallest useful plan slice before or alongside implementation.
3. Each slice should describe the problem, scope, acceptance criteria, and how review will be recorded.
4. When implementation lands, update the item with touched files, tests run, and remaining follow-ups.
5. When the change has been checked, update the review state so this file shows what is implemented versus merely proposed.

## State Model

### Implementation State

- `Planned`: agreed target, not started.
- `In Progress`: active implementation.
- `Implemented`: code or customization exists.
- `Deferred`: intentionally postponed.

### Review State

- `Pending`: not yet checked.
- `Validated`: author validated structure, syntax, or tests.
- `Reviewed`: broader review completed.

## Plan Items

### PLAN-001 Agent Workflow Foundation

- Implementation: `Implemented`
- Review: `Validated`
- Goal: establish repo customizations that force future AI-assisted work to start from this plan and keep status visible.
- Scope:
	- add workspace instructions that reference this plan.
	- add command and test instructions that require plan-backed work.
	- add a reusable prompt for plan-backed end-to-end implementation slices.
	- add a read-only scout agent that proposes plan items from CLI and API gaps.
- Acceptance Criteria:
	- customization files live under `.github/` and explicitly reference `docs/PLAN.md`.
	- the default workspace instructions tell agents to anchor non-trivial work in this file.
	- future command and test work is guided to update this file with implementation and review state.
- Implemented In:
	- `.github/copilot-instructions.md`
	- `.github/instructions/commands.instructions.md`
	- `.github/instructions/tests.instructions.md`
	- `.github/prompts/add-plane-resource.prompt.md`
	- `.github/agents/plane-api-scout.agent.md`
	- `docs/PLAN.md`
- Validation:
	- markdown files created and checked for editor errors.
- Follow-ups:
	- use the scout agent to propose the next feature slices and add them here before implementation.

### PLAN-002 Spec-Driven Resource Expansion

- Implementation: `Planned`
- Review: `Pending`
- Goal: add missing Plane resources and flows in small end-to-end slices driven by explicit specs and project definitions.
- Scope:
	- implement one Plane resource or sub-workflow at a time.
	- include command wiring, schema validation, help text, tests, and README or SKILL updates when the CLI surface changes.
	- preserve AI-agent-friendly discoverability for any required UUID-backed entities.
- Acceptance Criteria:
	- each slice adds a user-facing workflow that can be exercised entirely through the CLI.
	- list or get commands exist wherever an operation otherwise depends on hidden IDs.
	- tests cover the new flow and any changed output behavior.
- Review Notes:
	- add concrete resource slices here as they are selected.

### PLAN-003 UUID Ergonomics And Discovery

- Implementation: `Planned`
- Review: `Pending`
- Goal: remove or reduce situations where agents must guess UUIDs, opaque join IDs, or undocumented intermediate calls.
- Scope:
	- audit existing commands for UUID-heavy flows.
	- improve list, get, or resolve paths.
	- document the intended agent workflow for resources that still need opaque identifiers.
- Acceptance Criteria:
	- high-friction UUID flows are either discoverable through the CLI or clearly documented as intentional gaps.
	- command help and structured output expose enough data for an agent to continue without manual UI steps.

### PLAN-004 Plane Coverage And MCP Alignment

- Implementation: `Planned`
- Review: `Pending`
- Goal: prioritize CLI additions using the highest-value gaps between current coverage, Plane REST endpoints, and Plane MCP affordances.
- Scope:
	- compare the CLI against current Plane capabilities.
	- rank gaps by usefulness for AI-assisted development workflows.
	- turn the best gaps into concrete plan slices with acceptance criteria.
- Acceptance Criteria:
	- the prioritized backlog is based on actual Plane capabilities, not guesswork.
	- the next implementation slices are small enough to build, test, and review incrementally.

### PLAN-005 Open Source Contributor Experience

- Implementation: `Implemented`
- Review: `Validated`
- Goal: make the repository presentable to open-source contributors with clear public documentation and clean Git hygiene for local-only AI customization files.
- Scope:
	- add contributor-facing workflow documentation.
	- add a public architecture overview.
	- link the main docs from the README.
	- align package metadata with the documented MIT license.
	- ignore local Copilot or agent customization files so they stay out of version control.
- Acceptance Criteria:
	- contributors can find setup, workflow, review expectations, and architecture boundaries from repository docs.
	- README links to the key docs instead of forcing contributors to guess where to start.
	- local AI customization files under `.github/` are ignored by Git.
	- package metadata declares the same license already documented in the README.
- Implemented In:
	- `.gitignore`
	- `package.json`
	- `README.md`
	- `CONTRIBUTING.md`
	- `docs/ARCHITECTURE.md`
	- `docs/PLAN.md`
- Validation:
	- markdown and package metadata checked for editor errors.
- Follow-ups:
	- add governance and security docs plus final package polish.

### PLAN-006 Repository Governance And Package Polish

- Implementation: `Implemented`
- Review: `Validated`
- Goal: complete the public open-source baseline with a canonical license, community policy docs, security guidance, and npm-facing metadata polish.
- Scope:
	- add a canonical MIT `LICENSE` file.
	- add `CODE_OF_CONDUCT.md` and `SECURITY.md`.
	- improve README positioning and public doc links.
	- improve package metadata for publication clarity.
	- add issue and pull request templates for public contribution flow.
- Acceptance Criteria:
	- the repository contains a canonical MIT license file.
	- contributors can find conduct and security guidance from the root docs.
	- README clearly states the project value proposition and links the governance docs.
	- `package.json` has clean open-source metadata for authoring and package contents.
- Implemented In:
	- `LICENSE`
	- `CODE_OF_CONDUCT.md`
	- `SECURITY.md`
	- `README.md`
	- `CONTRIBUTING.md`
	- `package.json`
	- `.github/ISSUE_TEMPLATE/bug_report.md`
	- `.github/ISSUE_TEMPLATE/feature_request.md`
	- `.github/pull_request_template.md`
	- `docs/PLAN.md`
- Validation:
	- markdown and package metadata checked for editor errors.
- Follow-ups:
	- harden maintainer workflows, issue intake routing, and release documentation.

### PLAN-007 Repository Operations And Release Hygiene

- Implementation: `Implemented`
- Review: `Pending`
- Goal: make the repo operationally ready for open-source maintenance with stricter quality gates, clearer issue intake, and explicit release process documentation.
- Scope:
	- harden CI and publish workflows around the actual repository gates.
	- add GitHub issue intake configuration.
	- add changelog and release-process documentation.
	- align package metadata and contributor docs with the release flow.
- Acceptance Criteria:
	- CI checks formatting, file-size limits, type safety, and coverage thresholds.
	- publish workflow runs the same core repository gate before publishing.
	- contributors are routed toward templates and policy docs instead of blank issues.
	- maintainers have a documented release and changelog process in the repository.
- Implemented In:
	- `package.json`
	- `README.md`
	- `CONTRIBUTING.md`
	- `CHANGELOG.md`
	- `docs/RELEASING.md`
	- `.github/ISSUE_TEMPLATE/config.yml`
	- `.github/workflows/ci.yml`
	- `.github/workflows/publish.yml`
	- `docs/PLAN.md`
- Validation:
	- editor diagnostics checked for new files.
	- the publish workflow still shows an editor warning for the custom GitHub secret name used for npm publishing.
	- repository quality gate could not be executed in this environment because `bun` is not installed.
- Follow-ups:
	- consider GitHub Discussions or a support policy if community traffic grows.

### PLAN-008 Fork Attribution And Repository Identity

- Implementation: `Implemented`
- Review: `Validated`
- Goal: make the fork identity explicit so public metadata points to the maintained repository while preserving attribution to the upstream project.
- Scope:
	- add a short upstream attribution note in the README.
	- update repository, bugs, homepage, and badge links to point at the fork instead of upstream.
	- preserve MIT licensing and upstream lineage acknowledgment.
- Acceptance Criteria:
	- public repository links point to the active fork.
	- the README explains that the project is forked from `aaronshaf/plane-cli`.
	- attribution is visible without overstating or obscuring the fork's independent maintenance.
- Implemented In:
	- `README.md`
	- `package.json`
	- `docs/PLAN.md`
- Validation:
	- git remotes checked locally and public metadata aligned to `origin` and `upstream`.

### PLAN-009 Fork Package Identity Alignment

- Implementation: `Implemented`
- Review: `Validated`
- Goal: align the published package identity and all public install paths with the maintained fork instead of the upstream package namespace.
- Scope:
	- rename the npm package to the fork namespace.
	- update public installation, upgrade, clone, and support URLs to point at the fork.
	- keep upstream attribution visible while making the maintained distribution unambiguous.
- Acceptance Criteria:
	- `package.json` uses the fork package name.
	- README and SKILL install commands reference the fork package.
	- GitHub issue template contact links point at the fork repository.
- Implemented In:
	- `package.json`
	- `README.md`
	- `SKILL.md`
	- `.github/ISSUE_TEMPLATE/config.yml`
	- `CHANGELOG.md`
	- `docs/PLAN.md`
- Validation:
	- remaining upstream-branded references were searched in the repository and updated where they represented fork-owned distribution or support paths.

### PLAN-010 Public AGENTS Baseline

- Implementation: `Implemented`
- Review: `Validated`
- Goal: version a public `AGENTS.md` file as baseline context for AI coding agents contributing to the repository.
- Scope:
	- stop ignoring `AGENTS.md` in Git.
	- add a root `AGENTS.md` with contributor-facing project context, workflow expectations, and technical boundaries.
	- link the file from public contributor documentation.
- Acceptance Criteria:
	- `AGENTS.md` is tracked in the repository.
	- the file gives AI agents enough baseline context to contribute without relying on local-only customization files.
	- README and contributor docs mention the file as part of the public repo documentation set.
- Implemented In:
	- `.gitignore`
	- `AGENTS.md`
	- `README.md`
	- `CONTRIBUTING.md`
	- `CHANGELOG.md`
	- `docs/PLAN.md`
- Validation:
	- editor diagnostics checked for the new public baseline file and updated docs.

## Item Template

Use this template when adding a new slice:

```md
### PLAN-XXX Short Title

- Implementation: `Planned`
- Review: `Pending`
- Goal: one-sentence outcome.
- Scope:
	- smallest useful vertical slice.
- Acceptance Criteria:
	- observable behavior.
	- required tests or docs updates.
- Implemented In:
	- add files after work lands.
- Validation:
	- tests run, syntax checks, or review notes.
- Follow-ups:
	- optional next slices.
```
