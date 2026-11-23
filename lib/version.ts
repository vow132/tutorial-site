import pkg from "@/package.json";

/** 程序版本（package.json），发版时和 CHANGELOG.md 一起改。 */
export const SITE_VERSION: string = pkg.version;

/**
 * 后台侧栏显示的版本：「v1.0.0 · 提交号前 7 位」。只在服务端算好、登录后才传给页面，
 * 不写进公开的 JS 包（攻击者看不到站点跑的是哪个版本）。
 */
export function versionLabel(revision = process.env.SITE_BUILD_REVISION): string {
  return revision && /^[a-f0-9]{40}$/.test(revision) ? `v${SITE_VERSION} · ${revision.slice(0, 7)}` : `v${SITE_VERSION}`;
}
