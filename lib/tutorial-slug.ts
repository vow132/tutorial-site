/**
 * 教程网址别名：小写字母、数字、中文和连字符，最长 80 个字符；为空时按标题生成，标题也没有可用字符时生成一个随机的。
 * 发文表单（lib/actions/tutorials.ts）和批量导入（lib/actions/tutorial-import.ts）共用。
 */
export function normalizeSlug(input: string, title: string) {
  const raw = (input || title).toLowerCase().trim();
  const slug = raw
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || `tutorial-${Date.now().toString(36)}`;
}
