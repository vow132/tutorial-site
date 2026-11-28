import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { isDemoMode } from "@/lib/demo";
import { getAdminI18n } from "@/lib/i18n/server";
import { storeUploadedImage } from "@/lib/upload-store";
import { can } from "@/lib/roles";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  const { m } = await getAdminI18n();
  if (!admin) {
    return NextResponse.json({ error: m.admin.sessionExpired }, { status: 401 });
  }
  // 所有角色都要上传图片（写教程、关于页、站点设置）；作者也有 tutorials 权限
  if (!can(admin.role, "tutorials")) return NextResponse.json({ error: m.admin.forbidden }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ error: m.admin.demoReadOnly }, { status: 403 });

  // 先看声明的长度，避免把超大请求体整个读进内存。
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_SIZE + 64 * 1024) {
    return NextResponse.json({ error: m.admin.upload.tooLarge }, { status: 413 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: m.admin.upload.noFile }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: m.admin.upload.tooLarge }, { status: 400 });
  }

  const stored = await storeUploadedImage(Buffer.from(await file.arrayBuffer()));
  if ("error" in stored) {
    return NextResponse.json({ error: m.admin.upload[stored.error] }, { status: 400 });
  }
  await audit("upload", {
    actor: admin.username,
    detail: `${stored.name} (${file.size} → ${stored.bytes} B)`,
  });

  return NextResponse.json({ url: stored.url });
}
