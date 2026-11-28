# Customization guide: make it your own tutorial site

[简体中文](CUSTOMIZE.md) | **English**

This code is a general-purpose template for an illustrated tutorial site: the content, the name and the look are up to you. Most customization takes a few clicks in the admin, **no code changes needed**. When you do need to change code, follow the “Changing code” section at the end so you can keep merging upstream updates.

## 1. First things to do after deploying

Sign in at `/admin`. The **launch checklist** at the top of the dashboard lists what's left to do and ticks items off as you finish them:

1. **Change the site name and branding**: “Site settings → Basics / Brand”; pick the site language under “Basics” as well;
2. **Remove the sample data**: click “Clear sample data” in the checklist. It deletes the 3 sample tutorials from the seed data plus the sample categories and tags your own tutorials don't use (recorded in the security log; it can't be undone);
3. **Change the default password, turn on two-factor authentication**: “Account security”;
4. **Set `SITE_URL` and `TRUST_PROXY`**: environment variables on the server, see [`.env.example`](../.env.example); if the site is behind Cloudflare, see “Cloudflare” in the [README](../README.en.md);
5. **Back up regularly, turn on security alerts**: see “Security hardening” in the [README](../README.en.md).

If you've written posts on Hexo, Hugo, Jekyll, Obsidian, WordPress or similar, move them over in one go with “Tutorials → Bulk import”:
- choose a Markdown folder or a WordPress export file (WordPress admin “Tools → Export → Posts”), preview, then import;
- publish dates and tags are kept; posts whose category matches one of yours go there, the rest into the default category you choose, so it's best to create your categories first;
- images in the folder are uploaded to your site, and external images (the old site, image hosts) can be downloaded too, so they survive the old site going away;
- everything is saved as drafts by default so you can check the layout before publishing; imported posts don't email your subscribers;
- after the import the page gives you Nginx 301 rules from old URLs to new ones: if the new site keeps the old domain, add them to your Nginx config and old links and search rankings keep working.

## 2. What you can change in the admin (no code)

| What | Where |
| --- | --- |
| Site name, browser title, site description (the text in search results), logo text, site language | Site settings → Basics |
| Logo image, site icon (favicon, all sizes generated), default share image, accent color, ghost mascot on/off | Site settings → Brand |
| Home page heading, subtitle, badge | Site settings → Home page hero |
| Home page “Start here” (which series to show) | Site settings → Home page “Start here” |
| Tilt and spotlight effects on article pages | Site settings → Article page motion |
| Tip QR codes, sponsor slot | Site settings → Sponsors and tips |
| Footer tagline, copyright, status text, footer columns and links | Site settings → Footer |
| Verification for Baidu / Google / Bing and other webmaster tools | Site settings → Search engine verification |
| Contact in `/.well-known/security.txt` | Site settings → Security contact |
| The “About” page | About page (`/about` is hidden while the text is empty) |
| Categories in the top navigation, their colors and nesting | Categories (the navigation is built from them) |
| Other links in the top navigation (About, friends, a community group…, before or after the categories) | Site settings → Top navigation links |
| Loading images from a CDN or object storage | Site settings → Image acceleration |
| Comments at the end of articles (Waline / Twikoo / Artalk / Giscus, off by default) | Site settings → Comments |
| Human verification for admin sign-in, email subscriptions and reader messages (Cloudflare Turnstile, off by default) | Site settings → Human verification |
| Blocking AI training crawlers in `robots.txt`, adding attribution to copied text (off by default) | Site settings → Anti-scraping |
| Chapters in a series (the “tutorial book” contents) | Series → edit a series → each tutorial's chapter |
| Uploaded images: reuse them, see where they're used, clean up unused ones | Media library |
| Accounts for co-authors (owner / editor / author), author bylines | Accounts; your own byline is under Account security |
| Your own admin interface language | The language menu at the bottom of the sidebar (or on the sign-in page) |
| Tags, series | Tags, Series |
| Email subscription (SMTP sending) | Email subscriptions |
| Security alert push (DingTalk / Feishu / WeCom / Telegram / Webhook) | Account security → Security alerts |

