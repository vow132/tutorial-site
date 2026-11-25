"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/** 读者留言：标记已读/未读、删除、全部标为已读（只影响后台，前台看不到留言）。 */

function refresh() {
  revalidatePath("/admin/feedback");
  revalidatePath("/admin");
}

export async function setFeedbackRead(formData: FormData) {
  await requireAuth("feedback");
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.feedbackMessage.updateMany({ where: { id }, data: { read: formData.get("read") === "1" } });
  refresh();
}

export async function deleteFeedbackMessage(formData: FormData) {
  await requireAuth("feedback");
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.feedbackMessage.deleteMany({ where: { id } });
  refresh();
}

export async function markAllFeedbackRead() {
  await requireAuth("feedback");
  await prisma.feedbackMessage.updateMany({ where: { read: false }, data: { read: true } });
  refresh();
}
