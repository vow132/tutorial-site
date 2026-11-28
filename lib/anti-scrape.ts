/*
 * 站点设置里的「防爬」（纯函数：类型、默认值、读取，robots.txt 规则，复制时附上的来源）。
 * 前台的公开内容浏览器看得到，程序就抓得到：这里做的是让守规矩的 AI 训练爬虫别来，以及被复制转载时带上出处。
 * 真正拦得住的是 Cloudflare 的 Bot Fight Mode / WAF 限速（README「接入 Cloudflare」）。
 */

export type AntiScrapeSettings = {
  /** robots.txt 里拒绝 AI 训练爬虫（搜索引擎照常收录） */
  blockAiCrawlers: boolean;
  /** 复制正文时在后面附上「来源：标题 + 原文链接」 */
  copyAttribution: boolean;
};

export const defaultAntiScrape: AntiScrapeSettings = { blockAiCrawlers: false, copyAttribution: false };

export function readAntiScrape(raw: unknown): AntiScrapeSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof AntiScrapeSettings, unknown>>;
  return { blockAiCrawlers: value.blockAiCrawlers === true, copyAttribution: value.copyAttribution === true };
}

/**
 * 只抓内容去训练大模型的爬虫（robots.txt 的 User-agent 名称，大小写不敏感）。
 * 不包括搜索引擎（Googlebot、Bingbot、Baiduspider……），也不包括 AI 搜索的检索爬虫和替用户打开网页的
 * 抓取器（OAI-SearchBot、ChatGPT-User、Claude-SearchBot、Claude-User、PerplexityBot……）：
 * 拦了它们，网站会从 AI 搜索的结果和引用里消失，读者来源变少，而内容照样可以被训练爬虫以外的方式拿走。
 * 名单参考各家公开的说明和 github.com/ai-robots-txt/ai.robots.txt，有新的再往里加。
 */
export const AI_TRAINING_CRAWLERS = [
  "GPTBot", // OpenAI 训练
  "ClaudeBot", // Anthropic 训练
  "anthropic-ai", // Anthropic 旧名称
  "Google-Extended", // Google 的 Gemini 训练开关，不影响 Google 搜索收录
  "Applebot-Extended", // Apple 的模型训练开关，不影响 Siri / Spotlight 搜索
  "CCBot", // Common Crawl，很多大模型的训练数据来源
  "Bytespider", // 字节跳动
  "Meta-ExternalAgent", // Meta 训练
  "FacebookBot", // Meta 语言模型（不是分享预览用的 facebookexternalhit）
  "cohere-training-data-crawler", // Cohere 训练
  "AI2Bot", // Allen Institute for AI 训练
  "PanguBot", // 华为盘古大模型
] as const;

/** robots.txt 里额外的一组规则：拒绝 AI 训练爬虫抓取全站。 */
export function aiCrawlerRule(): { userAgent: string[]; disallow: string } {
  return { userAgent: [...AI_TRAINING_CRAWLERS], disallow: "/" };
}

/** 选中这么多字以上才附来源：复制一个词、一行命令不打扰 */
export const COPY_ATTRIBUTION_MIN_LENGTH = 50;

/** 复制的文字后面附上的来源（纯文本和 HTML 两种）。label 是网站语言的「来源：」（m.reader.article.copySource）。 */
export function copyAttribution(title: string, url: string, label = "来源：") {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return {
    text: `\n\n${label}${title} ${url}`,
    html: `<p>${escape(label)}<a href="${escape(url)}">${escape(title)}</a> ${escape(url)}</p>`,
  };
}
