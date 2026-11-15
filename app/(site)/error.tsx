"use client";

export default function SiteError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-32 text-center">
      <h1 className="text-5xl font-extrabold text-ink">页面出错了</h1>
      <p className="mt-4 text-ink-2">
        内容加载失败，请重试；如果反复出现，请联系站长。
      </p>
      {digest && <p className="mt-2 text-xs text-ink-3">错误编号：{digest}</p>}
      <button
        type="button"
        // retry() 会重新请求服务端数据再渲染；reset() 只重渲染，服务端出错时点了也没用。
        onClick={() => retry()}
        className="mt-8 flex h-11 items-center rounded-full bg-btn px-6 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-[0.98]"
      >
        重试
      </button>
    </div>
  );
}
