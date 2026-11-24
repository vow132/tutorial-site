/**
 * 为已上传的正文图片补生成响应式小图（新上传的图片会自动生成）。
 *   npm run images:variants
 * 已存在的小图会跳过，可重复执行；完成后重启站点（pm2 restart 教程网，Docker 是 docker compose restart app），
 * 让文章渲染缓存重新探测小图。
 */
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { VARIANT_NAME, VARIANT_WIDTHS, variantName } from "../lib/image-variants";
import { createVariants } from "../lib/upload-image";

const dir = path.join(process.cwd(), "public", "uploads");

async function exists(file: string) {
  return stat(file).then(() => true, () => false);
}

async function main() {
  const names = (await readdir(dir).catch(() => [] as string[])).filter(
    (name) => /\.(png|jpe?g|webp)$/i.test(name) && !VARIANT_NAME.test(name),
  );
  let created = 0;
  let failed = 0;
  for (const name of names) {
    const targets = VARIANT_WIDTHS.map((width) => path.join(dir, variantName(name, width)));
    if ((await Promise.all(targets.map(exists))).every(Boolean)) continue;
    try {
      const variants = await createVariants(await readFile(path.join(dir, name)));
      for (const [width, data] of variants) {
        const target = path.join(dir, variantName(name, width));
        if (await exists(target)) continue;
        await writeFile(target, data);
        created++;
      }
    } catch (error) {
      failed++;
      console.warn(`跳过 ${name}：`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`✅ 检查了 ${names.length} 张图片，新生成 ${created} 张小图${failed ? `，${failed} 张失败` : ""}。`);
  if (created > 0) {
    const restart = process.env.DEPLOY_MODE === "docker" ? "docker compose restart app" : "pm2 restart 教程网";
    console.log(`请重启站点（${restart}）让文章重新使用小图。`);
  }
}

main();
