# Security policy

[简体中文](SECURITY.md) | **English**

## Supported versions

Only the latest code on `master` and the latest release receive security fixes. Stay current with one-click update or `git pull`; if you forked and changed the code, watch this repository's security updates and merge them promptly.

| Version | Security fixes |
| --- | --- |
| Latest 1.x | ✅ |
| Commits before 1.0.0 | ❌ Please upgrade first |

## Reporting a vulnerability

**Please don't post vulnerability details in public issues, discussions or pull requests.** Use GitHub's private vulnerability reporting:

1. open this repository's **Security** page;
2. click **Report a vulnerability** ([direct link](https://github.com/vow132/tutorial-site/security/advisories/new)) and fill in the details below.

If that doesn't work, open an issue **without any details** saying “I need to report a security issue privately” and a maintainer will contact you.

A good report includes:

- the affected feature or file and the version you tested (bottom of the admin sidebar);
- steps to reproduce or a proof of concept (test only on your own deployment);
- the possible impact, such as unauthorized admin access, reading other people's data or running arbitrary code.

Reports can be written in English or Chinese.

## What happens next

- You'll usually get a reply within 3 days confirming whether the issue is valid;
- once confirmed, it's fixed, released and described in [CHANGELOG.md](CHANGELOG.md) (impact and how to upgrade only, no exploit details);
- if you like, you'll be credited in the changelog.

## Scope

This policy covers **the code in this repository** only. If a site built from this code has a problem (misconfiguration, leaked passwords, content issues), contact that site's owner: if the owner filled in a security contact in the admin, you'll find it at `/.well-known/security.txt` on that site.

How site owners harden their own sites is covered under “Security hardening” in [README.en.md](README.en.md).
