# Release Workflow Guide

This document describes how versioning and releases work in the **ai-vector-memories** project.

## Overview

This project uses **semantic-release** to automatically manage version bumping, changelog generation, and npm publishing based on **Conventional Commits**.

## Conventional Commits Format

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification to ensure proper version calculations and changelog generation.

### Syntax

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

### Type

**Required.** Must be one of:

| Type | Release | Description |
|------|---------|-------------|
| `feat` | MINOR | A new feature |
| `fix` | PATCH | Bug fix |
| `perf` | PATCH | Performance improvement |
| `docs` | None* | Documentation only |
| `style` | None | Code style (formatting, semicolons, etc.) |
| `refactor` | None | Code refactoring (no behavior change) |
| `test` | None | Tests or test infrastructure |
| `chore` | None | Build, CI, dependencies |
| `ci` | None | CI/CD changes |
| `revert` | Varies | Revert a previous commit |

*: `docs` will trigger a PATCH release only if scope is `README`

### Scope

**Optional.** A scope may be provided to add contextual information. Examples:
- `feat(config): add new configuration option`
- `fix(memory): resolve memory leak`
- `docs(README): update installation guide`

### Subject

**Required.** Brief description of the change:
- Use imperative mood ("add" not "adds" or "added")
- Do not capitalize first letter
- Do not end with a period (.)
- Limit to ~50 characters

### Body

**Optional.** Provide additional context:
- Explain **what** and **why**, not **how**
- Wrap at 72 characters
- Separate from subject with blank line

### Footer

**Optional.** Use for breaking changes:
- `BREAKING CHANGE: description of breaking change`
- Triggers a MAJOR version bump
- Alternative: Use `!` after type/scope: `feat!: breaking feature`

## Examples

### Patch Release (0.1.0 → 0.1.1)

```
fix: correct memory leak in embedding cache

The cache was not properly clearing entries on memory pressure,
causing unbounded memory growth over time.
```

### Minor Release (0.1.0 → 0.2.0)

```
feat(api): add batch similarity search endpoint

Users can now query multiple vectors in a single API call,
reducing overhead for bulk operations.
```

### Major Release (0.1.0 → 1.0.0)

```
feat!: redesign memory storage interface

BREAKING CHANGE: MemoryStore interface now uses async methods.
Migrating existing code requires updating all store.get() calls
to await store.getAsync().
```

Or using `BREAKING CHANGE:` in body:

```
feat(api): restructure configuration API

The old Config class has been replaced with a function-based
configuration system.

BREAKING CHANGE: Configuration files must be migrated from YAML
to JSON format. See migration guide in docs/migration-v1.md
```

## Commit Validation

### Local (Pre-commit)

When you commit, a **husky** hook automatically validates your message:

```bash
git commit -m "feat(memory): add new feature"
# If valid: ✅ Commit succeeds
# If invalid: ❌ Commit rejected with error message
```

### Manual Validation

To check commits without committing:

```bash
bun run commit-lint
```

### Pull Request Validation

The `.github/workflows/validate-commits.yml` workflow validates all commits in a pull request. If validation fails, the workflow will comment on the PR with formatting guidance.

## Release Process

1. **Developer commits** with Conventional Commits format
2. **Push to `main`** branch
3. **GitHub Action triggers** `.github/workflows/release.yml`
4. **semantic-release executes:**
   - Analyzes commits since last release
   - Calculates next version
   - Runs `bun run build`
   - Updates `package.json` version
   - Generates changelog entries in `CHANGELOG.md`
   - Commits and pushes changes
   - Publishes to npm
   - Creates git tag (e.g., `v0.2.0`)
   - Creates GitHub Release with auto-generated notes

## FAQ

### Q: Can I manually bump the version?

**A:** No. Versions are fully automated. If you need a specific version, use a feature branch and merge conventional commits that achieve your target version.

### Q: What if semantic-release fails mid-way?

**A:** The action is idempotent. Investigate the error, fix it in a new commit, and push again. semantic-release will retry.

### Q: How do I cancel a release?

**A:** Releases are triggered automatically on each push. To prevent release during development:
- Work on feature branches
- Only merge to `main` when ready for release
- Use `git revert` to undo published versions (creates new commit)

### Q: Can I do pre-releases (alpha, beta)?

**A:** Currently, this project only does stable releases. Support for pre-releases requires additional configuration in `.releaserc.json`.

### Q: How do I add a scoped package?

**A:** The `publishConfig.access: "public"` in `package.json` already handles this. No additional configuration needed.

### Q: What if my commit doesn't match the format?

**A:** The pre-commit hook will reject it immediately:

```bash
$ git commit -m "fixed stuff"

❌ Error: commit message does not meet conventional commits format
feat: description
fix: description
...
```

Fix your commit message and try again:

```bash
git commit -m "fix: resolve memory leak"
```

To amend the last commit:

```bash
git commit --amend -m "fix: resolve memory leak"
git push --force-with-lease
```

## Related Documentation

- [Conventional Commits](https://www.conventionalcommits.org/)
- [semantic-release Documentation](https://github.com/semantic-release/semantic-release)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)

## Credits

This workflow is powered by:
- [semantic-release](https://github.com/semantic-release/semantic-release)
- [commitlint](https://commitlint.js.org/)
- [husky](https://typicode.github.io/husky/)
