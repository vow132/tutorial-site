/**
 * 上传图片的「引用」判断和回收目录（npm run uploads:clean 和后台图片库共用，两边结论一致）。
 * 纯 JS、只用 Node 内置模块：Docker 镜像里的运维脚本也直接引用它。
 *
 * - 引用：任意文本（教程正文、封面、缩略图、历史版本、站点设置、关于页）里出现的 /uploads/文件名；
 * - 响应式小图（-400w/-800w/-1200w.webp）跟着原图走，按「原图标识」（stem）比较；
 * - 删除不是真删：移到上传目录里的 .trash/<时间>/。和上传目录在同一个磁盘（Docker 的挂载卷）里，
 *   移动不会跨文件系统失败，容器重建也不会丢；有问题时把文件移回来即可。
 */
import path from "node:path";

const VARIANT = /-\d+w\.webp$/i;

/** 回收目录名（在上传目录里；以 . 开头，列表和清理都会跳过它） */
export const UPLOADS_TRASH = ".trash";

/** 最近这么多天内上传的文件不算「没用」：可能在还没保存的草稿里 */
export const RECENT_UPLOAD_DAYS = 7;

/** 文件名 → 「原图」标识：去掉响应式小图后缀和扩展名。 */
export function uploadStem(name) {
  return name.replace(VARIANT, "").replace(/\.[a-z0-9]+$/i, "");
}

export function isVariantName(name) {
  return VARIANT.test(name);
}

/** 文本里引用到的上传文件名（原样，可能是小图）。 */
export function uploadNamesIn(text) {
  if (!text) return [];
  return [...String(text).matchAll(/\/uploads\/([\w.-]+)/g)].map((match) => match[1]);
}

/** 从任意文本里找出引用的上传文件，返回它们的 stem 集合。 */
export function referencedStems(texts) {
  const stems = new Set();
  for (const text of texts) for (const name of uploadNamesIn(text)) stems.add(uploadStem(name));
  return stems;
}

/** 这次移进回收站用的子目录：<上传目录>/.trash/20261126-093000 */
export function trashDir(uploadsDir, date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return path.join(uploadsDir, UPLOADS_TRASH, stamp);
}
