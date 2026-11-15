/** 正文图片响应式小图的命名约定（纯函数，渲染端不需要加载 sharp）。 */

/**
 * 响应式小图宽度：800 给普通手机/2 倍屏的窄屏，1200 给 3 倍屏手机
 * （iPhone 正文栏约 360px × 3 ≈ 1080px，没有 1200 时浏览器只能下载 1600 的原图）。
 */
export const VARIANT_WIDTHS = [800, 1200] as const;
/** 原图至少比小图宽 15% 才值得多存一份。 */
export const VARIANT_MIN_GAIN = 1.15;

/** 小图文件名：1700000000000-abcdef.webp → 1700000000000-abcdef-800w.webp */
export function variantName(name: string, width: number) {
  return name.replace(/\.[a-z0-9]+$/i, "") + `-${width}w.webp`;
}

/** 小图自身的文件名（用于跳过已经是小图的文件）。 */
export const VARIANT_NAME = /-\d+w\.webp$/i;
