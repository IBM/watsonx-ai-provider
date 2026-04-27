# Publishing Guide

`watsonx-ai-provider` uses [Changesets](https://github.com/changesets/changesets) for versioning and `npm publish` via GitHub Actions with [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no long-lived tokens).

## Day-to-day: contributing a change

1. Make your code change on a feature branch.
2. Run `npm run changeset` from the `package/` directory:

   ```bash
   cd package
   npm run changeset
   ```

   The CLI will ask:
   - Bump type: `patch` (bugfix), `minor` (new feature, backwards-compatible), `major` (breaking).
   - Summary: a one-line description that becomes the changelog entry.

3. Commit the resulting `.changeset/<random-name>.md` file alongside your code change.
4. Open a PR. Reviewer can verify both the code and the bump type/summary.
5. Once merged to `main`, the **Release** workflow opens (or updates) a "Version Packages" PR with the rollup of all pending changesets.
6. **Merging the "Version Packages" PR publishes** to npm + tags + creates a GitHub Release.

You never type a version number by hand. Changesets computes it from the bump types of merged changesets.

### When you don't need a changeset

For docs-only edits, CI changes, or refactors with no API/runtime change, skip the changeset. Optionally run `npm run changeset -- --empty` to record an explicit "no version bump needed" marker.

### Pre-releases (beta, rc, etc.)

```bash
cd package
npx changeset pre enter beta   # subsequent merges produce 2.1.0-beta.0, 2.1.0-beta.1, ...
# ... ship some betas ...
npx changeset pre exit         # back to stable; next release rolls up to 2.1.0
```

## One-time setup (already done — kept for reference)

### npm Trusted Publisher (no token needed)

1. Sign in to [npmjs.com](https://www.npmjs.com/) → `watsonx-ai-provider` package page → **Settings** → **Trusted Publishers**.
2. Add a publisher:
   - Type: **GitHub Actions**
   - GitHub organization: `IBM`
   - Repository: `watsonx-ai-provider`
   - Workflow filename: `release.yml`
   - Environment name: leave blank
3. Save.

The Release workflow has `permissions: id-token: write`, which lets it present a GitHub OIDC identity to npm at publish time. npm verifies the identity matches the trusted publisher and authorizes the publish — no long-lived `NPM_TOKEN` secret required.

### GitHub repository settings

- **Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"** must be enabled. The Release workflow opens the "Version Packages" PR via the same `GITHUB_TOKEN`.
- (Optional) **Branch protection on `main`** requiring CI to pass before merging the Version Packages PR.

## Workflows

### `.github/workflows/ci.yml`

Runs on every PR/push to `main` (paths-filtered to `package/**`). Type-checks, runs unit tests, and builds. Tested against Node 20 and 22.

### `.github/workflows/release.yml`

Runs on every push to `main`. Uses `changesets/action@v1`:

- If `.changeset/*.md` files exist → opens/updates the "Version Packages" PR.
- If no pending changesets and `package.json` was just bumped (i.e., the Version Packages PR was merged) → publishes to npm, creates the git tag, creates the GitHub Release.

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

- Verify Trusted Publisher is configured on the npm package with the matching GitHub org / repo / workflow filename.
- Confirm the workflow has `permissions: id-token: write`.
- Check that the package name in `package.json` matches the package on npm (`watsonx-ai-provider`).

### The "Version Packages" PR isn't being created

- Verify Settings → Actions → General has "Allow GitHub Actions to create and approve pull requests" enabled.
- Confirm at least one `.changeset/*.md` file exists on the source branch.
- Check the Release workflow run logs for permission errors.

### A changeset was merged but the version isn't bumping correctly

- Look at the open "Version Packages" PR — Changesets aggregates *all* pending changesets and uses the highest bump type. A `major` changeset means the next release is a major bump, regardless of how many `patch`/`minor` are also pending.

### Tests failing in CI

- Run locally: `cd package && npm run typecheck && npm test`.
- CI tests on Node 20 and 22. If you need to debug, install the matching Node version locally with `nvm` or similar.
