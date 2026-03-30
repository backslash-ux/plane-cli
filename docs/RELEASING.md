# Releasing

## Overview

This repository publishes from Git tags that match `v*` through [`.github/workflows/publish.yml`](../.github/workflows/publish.yml).

## Before Releasing

1. Confirm the target work is reflected in [docs/PLAN.md](./PLAN.md).
2. Update [CHANGELOG.md](../CHANGELOG.md) with user-facing changes.
3. Ensure public docs such as [README.md](../README.md) and [SKILL.md](../SKILL.md) match the shipped CLI behavior.
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

## Required Repository Secrets

- `NPM_CONFIG_TOKEN` for package publication.

## Notes

- If the release changes command behavior, update [docs/PLAN.md](./PLAN.md) review state and validation notes as part of the same change.
- If a release uncovers a workflow gap, document it here instead of relying on maintainer memory.