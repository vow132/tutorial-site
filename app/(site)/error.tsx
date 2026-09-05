"use client";

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-32 text-center">
      <h1 className="text-5xl font-extrabold text-ink">页面出错了</h1>
      <p className="mt-4 text-ink-2">
        内容加载失败，请重试；如果反复出现，请联系站长。
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-ink-3">错误编号：{error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-8 flex h-11 items-center rounded-full bg-btn px-6 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-[0.98]"
      >
        重试
      </button>
    </div>
  );
}
