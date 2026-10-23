# Contributing

Thanks for your interest in contributing to `watsonx-ai-provider`. This guide covers the everyday flow (making changes, opening PRs) and the release pipeline (GitHub Releases + npm Trusted Publishing).

## Day-to-day: making a change

1. Make your code change on a feature branch and open a PR against `main`. CI type-checks, tests, and builds it.
2. **Don't bump the version in feature PRs.** Versions are bumped once per release (see [Releasing](#releasing)).
3. **Write the PR title for users.** Release notes are generated from the titles of PRs merged since the previous release, so a title like `Support ai@7 peer dependency` ends up verbatim in the notes.
4. If the change is breaking, say so in the PR description and update [`package/MIGRATION.md`](./package/MIGRATION.md) in the same PR.

## Releasing

Publishing a GitHub Release publishes that version to npm. Nothing is published by merging to `main`.

### 1. Bump the version

Open a PR that bumps the version, then merge it:

```bash
cd package
npm version minor --no-git-tag-version   # or patch / major — updates package.json + package-lock.json
```

| Bump | When to pick |
|---|---|
| **`patch`** | Bug fix, internal correctness, no API or behavior shift visible to typical callers |
| **`minor`** | New feature, new option, new export, widened peer-dep range — backwards-compatible |
| **`major`** | Removed/renamed export, changed function signature, raised peer-dep or Node minimum, changed runtime behavior in a way that could break callers |

The version bump can also ride along in the last feature PR of a release.

### 2. Publish a GitHub Release

1. On GitHub, go to **Releases → Draft a new release**
2. **Choose a tag** → type `v<version>` (e.g. `v2.1.0`, must match `package/package.json`) → **Create new tag on publish**, target `main`
3. Click **Generate release notes**, then edit them — call out breaking changes and link `MIGRATION.md` for majors
4. Click **Publish release**

The [Release workflow](#workflows) then checks the tag against `package.json`, runs typecheck/tests/build, and publishes to npm with provenance. Watch it under the **Actions** tab.

### Pre-releases (beta, rc, etc.)

```bash
cd package
npm version 2.1.0-beta.0 --no-git-tag-version   # later betas: npm version prerelease --no-git-tag-version
```

Merge, then publish the GitHub Release as `v2.1.0-beta.0` with **Set as a pre-release** ticked. Pre-releases publish under the `next` dist-tag, so `npm install watsonx-ai-provider` keeps resolving to the latest stable; testers use `npm install watsonx-ai-provider@next`.

### Release notes / changelog

Release notes live on [GitHub Releases](https://github.com/IBM/watsonx-ai-provider/releases). [`package/CHANGELOG.md`](./package/CHANGELOG.md) covers versions up to 2.0.0 and is no longer updated.

## Release pipeline

`watsonx-ai-provider` publishes via GitHub Actions with [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no long-lived tokens).

### Workflows

**`.github/workflows/ci.yml`** runs on every PR/push to `main` (paths-filtered to `package/**`). Type-checks, runs unit tests, and builds. Tested against Node 20 and 22.

**`.github/workflows/release.yml`** runs when a GitHub Release is published. It checks out the tagged commit, fails if the tag isn't `v<package.json version>`, runs typecheck/tests/build, and runs `npm publish --provenance` (with `--tag next` for pre-releases). It runs on Node 24, whose bundled npm (≥ 11.5.1) supports Trusted Publishing.

Workflows may only use IBM-allowed actions (`actions/checkout`, `actions/setup-node`); third-party actions such as `changesets/action` are blocked by IBM org policy at workflow-run time. Keep anything else as shell.

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

The Release workflow has `permissions: id-token: write`, which lets it present a GitHub OIDC identity to npm at publish time. npm verifies the identity matches the trusted publisher and authorizes the publish — no long-lived `NPM_TOKEN` secret required. Renaming `release.yml` breaks this until the Trusted Publisher entry is updated to match.

### GitHub repository settings

- *(Optional)* **Branch protection on `main`** requiring CI to pass before merging.

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

Then create the GitHub Release for the version. That triggers the Release workflow, which will fail at `npm publish` because the version already exists — expected, and harmless.

## Troubleshooting

### "Release tag 'vX.Y.Z' does not match package.json version"

The version bump wasn't merged before the release was published, or the tag has a typo. Nothing was published. Delete the GitHub Release **and** its tag (Releases → the release → Delete; then Tags → the tag → Delete), merge the bump, and publish the release again.

### The Release workflow failed before publishing (tests, build)

Nothing reached npm. Fix the problem on `main`, delete the GitHub Release and its tag, and publish the release again — re-creating the tag makes it point at the fixed commit. Re-running the failed workflow run is not enough, since it re-runs against the old tagged commit.

If `npm publish` itself succeeded, that version is taken on npm for good; bump to the next patch for any fix.

### "npm ERR! 403 Forbidden" / 404 on PUT during publish

- Verify Trusted Publisher is configured on the npm package with the matching GitHub org / repo / workflow filename
- Confirm the workflow has `permissions: id-token: write`
- Check that the package name in `package.json` matches the package on npm (`watsonx-ai-provider`)
- A 404 on the publish PUT usually means npm is older than 11.5.1 — check the npm version printed in the workflow's setup step

### Tests failing in CI

- Run locally: `cd package && npm run typecheck && npm test`
- CI tests on Node 20 and 22. If you need to debug, install the matching Node version locally with `nvm` or similar.
