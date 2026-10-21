# Development Workflow & Contribution Guidelines

This document defines the Git workflow, commit conventions, and release process for **Go Go Gas!**, a Next.js 15 and React 19 gas-station finder and fuel-aware commute planner. The goal is to keep `main` stable while allowing ongoing development on `develop`.

## 1. Branching strategy

| Branch | Purpose | Rules |
| --- | --- | --- |
| `main` | Stable, tested application | Update through pull requests only. |
| `develop` | Integration branch for ongoing work | Commit and push day-to-day changes here. |
| `feature/<short-name>` *(optional)* | Isolated work on a larger feature | Branch from `develop`; merge back into `develop` through a pull request. |
| `hotfix/<short-name>` *(optional)* | Urgent fix to the stable release | Branch from `main`; merge into `main`, then bring the fix into `develop`. |

**Default workflow:** Use `main` and `develop`. Create feature branches only when their isolation is useful.

```text
main ────────●────────────────────●──────────  stable
             \                    ↑
              ●────●────●─────────┘
              develop         tested PR
```

## 2. Initial repository setup

Clone the repository (which should have `main` as its default branch):

```bash
git clone https://github.com/ryan-lorentzen/Go-Go-Gas.git
cd Go-Go-Gas
```

For a new repository, create and publish `develop` **once**:

```bash
git switch -c develop
git push -u origin develop
```

If `develop` already exists on GitHub, switch to it instead:

```bash
git fetch origin
git switch develop
```

If Git cannot find the remote branch automatically, use:

```bash
git switch --track origin/develop
```

### Local application setup

Use Node.js compatible with Next.js 15 and npm. Run commands from the repository root:

```bash
npm ci
```

For live station searches and destination autocomplete, create an untracked `.env.local` file:

```dotenv
GOOGLE_PLACES_API_KEY=your-key
```

