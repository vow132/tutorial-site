import { timingSafeEqual } from "node:crypto";
import { audit, SCHEDULER_ACTOR } from "@/lib/audit";
import { revalidatePublic } from "@/lib/revalidate-public";
import { publishDueTutorials, schedulerToken } from "@/lib/scheduled-publish";
import { notifyNewTutorial } from "@/lib/subscription-notify";

/** 只给本进程的定时器调用（见 lib/scheduled-publish.ts），口令不对一律 404。 */
export async function POST(request: Request) {
  const given = Buffer.from(request.headers.get("x-scheduler-token") ?? "");
  const expected = Buffer.from(schedulerToken());
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Not Found", { status: 404 });
  }
  const published = await publishDueTutorials();
  if (published.length > 0) {
    revalidatePublic(...published.map((tutorial) => tutorial.slug));
    for (const tutorial of published) {
      await audit("tutorial.publish", { actor: SCHEDULER_ACTOR, detail: `#${tutorial.id} ${tutorial.title}` });
      notifyNewTutorial(tutorial.id);
    }
  }
  return Response.json({ published: published.length }, { headers: { "Cache-Control": "no-store" } });
}
