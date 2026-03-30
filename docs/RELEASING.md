# Releasing

## Overview

This repository publishes from Git tags that match `v*` through [`.github/workflows/publish.yml`](../.github/workflows/publish.yml).

## One-Time Maintainer Setup

Before the first public release, make sure the publication path itself is ready:

1. Verify the npm package name is available and that the publishing account or npm organization has access to `@backslash-ux/plane`.
2. Enable npm account 2FA for maintainers. For CI publishing, either:
   - keep using the current `NPM_CONFIG_TOKEN` secret with a token that is allowed to publish this package, or
   - migrate the workflow to npm trusted publishing so long-lived tokens are no longer required.
3. Add the `NPM_CONFIG_TOKEN` repository secret in GitHub if the token-based workflow remains in use.
4. Confirm GitHub Actions is enabled for the repository and that the publish workflow can create releases. The current workflow already requests `contents: write`.
5. Verify the default branch is healthy before tagging: CI should pass on `main` and the version in `package.json` should match the intended release.
6. Confirm the repository URLs in `package.json` and the install instructions in `README.md` and `SKILL.md` point at the maintained fork.

## Recommended Preflight Checks

Run these checks before cutting a release:

```bash
bun run check:all
bun publish --dry-run
```

The dry run confirms the package contents and publish metadata without pushing a release to npm.

## Before Releasing

1. Update [CHANGELOG.md](../CHANGELOG.md) with user-facing changes.
2. Ensure public docs such as [README.md](../README.md) and [SKILL.md](../SKILL.md) match the shipped CLI behavior.
3. Confirm linked GitHub issues or milestone notes accurately reflect what is shipping.
4. Run the repository gate locally:

```bash
bun run check:all
```

## Release Steps

1. Update `version` in `package.json`.
2. Commit the version and changelog updates.
3. Create and push a Git tag in the form `vX.Y.Z`.

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

4. The publish workflow will:
   - install dependencies with Bun
   - run the repository gate
   - publish the package to npm
   - create a GitHub release with generated notes

## After Releasing

1. Confirm the GitHub release was created from the pushed tag.
2. Verify the package is visible on npm and that the published version matches `package.json`.
3. Smoke-test installation from the public registry:

```bash
bunx @backslash-ux/plane --help
```

4. If the release changes agent workflows, confirm `README.md`, `SKILL.md`, and `AGENTS.md` guidance still matches the shipped package.

## Required Repository Secrets

- `NPM_CONFIG_TOKEN` for package publication.

## Notes

- If the release changes command behavior, keep related GitHub issues, release notes, and docs aligned as part of the same change.
- If a release uncovers a workflow gap, document it here instead of relying on maintainer memory.
- npm currently recommends trusted publishing for GitHub Actions when possible. This repository still uses `NPM_CONFIG_TOKEN`, so moving to trusted publishing plus provenance is a useful follow-up when maintainers are ready.