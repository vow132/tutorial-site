/** 动态路由参数不会自动解码；畸形的 % 序列让 decodeURIComponent 抛错，按 404 处理。 */
export function decodeSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
