import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * 定时发布：教程设了 publishAt 且未发布，到点后自动发布。
 *
 * 发布后要刷新前台缓存，而 revalidateTag 只能在请求里调用，所以定时器（instrumentation 启动）
 * 不直接改库，而是带一个本进程随机生成的口令请求本机的 /api/internal/publish-due，
 * 由那个接口发布并刷新缓存。口令只存在进程内存里，外部无法调用该接口。
 */
const globalForScheduler = globalThis as typeof globalThis & {
  __schedulerToken?: string;
  __publishTimer?: boolean;
};

export function schedulerToken() {
  globalForScheduler.__schedulerToken ??= randomBytes(32).toString("hex");
  return globalForScheduler.__schedulerToken;
}

/** 发布所有到期的定时教程；「发布于」取设定的发布时间。返回实际发布的教程。 */
export async function publishDueTutorials(now = new Date()) {
  const due = await prisma.tutorial.findMany({
    where: { published: false, publishAt: { lte: now } },
    select: { id: true, slug: true, title: true, publishAt: true },
  });
  const published: typeof due = [];
  for (const tutorial of due) {
    // 条件更新：期间被手动改过（取消定时、改了时间）就跳过
    const { count } = await prisma.tutorial.updateMany({
      where: { id: tutorial.id, published: false, publishAt: tutorial.publishAt },
      data: { published: true, publishAt: null, createdAt: tutorial.publishAt! },
    });
    if (count === 1) published.push(tutorial);
  }
  return published;
}

/** 由 instrumentation.ts 在服务启动时调用。检查间隔默认 60 秒（SCHEDULE_CHECK_SECONDS 可调，测试用）。 */
export function startPublishTimer() {
  if (globalForScheduler.__publishTimer) return;
  globalForScheduler.__publishTimer = true;
  const every = Math.max(2, Number(process.env.SCHEDULE_CHECK_SECONDS) || 60) * 1000;
  const run = async () => {
    // Next 在开始监听后才写入 PORT
    const port = process.env.PORT;
    if (!port) return;
    const due = await prisma.tutorial.count({ where: { published: false, publishAt: { lte: new Date() } } });
    if (due === 0) return;
    const origin = process.env.__NEXT_PRIVATE_ORIGIN || `http://127.0.0.1:${port}`;
    const response = await fetch(`${origin}/api/internal/publish-due`, {
      method: "POST",
      headers: { "x-scheduler-token": schedulerToken() },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  };
  setInterval(() => void run().catch((error) => console.error("[scheduled-publish]", error)), every).unref();
}