All of these are stored in the database and **never conflict with one-click updates**. The accent color changes buttons, links, charts and the generated share images together, and text colors are adjusted automatically to keep enough contrast.

> Why not just replace the icon and image files in the repository? One-click update checks whether the code on the server was modified and stops if it was (“The server has uncommitted local changes”), so it never overwrites your edits. That's why everything you can change in the admin lives in the admin.

## 3. Deployment and updates

| Deployment | How to update |
| --- | --- |
| **PM2 (`bash deploy.sh`), a clone of this repository with no code changes** | When the dot at the top right of the admin turns yellow, click it and enter your password |
| **Docker (`docker compose up -d` with the prebuilt image)** | `docker compose pull && docker compose up -d` (no one-click update in the admin) |
| **A fork with code changes** | Merge as described in “Syncing upstream updates” below, then `bash deploy.sh`; for Docker use the image your fork's GitHub Actions builds, or build it on the server (see “Docker deployment” in the [README](../README.en.md)) |

One-click update only accepts this repository (`vow132/tutorial-site`): if `origin` on the server is something else it refuses, so code of unknown origin never gets deployed to your server.

## 4. Changing code

### 4.1 Forking and syncing upstream updates

```bash
# Fork this repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/tutorial-site.git
cd tutorial-site
git remote add upstream https://github.com/vow132/tutorial-site.git

# Later, to pull in a new upstream version
git fetch upstream
git merge upstream/master        # resolve conflicts if any, then commit
npm ci && npx prisma migrate deploy && npm test
```

Keeping your changes in a few files makes merges much easier. Changes and upgrade notes for each version are in [CHANGELOG.md](../CHANGELOG.md) (Chinese).

### 4.2 Where common changes go

| What | File |
| --- | --- |
| Overall colors, radii, fonts and other design tokens | `@theme` in `app/globals.css` (prefer the admin for the accent color) |
| Article typography (headings, paragraphs, code blocks, tables) | `.article-body` in `app/globals.css` |
| Home page layout | `app/(site)/page.tsx` |
| Top navigation, footer | `components/site-header.tsx`, `components/capsule-nav.tsx`, `components/site-footer.tsx` |
| What the ghost mascot looks like | `components/mascot.tsx` (to just hide it, use the admin) |
| Tutorial cards | `components/tutorial-card.tsx` |
| Editor (toolbar, extensions) | `components/editor/`; new tags and attributes must also be allowed in `lib/sanitize.ts` |
| Interface text and translations | `lib/i18n/messages/<language>/` (Chinese is the reference; add new text to all four languages) |
| Seed data (sample content for new deployments) | `prisma/seed.ts`; if you change the sample tutorials' slugs, update `lib/sample-data.ts` too, or “Clear sample data” can't find them |

### 4.3 Adding a page

Taking `/links` (friend links) as an example:

1. Create `app/(site)/links/page.tsx` and build its metadata with `pageMetadata({ title, description, path: "/links" })` from `lib/seo.ts`; don't write your own `openGraph` / `alternates` (they replace the root layout's share image and RSS link entirely);
2. use `components/intent-link.tsx` for internal links, not `next/link`;
3. take the text from the dictionaries (`getSiteI18n()` in server components) rather than writing it into the page;
4. if search engines should index it, add the URL to `app/sitemap.ts`;
5. add a link to `/links` under “Site settings → Top navigation links” or “Footer → Footer columns”.

More architecture conventions (caching, database migrations, security requirements) are in [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.en.md](../CONTRIBUTING.en.md).

## 5. License

This project uses the [MIT license](../LICENSE): free for commercial use, modification and closed-source deployment, as long as you keep the original copyright and license notice in the source or distributed copies. You're responsible for the content you publish.
