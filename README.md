# tag-release

[![Version](https://img.shields.io/badge/version-v1.0.0-blue)](https://github.com/jcsturges/tag-release/releases/tag/v1.0.0)

A reusable GitHub composite action that creates a semver tag, updates project
files, and publishes a GitHub Release — all triggered from a single manual
workflow dispatch.

---

## Overview

`tag-release` is designed for teams that use git tags to drive production
deployments. Rather than hand-rolling version bumps and changelog entries on
every release, this action automates the full release pipeline in one step:

1. Infer (or accept) the next semver version
2. Update `CHANGELOG.md`, `RELEASE.md`, `CONTRIBUTORS.md`, version files, and the README badge
3. Commit those changes, create an annotated tag, push both, then open a GitHub Release

---

## Features

- **Manual trigger** via `workflow_dispatch` with a version-type dropdown
- **Semver versioning** — major / minor / patch, defaulting to `auto`
- **Conventional Commits inference** — reads commits since the last tag and picks the highest-impact bump
- **Same-day guard** — if the last tag was created today, always produces a patch (prevents accidental jumps)
- **CHANGELOG.md** — prepends a new section in [Keep a Changelog](https://keepachangelog.com) format, maintains link references at the bottom
- **Version file sync** — updates `package.json`, `package-lock.json`, `pyproject.toml`, `Cargo.toml`, and common Python `version.py` / `_version.py` patterns
- **README badge** — upserts a `shields.io` version badge linked to the new GitHub Release
- **RELEASE.md** — overwrites with notes for just this release, grouped by breaking changes / features / fixes / maintenance, each commit linked by short SHA
- **CONTRIBUTORS.md** — regenerated from full git history with commit counts and lines added/removed per author
- **GitHub Release** — created automatically using `RELEASE.md` as the body
- **Dry-run mode** — calculates and logs the new version without touching any files

---

## How it works

```
workflow_dispatch (version_type input)
         │
         ▼
 checkout repo (full history, fetch-depth: 0)
         │
         ▼
 calculate next version
   ├─ last tag was today?          → patch (same-day guard)
   ├─ version_type = major/minor/patch  → use explicitly
   └─ version_type = auto          → scan Conventional Commits
         │                              (highest-impact wins)
         ▼
 update CHANGELOG.md
   └─ prepend new version section under [Unreleased]
   └─ update link references at bottom of file
         │
         ▼
 update version files (if present)
   └─ package.json, package-lock.json
   └─ pyproject.toml
   └─ Cargo.toml
   └─ version.py / _version.py
         │
         ▼
 update README.md
   └─ upsert shields.io version badge
         │
         ▼
 write RELEASE.md
   └─ commits grouped by type, each linked by short SHA
         │
         ▼
 rewrite CONTRIBUTORS.md
   └─ one-pass git log --numstat aggregated per author
         │
         ▼
 git commit  "chore: release vX.Y.Z"
         │
         ▼
 git tag -a vX.Y.Z
         │
         ▼
 git push + git push origin vX.Y.Z
         │
         ▼
 create GitHub Release (body = RELEASE.md)
```

---

## Conventional Commits version inference

When `version-type` is `auto` (the default), the action reads every commit
since the last tag and picks the **highest-impact** bump it finds:

| Commit prefix                                                            | Example                         | Bump      |
| ------------------------------------------------------------------------ | ------------------------------- | --------- |
| `<type>!:` or `BREAKING CHANGE`                                          | `feat!: redesign auth API`      | **major** |
| `feat:`                                                                  | `feat: add OAuth login`         | **minor** |
| `fix:` / `perf:`                                                         | `fix: null crash on empty body` | **patch** |
| `chore:` / `docs:` / `style:` / `test:` / `ci:` / `build:` / `refactor:` | `chore: update deps`            | none      |
| anything else                                                            | `update thing`                  | none      |

If no bumpable commit is found, the action defaults to a **patch** so the
workflow always produces a new tag. Scopes are supported — e.g. `feat(auth):`.

---

## Inputs

| Input            | Required | Default | Description                                                            |
| ---------------- | -------- | ------- | ---------------------------------------------------------------------- |
| `token`          | Yes      | —       | GitHub token. Must have `contents: write`. Use `secrets.GITHUB_TOKEN`. |
| `version-type`   | No       | `auto`  | `auto` \| `major` \| `minor` \| `patch`                                |
| `default-branch` | No       | `main`  | Used to build the initial link reference when no previous tag exists   |
| `dry-run`        | No       | `false` | When `true`, logs the calculated version but makes no changes          |

## Outputs

| Output             | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `version`          | The new version tag, e.g. `v1.5.0`                             |
| `previous-version` | The previous version tag, or empty string on the first release |

---

## Required permissions

```yaml
permissions:
  contents: write # push commits, create tags, create GitHub Releases
  pull-requests: read # read PR titles for release notes (optional but recommended)
```

---

## Using this action in your project

### 1. Copy the workflow file

Create `.github/workflows/tag-release.yml` in your repository:

```yaml
name: Tag & Release

on:
  workflow_dispatch:
    inputs:
      version_type:
        description: >
          Version bump type.
          "auto" infers from Conventional Commits (feat → minor, fix → patch,
          feat!/BREAKING CHANGE → major). Same-day tags always produce a patch.
        required: false
        default: auto
        type: choice
        options:
          - auto
          - major
          - minor
          - patch
      dry_run:
        description: >
          Dry run — calculate and log the new version without creating commits,
          tags, or GitHub Releases.
        required: false
        default: false
        type: boolean

# Prevent concurrent releases racing each other
concurrency:
  group: tag-release
  cancel-in-progress: false

jobs:
  release:
    name: Tag & Release
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: read

    steps:
      - name: Run tag-release action
        uses: jcsturges/tag-release@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          version-type: ${{ inputs.version_type }}
          dry-run: ${{ inputs.dry_run }}
```

That's it. Go to **Actions → Tag & Release → Run workflow** in your repo's
GitHub UI to trigger a release.

### 2. Capture the output version (optional)

If a downstream job needs the new version string — for example, to trigger a
deployment workflow — capture it via the step `id`:

```yaml
steps:
  - name: Tag & Release
    id: release
    uses: jcsturges/tag-release@v1
    with:
      token: ${{ secrets.GITHUB_TOKEN }}

  - name: Deploy
    run: echo "Deploying ${{ steps.release.outputs.version }}"
```

### 3. Trigger on push to main (optional)

To run automatically on every merge to `main` instead of (or in addition to)
manual dispatch:

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:
    inputs:
      version_type: ...
```

### 4. Pin to a specific version (recommended for production)

```yaml
- uses: jcsturges/tag-release@v1 # floating major tag
- uses: jcsturges/tag-release@v1.2.3 # pinned tag
- uses: jcsturges/tag-release@abc1234 # pinned SHA (most secure)
```

---

## Customizing release note categories

The action ships a default `.github/release.yml` that maps GitHub PR labels to
release note sections. Copy it into your own repo's `.github/release.yml` to
override:

```yaml
# .github/release.yml
changelog:
  exclude:
    labels:
      - ignore-for-release
  categories:
    - title: Breaking Changes
      labels: [breaking-change]
    - title: Features
      labels: [feature, enhancement]
    - title: Bug Fixes
      labels: [bug, fix]
    - title: Maintenance
      labels: [chore, deps]
```

GitHub uses this file when auto-generating release notes from PR titles. The
action also uses the same grouping logic internally when writing `RELEASE.md`.

---

## Generated file formats

### CHANGELOG.md

Follows [Keep a Changelog](https://keepachangelog.com) format. A new section
is prepended under `[Unreleased]` on every release. Link references at the
bottom of the file are kept up to date automatically.

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [v1.5.0] - 2025-06-01

### Added

- feat: add OAuth login (a1b2c3d)

### Fixed

- fix: null crash on empty body (e4f5a6b)

## [v1.4.0] - 2025-05-15

...

[Unreleased]: https://github.com/owner/repo/compare/v1.5.0...HEAD
[v1.5.0]: https://github.com/owner/repo/compare/v1.4.0...v1.5.0
[v1.4.0]: https://github.com/owner/repo/tree/v1.4.0
```

### RELEASE.md

Contains notes for the current release only. Overwritten on every release and
used as the body of the GitHub Release.

```markdown
# Release v1.5.0

**Date:** 2025-06-01
**Full Changelog:** [v1.4.0...v1.5.0](https://github.com/owner/repo/compare/...)

---

## Breaking Changes

- feat!: redesign auth API ([a1b2c3d](https://github.com/...))

## Features

- feat: add OAuth login ([e4f5a6b](https://github.com/...))

## Bug Fixes & Changes

- fix: null crash on empty body ([c7d8e9f](https://github.com/...))
```

### CONTRIBUTORS.md

Regenerated from the full git history on every release.

```markdown
# Contributors

> Auto-generated from git history. Last updated 2025-06-01.

| Author     | Email            | Commits | Lines Added | Lines Removed |
| ---------- | ---------------- | ------: | ----------: | ------------: |
| Jane Smith | jane@example.com |      42 |      +3,210 |        -1,450 |
| Bob Jones  | bob@example.com  |      17 |        +890 |          -302 |
```

### README.md badge

The action inserts (or updates) a `shields.io` badge on the first line after
the top-level heading:

```markdown
# My Project

[![Version](https://img.shields.io/badge/version-v1.5.0-blue)](https://github.com/owner/repo/releases/tag/v1.5.0)
```

---

## Repository structure

```
tag-release/
├── action.yml                    # Composite action definition
├── .nvmrc                        # Node.js 24
├── package.json                  # Runtime dependencies
├── src/
│   ├── index.js                  # Main orchestrator
│   ├── git.js                    # git helpers (last tag, commits, author stats)
│   ├── version.js                # Semver bump logic + Conventional Commits parser
│   ├── changelog.js              # CHANGELOG.md updater
│   ├── files.js                  # Version file updater (package.json, pyproject.toml, etc.)
│   ├── readme.js                 # README.md shields.io badge upsert
│   ├── release.js                # RELEASE.md writer
│   └── contributors.js           # CONTRIBUTORS.md writer
├── tests/
│   ├── git.test.js
│   ├── version.test.js
│   ├── changelog.test.js
│   ├── files.test.js
│   ├── readme.test.js
│   ├── release.test.js
│   └── contributors.test.js
├── .github/
│   ├── release.yml               # Default PR label → release category mapping
│   └── workflows/
│       └── tag-release.yml       # Example workflow to copy into target repos
└── CHANGELOG-example.md          # Reference changelog format
```

---

## Dependencies

| Package                  | Type    | Purpose                                           |
| ------------------------ | ------- | ------------------------------------------------- |
| `@actions/core`          | runtime | Logging, input/output, and failure handling       |
| `@actions/exec`          | runtime | Running git commands with output capture          |
| `@actions/github`        | runtime | Octokit client for creating GitHub Releases       |
| `semver`                 | runtime | Semver parsing and increment logic                |
| `jest`                   | dev     | Test runner and coverage reporter                 |
| `@vercel/ncc`            | dev     | Bundles the action to `dist/` for distribution    |
| `eslint`                 | dev     | JavaScript linter                                 |
| `@eslint/js`             | dev     | ESLint recommended rule set                       |
| `eslint-config-prettier` | dev     | Disables ESLint rules that conflict with Prettier |
| `globals`                | dev     | Environment globals for ESLint flat config        |
| `prettier`               | dev     | Opinionated code formatter                        |

---

## Testing

Tests live in a top-level `tests/` directory, one file per module. Run them with:

```bash
npm test                # run all tests with coverage summary in terminal
npm run test:coverage   # run all tests and open HTML coverage report in browser
npm run test:watch      # re-run on file changes during development
```

### Coverage

The suite targets **100% coverage** on all six library modules. `src/index.js`
(the action entry-point that orchestrates everything and calls the GitHub API)
is excluded from collection — it is integration-tested via the action itself.

```
File             | Statements | Branches | Functions | Lines
-----------------|------------|----------|-----------|-------
changelog.js     |    100%    |   100%   |   100%    |  100%
contributors.js  |    100%    |   100%   |   100%    |  100%
files.js         |    100%    |   100%   |   100%    |  100%
git.js           |    100%    |   100%   |   100%    |  100%
readme.js        |    100%    |   100%   |   100%    |  100%
release.js       |    100%    |   100%   |   100%    |  100%
version.js       |    100%    |   100%   |   100%    |  100%
```

### Coverage annotations

Two lines in `release.js` carry `/* istanbul ignore */` comments. Both are dead
code paths that exist for defensive correctness but are structurally unreachable:

| File         | Annotation                                              | Reason                                                                                                                                      |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `release.js` | `/* istanbul ignore next */` on the fallback `for` loop | `groupCommits` has a catch-all that routes every commit to `fixes`, so when `commits` is non-empty the all-groups-empty guard is never true |
| `release.js` | `/* istanbul ignore else */` on `if (!commits.length)`  | Same guard — the false branch (commits non-empty, all groups empty) is unreachable                                                          |

The thresholds enforced by Jest (configured in `package.json`):

```json
"coverageThreshold": {
  "global": {
    "lines": 80,
    "functions": 80,
    "branches": 75,
    "statements": 80
  }
}
```

Thresholds are intentionally set below 100% so a single untested edge case in
a new module does not block CI while the author is iterating.

---

## Linting and formatting

The project uses **ESLint 9** (flat config) for linting and **Prettier 3** for formatting.

```bash
npm run lint          # check for lint errors
npm run lint:fix      # auto-fix lint errors
npm run format        # reformat all files in place
npm run format:check  # check formatting without writing
```

### Prettier

Configured in `.prettierrc`:

| Option          | Value    |
| --------------- | -------- |
| `semi`          | `true`   |
| `singleQuote`   | `false`  |
| `trailingComma` | `"none"` |
| `printWidth`    | `100`    |

`.prettierignore` excludes `dist/`, `coverage/`, `node_modules/`, and lock files.

### ESLint

Configured in `eslint.config.js` using the flat config format. Key rules:

| Rule             | Setting                                     |
| ---------------- | ------------------------------------------- |
| `no-var`         | `error`                                     |
| `prefer-const`   | `error`                                     |
| `no-unused-vars` | `error` (args prefixed with `_` are exempt) |

`eslint-config-prettier` is applied last to disable any formatting rules that
would conflict with Prettier. Jest globals (`describe`, `test`, `expect`, etc.)
are scoped to `tests/**/*.js` only.

---

## Notes

- The commit created by this action (`chore: release vX.Y.Z`) is intentionally
  a non-conventional-commit type so it does not influence future version
  inference.
- If none of the supported version files (`package.json`, `pyproject.toml`,
  etc.) exist in the target repo, the action skips that step silently and
  proceeds.
- The `CONTRIBUTORS.md` is rebuilt from the **full** git history on every run,
  not just commits in the current release window, so it always reflects the
  lifetime of the project.
- Concurrent workflow runs are blocked by the `concurrency: tag-release` group
  in the example workflow. This prevents two simultaneous releases from
  calculating the same version or pushing conflicting tags.
