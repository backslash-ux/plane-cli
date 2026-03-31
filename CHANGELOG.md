# Changelog

All notable changes to this project will be documented in this file.

This project aims to follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

Earlier project history may predate this file.

## [Unreleased]

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