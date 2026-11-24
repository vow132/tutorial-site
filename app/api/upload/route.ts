import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { DEMO_READ_ONLY_MESSAGE, isDemoMode } from "@/lib/demo";
import { storeUploadedImage } from "@/lib/upload-store";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "未登录或会话已过期" }, { status: 401 });
  }
  if (isDemoMode()) return NextResponse.json({ error: DEMO_READ_ONLY_MESSAGE }, { status: 403 });

  // 先看声明的长度，避免把超大请求体整个读进内存。
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_SIZE + 64 * 1024) {
    return NextResponse.json({ error: "图片不能超过 5MB" }, { status: 413 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "图片不能超过 5MB" }, { status: 400 });
  }

  const stored = await storeUploadedImage(Buffer.from(await file.arrayBuffer()));
  if ("error" in stored) {
    return NextResponse.json({ error: stored.error }, { status: 400 });
  }
  await audit("upload", {
    actor: admin.username,
    detail: `${stored.name}（${file.size} → ${stored.bytes} 字节）`,
  });

  return NextResponse.json({ url: stored.url });
}