Enable **Places API (New)** for the key. Keep it server-side; never use a `NEXT_PUBLIC_` variable for it or commit the key. Commute planning also uses an OSRM-compatible service; optionally set `OSRM_BASE_URL` in `.env.local`. See [README.md](README.md#configuration) for integration details.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Allow browser location access to exercise nearby searches and commute planning. Missing configuration and denied location access are also important states to test.

## 3. Daily development

Start each session on the development branch and get its latest changes:

```bash
git switch develop
git pull --ff-only origin develop
```

Make your changes, check them in the browser, and run the relevant checks in section 5. Before committing, review what will be included:

```bash
git status
git diff
```

Stage the intended files, check the staged changes, commit, and push:

```bash
git add src/features/commute/components/CommutePanel.tsx README.md
git diff --cached
git commit -m "feat(commute): add stop skipping"
git push origin develop
```

Use `git add .` only after confirming that your `.gitignore` excludes generated files and that all changes shown by `git status` belong in the commit. Prefer small commits containing one logical change.

### Optional: Work in a feature branch

For work that benefits from isolation:

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/skip-commute-stop
# Make changes, then stage and commit them.
git push -u origin feature/skip-commute-stop
```

Open a pull request from `feature/skip-commute-stop` into `develop`. Once merged, switch back to `develop` and pull its latest changes. Delete the feature branch when no longer needed; **do not delete `develop`**.

### Project conventions

- Follow [AGENTS.md](AGENTS.md) for repository-specific implementation and verification guidance.
- Use TypeScript and the `@/*` alias for imports from `src/*`. Extend shared domain types in `src/types/index.ts` instead of duplicating them.
- Keep Leaflet rendering client-only and preserve the home page's `dynamic(..., { ssr: false })` boundary. Browser APIs belong in client components or guarded effects.
- Send browser requests through the application's API routes. Keep Google Places mapping in integration modules, preserve source metadata and live-request freshness, and abort or ignore stale searches.
- Use the existing Zustand stores for location and saved commute progress. Keep older valid saved plans compatible when changing persisted data.
- Preserve responsive layouts, semantic controls, visible keyboard focus, and touch-friendly map interactions. Do not expose raw integration errors or secrets in the UI.
- Update the relevant README section in the same change when behavior, integrations, configuration, commands, or deployment requirements change.

## 4. Commit message convention

Use a simplified **Conventional Commits** format:

```text
<type>(optional-scope): <short, imperative description>

[optional body: explain why and important implementation details]

[optional footer: issue references or breaking-change notes]
```

The most useful commit types for this project are:

| Type | Use for | Example |
| --- | --- | --- |
| `feat` | New user-facing functionality | `feat(commute): add stop skipping` |
| `fix` | Correcting a bug | `fix(ui): center skip confirmation dialog` |
| `refactor` | Restructuring code without changing behavior | `refactor(gas-prices): extract response mapping` |
| `docs` | Documentation-only edits | `docs: document local build instructions` |
| `test` | Adding or changing tests | `test(api): cover invalid search coordinates` |
| `chore` | Routine maintenance not covered by another type | `chore: update gitignore rules` |
| `build` | Build scripts, Next.js configuration, or dependencies | `build: update Next.js dependencies` |
| `ci` | Continuous-integration configuration | `ci: add automated build workflow` |
| `perf` | Performance improvements | `perf(map): reduce marker recalculations` |
| `style` | Formatting-only changes, not UI features | `style: apply consistent code formatting` |
| `revert` | Reverting a previous change | `revert: remove faulty station scoring change` |

**About `change:`:** You can use it informally, but it is **not a standard Conventional Commits type**. For consistency, prefer the more precise `feat:`, `fix:`, `refactor:`, `docs:`, or `chore:` instead.

### Commit-writing rules

1. **One purpose per commit.** Separate unrelated bug fixes, features, and documentation updates.
2. **Use the imperative mood.** Write `add`, `fix`, or `remove`, rather than `added`, `fixed`, or `changes`.
3. **Be specific.** Explain what changed, not merely that files were modified.
4. **Keep the subject concise.** Aim for 50 characters; keep it under roughly 72 when possible. Do not end it with a period.
5. **Use lowercase types.** For example, `feat:` instead of `Feat:`.
6. **Use a scope when helpful.** For example, `fix(api): handle missing Places API key`. Useful scopes include `map`, `commute`, `gas-prices`, `api`, and `ui`.
7. **Explain *why* in the body** when the reason is not obvious. Leave a blank line after the subject.
8. **Do not commit secrets or generated build output.** Review staged changes before committing.

**Good:**

```text
feat(commute): confirm before skipping a fuel stop
fix(api): validate gas search coordinates
refactor(map): share current location marker source
docs: add development workflow
build: update Next.js dependencies
```

**Avoid:**

```text
update
fixed stuff
change: changes
feat: did some work
WIP
```

For a more involved change, use a subject and body:

```text
fix(commute): preserve skipped stops after reload

Persist skipped stop IDs with the active plan so reopening the app
does not label bypassed fuel stops as completed.
```

For a breaking change, include a `BREAKING CHANGE:` footer explaining its impact and any required migration.

## 5. Testing before merging

Run these checks before moving code into `main`:

```bash
npm run lint
npm run build
```

For everyday development, always run lint after frontend changes. Run a production build for changes affecting routes, server handlers, imports, configuration, or production behavior. There is currently no unit-test script or configured GitHub Actions workflow; do not assume `npm test` or automated pull-request checks exist. If tests are added, document how to run them.

Use `npm run dev` for browser checks, or `npm run start` after a successful build to check the production server.

- [ ] ESLint and the production build complete successfully; investigate warnings and errors rather than relying only on exit status.
- [ ] The application loads and the changed behavior works on desktop and narrow mobile viewports.
- [ ] Location permission denial, missing API-key behavior, empty results, fuel-grade/radius changes, station selection, and map interactions work when relevant.
- [ ] Commute changes cover destination selection, planning, arrival/range updates, skip confirmation and cancellation, saved progress after reload, and destination completion when relevant.
- [ ] Integration changes cover successful, failed, and empty responses. Explain changes to Google Places field masks, response mapping, route scoring, or fallback behavior in the pull request.
- [ ] Routing failures behave appropriately: local trip estimates can fall back to straight-line estimates; commute planning fails safely when road routing is unavailable.
- [ ] Keyboard navigation, visible focus, dialog dismissal, and touch controls remain usable when relevant.
- [ ] Any tests added to the project pass.
- [ ] Debug output, temporary code, credentials, and accidental generated files are not included.
- [ ] The code and documentation reflect the final behavior.

Keep `node_modules/`, `.next/`, `out/`, `build/`, `.vercel/`, `*.tsbuildinfo`, logs, and local environment files out of Git. Commit intentional source changes and `package-lock.json` when dependencies change. Use `npm install` to add or update dependencies; use `npm ci` to reproduce the committed lockfile.

## 6. Promoting `develop` to `main`

When the development branch is tested and feature-complete:

1. Commit and push any remaining changes to `develop`.
2. On GitHub, open a **pull request** with **base: `main`** and **compare: `develop`**.
3. Describe what changed, how it was tested, and any known limitations.
4. Review the diff; resolve conflicts and ensure required checks pass.
5. Merge the pull request. Keep both long-lived branches.

A pull request helps preserve a clear review and integration history. Do not commit directly to `main` as part of normal development.

### Deployment considerations

Deploy this repository root as a Next.js project. Vercel uses `npm ci` and `npm run build`; no `vercel.json` is required for the current configuration. Configure `GOOGLE_PLACES_API_KEY` and, if needed, `OSRM_BASE_URL` in the hosting provider's environment settings for each target environment, not in committed files or build-generated environment files.

If Vercel is connected to GitHub, verify that its production branch is `main` and use preview deployments to review development changes when available. Branch protection and deployment settings must be configured in GitHub/Vercel; this document does not enable them automatically.

### Sync after the merge

Because the pull request is merged on GitHub, update your local branches and carry the merged result back into `develop`:

```bash
git switch main
git pull --ff-only origin main

git switch develop
git pull --ff-only origin develop
git merge main
git push origin develop
```

If Git reports merge conflicts, resolve them, review and test the result, then finish the merge and push. If your repository uses **squash merging**, this sync is particularly important for keeping the two branches aligned.

## 7. GitHub repository safeguards

Create a branch ruleset targeting `main` under **Settings → Rules → Rulesets**. Recommended settings:

- Require a pull request before merging.
- Prevent direct pushes to `main` (including by the maintainer, if desired).
- Require successful automated checks **once those checks are configured**.
- Optionally require approvals if collaborating with other developers.

Keep `main` as the repository's default branch so visitors see the stable version first.

## 8. Urgent fixes to a stable release (optional)

If a critical problem is discovered in `main` while `develop` contains unfinished work, create a `hotfix/<short-name>` branch from `main`. Apply and test only the fix, open a pull request into `main`, then merge the updated `main` into `develop` using the sync steps above.

Do not merge unfinished `develop` changes into `main` just to ship a hotfix.

---

**Quick reference:** Clone `main` → work and push on `develop` → test → open a PR from `develop` to `main` → merge → sync `main` back into `develop`.
