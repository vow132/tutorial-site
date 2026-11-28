"use client";

import "./globals.css";

/*
 * 根布局出错时连站点设置都读不到，不知道网站语言：按浏览器语言在四种语言里挑一个（文案很少，直接写在这里）。
 */
const TEXT = {
  "zh-CN": { title: "页面出错了", message: "网站暂时无法显示，请稍后重试；如果反复出现，请联系站长。", digest: "错误编号：", retry: "重试" },
  en: { title: "Something went wrong", message: "The site can't be shown right now. Please try again; if it keeps happening, contact the site owner.", digest: "Error ID: ", retry: "Try again" },
  ru: { title: "Что-то пошло не так", message: "Сайт сейчас недоступен. Попробуйте ещё раз; если ошибка повторяется, напишите владельцу сайта.", digest: "Код ошибки: ", retry: "Повторить" },
  ja: { title: "エラーが発生しました", message: "サイトを表示できません。しばらくしてから再度お試しください。繰り返し発生する場合はサイト管理者にご連絡ください。", digest: "エラー番号：", retry: "再試行" },
} as const;

function pickLanguage(): keyof typeof TEXT {
  const language = typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  if (language.startsWith("zh")) return "zh-CN";
  if (language.startsWith("ru")) return "ru";
  if (language.startsWith("ja")) return "ja";
  return language.startsWith("en") ? "en" : "zh-CN";
}

/**
 * 根布局本身出错时的兜底页（替换整个根布局，所以要自带 html/body 和样式）。
 * 不显示错误详情，只给出错误编号方便对照服务端日志。
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  const lang = pickLanguage();
  const t = TEXT[lang];
  return (
    <html lang={lang} data-theme="light">
      <body className="min-h-full bg-paper">
        <title>{t.title}</title>
        <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 text-center">
          <h1 className="text-4xl font-extrabold text-ink">{t.title}</h1>
          <p className="mt-4 text-ink-2">{t.message}</p>
          {digest && <p className="mt-2 text-xs text-ink-3">{t.digest}{digest}</p>}
          <div className="mt-8">
            <button
              type="button"
              onClick={() => retry()}
              className="flex h-11 items-center rounded-full bg-btn px-6 text-sm font-semibold text-white"
            >
              {t.retry}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
