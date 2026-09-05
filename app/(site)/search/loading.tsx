export default function SiteLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-20" aria-busy="true" aria-label="加载中">
      {/* Hero 骨架 */}
      <div className="flex flex-col items-center">
        <div className="h-7 w-44 animate-pulse rounded-full bg-paper" />
        <div className="mt-6 h-12 w-[min(36rem,80vw)] animate-pulse rounded-2xl bg-paper" />
        <div className="mt-4 h-12 w-[min(28rem,70vw)] animate-pulse rounded-2xl bg-paper" />
        <div className="mt-6 h-5 w-[min(30rem,75vw)] animate-pulse rounded-full bg-paper" />
        <div className="mt-9 flex gap-3">
          <div className="h-12 w-36 animate-pulse rounded-full bg-paper" />
          <div className="h-12 w-36 animate-pulse rounded-full bg-paper" />
        </div>
      </div>
      {/* 卡片网格骨架 */}
      <div className="mt-20 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-3xl border border-line bg-surface"
            style={{ animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </div>
    </div>
  );
}
