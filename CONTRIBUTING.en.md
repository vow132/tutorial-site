# Contributing

[简体中文](CONTRIBUTING.md) | **English**

Questions, suggestions and code are all welcome. Before you start:

- **Don't open public issues for security vulnerabilities**; report them privately as described in [SECURITY.en.md](SECURITY.en.md);
- search before opening an issue; when reporting a bug, include the version shown at the bottom of the admin sidebar and how you deployed;
- for bigger changes (new features, database schema changes, swapping dependencies), open an issue first to discuss the idea so the work doesn't go in a direction that won't be merged.

Issues and pull requests can be written in English or Chinese.

## Development setup

Requires Node.js ≥ 22.12 (24 LTS recommended).

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npx prisma db seed       # admin / admin123456 plus sample categories and tutorials
npm run dev              # http://localhost:3000, admin at /admin
```

## Checks before submitting

```bash
npm run lint
npx tsc --noEmit
npm test                  # unit tests
npm run build
npm run test:e2e          # end-to-end tests (run npx playwright install chromium the first time)
E2E_DEMO=1 npx playwright test   # end-to-end tests for demo mode (Windows PowerShell: $env:E2E_DEMO=1; npx playwright test)
E2E_SETUP=1 npx playwright test  # end-to-end tests for the first-time setup page (creates a fresh database with no accounts)
```

The end-to-end tests create and delete data prefixed with `e2e-`, so **run them only against a development or test database**. CI runs the same checks on Node 22 and 24 plus a separate dependency audit.

## Code conventions

The full architecture notes are in [AGENTS.md](AGENTS.md) (Chinese); these are the easiest ones to trip over:

- **This is Next.js 16**: `cookies()`, `headers()`, `params` and `searchParams` must all be awaited; dynamic route `params` aren't URL-decoded automatically, so Chinese slugs need `decodeURIComponent()`. Both dev and build use webpack; don't switch to Turbopack.
- **Interface text** goes into the dictionaries in `lib/i18n/messages/<language>/`, never straight into components, Server Actions or API routes. Chinese (`zh-CN`) is the reference; add new text to all four languages (if you can't write one, use English for now rather than leaving it empty). TypeScript reports missing keys, and `lib/i18n-messages.test.ts` checks placeholders. Text for the ops scripts and the update worker lives in `lib/script-i18n.mjs`.
- **Auth**: every admin page calls `requireAdminPage()` and every Server Action calls `requireAuth()`; without a permission argument **only the owner** is allowed. To open something to editors or authors, pass the permission (`lib/roles.ts`), and anything that changes a single tutorial must also check `canEditTutorial()`. Every function exported from a `"use server"` file becomes a callable endpoint, so put helpers in ordinary modules.
- **Public links** always use `components/intent-link.tsx`, not `next/link`.
- **Database migrations**: add columns to the `Tutorial` table only with `ALTER TABLE "Tutorial" ADD COLUMN …`, never with Prisma's generated “create new table → copy data → drop old table”, which drops the full-text search triggers. Afterwards run `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` and confirm nothing differs except the full-text search tables.
- **Counters** (views, feedback) are incremented with raw SQL, not `prisma.tutorial.update`, which would bump `updatedAt`.
- **Sensitive data** (keys, tokens, passwords) is encrypted with `lib/secret-box.mjs` before it's stored; new sensitive actions call `audit()` for the security log, and ones that should be pushed are added in `lib/alerts.ts`.
- **Article HTML** goes through the `lib/sanitize.ts` allowlist both when saved and when rendered; when you add an editor extension, widen the allowlist to match.
- **Color contrast**: small secondary text uses `text-ink-3`, small accent text uses `text-accent-ink`; category colors entered in the admin get the `cat-text` class and `categoryTextStyle()` when used for text.
- **Don't hard-code anything the owner can change in the admin**: editing repository files on the server blocks one-click updates.

## Dependencies

- When adding or upgrading a dependency, choose a version that has been **published for at least two weeks**, giving the community time to find problems;
- download URLs in `package-lock.json` use `registry.npmmirror.com` (faster for servers in China). After installing from the official registry, run:

  ```bash
  sed -i 's#https://registry.npmjs.org/#https://registry.npmmirror.com/#g' package-lock.json
  ```

- new dependencies with install scripts (native modules and the like) must be added to `allowScripts` in `package.json`; recent npm versions don't run install scripts that aren't listed.
- The Docker image only carries Next's standalone output (packages used by the site code are already bundled): `scripts/*.mjs` ops scripts may only use Node built-ins, better-sqlite3 and dotenv; ops scripts written in TypeScript must be added to `BUNDLES` in `scripts/docker-runtime.mjs` so they're bundled into `.mjs` when the image is built. When you change these, run the Docker smoke test (`.github/scripts/docker-smoke.sh`; CI runs it too).
- New endpoints that write data either go through `requireAuth()` / `requireSession()` or check `isDemoMode()` themselves (`lib/demo.ts`), otherwise the demo site can be messed up.

## Pull requests

- One PR does one thing; the title and description say what changed, why, and how it was verified;
- attach screenshots for UI changes (light, dark, phone width);
- add a line under “未发布” (Unreleased) at the top of [CHANGELOG.md](CHANGELOG.md) for changes users will notice;
- PRs to `master` need all CI checks to pass.

## Releasing (maintainers)

1. Pick the version number following [semantic versioning](https://semver.org/) and update `version` in `package.json` and `package-lock.json`;
2. rename “未发布” in CHANGELOG.md to “## [X.Y.Z] - date”, leave an empty “未发布” above it, put anything owners must do by hand under the upgrade notes, and add this version's link at the end;
3. merge: when the “Docker 镜像” workflow on master sees a version with no tag yet, it tags `vX.Y.Z`, creates a GitHub Release (notes taken from that CHANGELOG section) and adds the `X.Y.Z`, `X.Y` and `X` tags to the image (the script is `.github/scripts/release.sh`; `DRY_RUN=1 GITHUB_REPOSITORY=vow132/tutorial-site bash .github/scripts/release.sh` shows what it would publish).

Every update to master publishes the `latest` image; pushing a `vX.Y.Z` tag by hand also builds that version's image.

## License

By submitting code you agree that it is released under this project's [MIT license](LICENSE).
