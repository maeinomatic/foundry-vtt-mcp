# Release Workflow

This repository uses the root `package.json` version as the canonical release version.

The supported release path is:

1. Prepare release metadata and lockfile.
2. Review and commit the version bump.
3. Create an annotated tag from the committed release commit.
4. Push `master` and the tag.
5. Let `build-complete-release.yml` publish the release from the tag-triggered run.

## Commands

### 1. Prepare the release

Run:

```bash
npm run release:prepare -- 0.6.8
```

What it does:

- updates the root `package.json` version using `npm version --no-git-tag-version`
- syncs these files to the same version:
  - `packages/mcp-server/package.json`
  - `packages/foundry-module/package.json`
  - `packages/foundry-module/module.json`
  - `shared/package.json`
- refreshes `package-lock.json`
- runs `npm run version:check`

Dry-run preview:

```bash
npm run release:prepare -- 0.6.8 --dry-run
```

### 2. Review and commit

Review the changed files, then commit them:

```bash
git status
git commit -am "chore: release v0.6.8"
```

### 3. Create the release tag

Run:

```bash
npm run release:tag
```

What it does:

- verifies all release versions are aligned
- refuses to tag if the working tree is dirty
- creates annotated tag `vX.Y.Z` at `HEAD`

Dry-run preview:

```bash
npm run release:tag -- --dry-run
```

### 4. Push commit and tag

Run:

```bash
git push origin master
git push origin v0.6.8
```

## Important rules

- Do not create the tag before the version bump commit exists.
- Do not manually edit multiple version files unless you are repairing a broken release.
- Do not rely on a manual Actions run to create a normal release from `master`.
- The real publish path is the tag-triggered run for `vX.Y.Z`.

## Verification

Before tagging, you can always run:

```bash
npm run version:check
```

After pushing the tag, confirm the remote tag points to the release commit:

```bash
git ls-remote --tags origin
```

For annotated tags, the `refs/tags/vX.Y.Z^{}` line is the commit the tag resolves to.

## Recovery if a tag points to the wrong commit

If you tagged the wrong commit and no valid release has been published yet:

```bash
git tag -d v0.6.8
git tag -a v0.6.8 <correct-commit-sha> -m "v0.6.8"
git push origin :refs/tags/v0.6.8
git push origin v0.6.8
```

Use this only to repair an invalid tag. Normal releases should never require retagging.
