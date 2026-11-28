import { notFound } from "next/navigation";

/**
 * 前台没有的地址：proxy.ts 把所有前台请求都改写进 app/[lang]，匹配不到具体页面的落到这里，
 * 显示带顶栏和页脚的 404 页（app/[lang]/not-found.tsx），而不是 Next 默认的空白 404。
 */
export default function MissingPage(): never {
  notFound();
}
