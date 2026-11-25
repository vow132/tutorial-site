import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-auth";
import { deleteFeedbackMessage, markAllFeedbackRead, setFeedbackRead } from "@/lib/actions/feedback";
import { prisma } from "@/lib/prisma";
import Pagination from "@/components/pagination";
import DeleteMessageButton from "./delete-message-button";

export const metadata: Metadata = { title: "读者留言" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const formatTime = (date: Date) =>
  date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" });

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; show?: string }>;
}) {
  await requireAdminPage("feedback");
  const { page: rawPage, show } = await searchParams;
  const unreadOnly = show !== "all";
  const where = unreadOnly ? { read: false } : {};
  const [total, unread] = await Promise.all([prisma.feedbackMessage.count({ where }), prisma.feedbackMessage.count({ where: { read: false } })]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(Number.parseInt(rawPage ?? "1", 10) || 1, 1), totalPages);
  const messages = await prisma.feedbackMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, message: true, read: true, createdAt: true, tutorial: { select: { id: true, title: true, slug: true } } },
  });

  const tab = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm transition-colors ${active ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-2 hover:bg-paper hover:text-ink"}`;

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">读者留言</h1>
          <p className="mt-1 text-sm text-ink-3">读者点「没帮助」之后写下的话，只有你能看到，适合拿来改稿。</p>
        </div>
        {unread > 0 && (
          <form action={markAllFeedbackRead}>
            <button type="submit" className="rounded-full border border-line px-4 py-2 text-sm text-ink-2 transition-colors hover:bg-paper hover:text-ink">
              全部标为已读
            </button>
          </form>
        )}
      </div>

      <nav aria-label="留言筛选" className="mt-5 flex gap-2">
        <Link href="/admin/feedback" className={tab(unreadOnly)} aria-current={unreadOnly ? "page" : undefined}>
          未读（{unread}）
        </Link>
        <Link href="/admin/feedback?show=all" className={tab(!unreadOnly)} aria-current={unreadOnly ? undefined : "page"}>
          全部
        </Link>
      </nav>

      {messages.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-line bg-surface/60 py-16 text-center text-sm text-ink-3">
          {unreadOnly ? "没有未读留言" : "还没有读者留言"}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {messages.map((item) => (
            <li
              key={item.id}
              className={`rounded-2xl border bg-surface p-5 ${item.read ? "border-line" : "border-accent/40"}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                {!item.read && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent-ink">未读</span>}
                <Link href={`/admin/tutorials/${item.tutorial.id}`} className="font-medium text-ink-2 hover:text-accent-ink">
                  {item.tutorial.title}
                </Link>
                <time dateTime={item.createdAt.toISOString()}>{formatTime(item.createdAt)}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{item.message}</p>
              <div className="mt-3 flex items-center gap-2">
                <form action={setFeedbackRead}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="read" value={item.read ? "0" : "1"} />
                  <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:bg-paper hover:text-ink">
                    {item.read ? "标为未读" : "标为已读"}
                  </button>
                </form>
                <Link
                  href={`/tutorials/${item.tutorial.slug}`}
                  prefetch={false}
                  target="_blank"
                  className="rounded-lg px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:bg-paper hover:text-ink"
                >
                  查看文章
                </Link>
                <DeleteMessageButton id={item.id} action={deleteFeedbackMessage} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} basePath="/admin/feedback" query={unreadOnly ? {} : { show: "all" }} />
    </div>
  );
}
