# Contributing

Thanks for your interest in contributing to `watsonx-ai-provider`. This guide covers the everyday flow (adding changes, opening PRs) and the release pipeline (Changesets + npm Trusted Publishing).

## Day-to-day: making a change

1. Make your code change on a feature branch.
2. From the `package/` directory, decide whether the change should produce a new published version. The rule of thumb: **does this change anything a consumer of `watsonx-ai-provider` would observe at runtime, type-time, or peer-dep time?**

### Yes — add a changeset

```bash
cd package
npm run changeset
```

The CLI asks for a bump type and a one-line summary. Commit the resulting `.changeset/<random-name>.md` alongside your code change. Bump-type guide:

| Bump | When to pick |
|---|---|
| **`patch`** | Bug fix, internal correctness, no API or behavior shift visible to typical callers |
| **`minor`** | New feature, new option, new export — backwards-compatible |
| **`major`** | Removed/renamed export, changed function signature, raised peer-dep range, changed runtime behavior in a way that could break callers |

When the PR merges to `main`, the Release workflow opens (or updates) a "Version Packages" PR aggregating all pending changesets. Merging that PR publishes to npm + creates the GitHub Release.

You never type a version number by hand. Changesets computes it from the bump types of merged changesets.

### No — skip the changeset

If your change has **zero impact on the published package**, no changeset is needed. Common cases:

- Documentation-only edits (README, root markdown)
- CI / GitHub Actions tweaks (`.github/workflows/`)
- Test-only changes (no production code touched)
- `examples/` updates (not part of the published package — `files` in `package.json` only ships `dist/` + README + MIGRATION + LICENSE)
- Repo tooling (`.gitignore`, `.editorconfig`, etc.)
- Internal refactors with byte-identical compiled output
- Comment / typo fixes inside source files

For an explicit "no version bump needed" marker:

```bash
npm run changeset -- --empty
```

### Pre-releases (beta, rc, etc.)

```bash
cd package
npx changeset pre enter beta   # subsequent merges produce 2.1.0-beta.0, 2.1.0-beta.1, ...
# ... ship some betas ...
npx changeset pre exit         # back to stable; next release rolls up to 2.1.0
```

### Avoiding accidental releases

The Release workflow only fires when `.changeset/*.md` files (other than `README.md`) exist on `main`. To save in-progress changeset content without triggering it, use a non-`.md` extension like `<name>.md.draft` — Changesets ignores anything that doesn't end in `.md`.

## Release pipeline

`watsonx-ai-provider` uses [Changesets](https://github.com/changesets/changesets) for versioning and `npm publish` via GitHub Actions with [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no long-lived tokens).

### Workflows

**`.github/workflows/ci.yml`** runs on every PR/push to `main` (paths-filtered to `package/**`). Type-checks, runs unit tests, and builds. Tested against Node 20 and 22.

**`.github/workflows/release.yml`** runs on every push to `main`. Uses `changesets/action@v1`:

- If `.changeset/*.md` files exist → opens/updates the "Version Packages" PR
- If no pending changesets and `package.json` was just bumped (i.e., the Version Packages PR was merged) → publishes to npm, creates the git tag, creates the GitHub Release

## One-time setup (kept for reference)

These steps are already done for the live repo — documented here for anyone setting up a fresh fork or replicating the pipeline elsewhere.

### npm Trusted Publisher (no token needed)

1. Sign in to [npmjs.com](https://www.npmjs.com/) → `watsonx-ai-provider` package page → **Settings** → **Trusted Publishers**
2. Add a publisher:
   - Type: **GitHub Actions**
   - GitHub organization: `IBM`
   - Repository: `watsonx-ai-provider`
   - Workflow filename: `release.yml`
   - Environment name: leave blank
3. Save

The Release workflow has `permissions: id-token: write`, which lets it present a GitHub OIDC identity to npm at publish time. npm verifies the identity matches the trusted publisher and authorizes the publish — no long-lived `NPM_TOKEN` secret required.

### GitHub repository settings

- **Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"** must be enabled. The Release workflow opens the "Version Packages" PR via the same `GITHUB_TOKEN`.
- *(Optional)* **Branch protection on `main`** requiring CI to pass before merging the Version Packages PR.

## Manual publish (emergency only)

If GitHub Actions is unavailable, you can publish locally — but you'll need a classic Automation token since the Trusted Publisher OIDC flow only works through Actions:

```bash
cd package
npm run typecheck
npm test
npm run build
npm login    # interactive; uses your account's 2FA
npm publish
```

Then manually create the git tag and GitHub Release. Avoid this path; it bypasses the changelog automation.

## Troubleshooting

### "npm ERR! 403 Forbidden" during release.yml

- Verify Trusted Publisher is configured on the npm package with the matching GitHub org / repo / workflow filename
- Confirm the workflow has `permissions: id-token: write`
- Check that the package name in `package.json` matches the package on npm (`watsonx-ai-provider`)

### The "Version Packages" PR isn't being created

- Verify Settings → Actions → General has "Allow GitHub Actions to create and approve pull requests" enabled
- Confirm at least one `.changeset/*.md` file exists on the source branch
- Check the Release workflow run logs for permission errors

### A changeset was merged but the version isn't bumping correctly

- Look at the open "Version Packages" PR — Changesets aggregates *all* pending changesets and uses the highest bump type. A `major` changeset means the next release is a major bump, regardless of how many `patch`/`minor` are also pending.

### Tests failing in CI

- Run locally: `cd package && npm run typecheck && npm test`
- CI tests on Node 20 and 22. If you need to debug, install the matching Node version locally with `nvm` or similar.
