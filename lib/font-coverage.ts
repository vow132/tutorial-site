/**
 * 读 TrueType/OpenType 字体的 cmap 表，得到字体实际包含的字符（码点集合）。
 * 分享图只绘制字体里有的字：缺字时 next/og 会去 Google Fonts 下载补字，
 * 国内服务器访问不到会卡住，所以宁可把缺的字略去。
 */
export function fontCoverage(data: Uint8Array): Set<number> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const numTables = view.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(...data.subarray(record, record + 4));
    if (tag === "cmap") cmap = view.getUint32(record + 8);
  }
  if (cmap < 0) throw new Error("字体缺少 cmap 表");

  // 选子表：Unicode 全集（format 12）优先，其次 BMP（format 4）。
  const count = view.getUint16(cmap + 2);
  const subtables: Array<{ format: number; offset: number }> = [];
  for (let i = 0; i < count; i++) {
    const record = cmap + 4 + i * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = cmap + view.getUint32(record + 4);
    if (platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))) {
      subtables.push({ format: view.getUint16(offset), offset });
    }
  }
  const table = subtables.find((item) => item.format === 12) ?? subtables.find((item) => item.format === 4);
  if (!table) throw new Error("字体没有可用的 Unicode cmap 子表");

  const covered = new Set<number>();
  if (table.format === 12) {
    const groups = view.getUint32(table.offset + 12);
    for (let i = 0; i < groups; i++) {
      const group = table.offset + 16 + i * 12;
      const start = view.getUint32(group);
      const end = view.getUint32(group + 4);
      const glyph = view.getUint32(group + 8);
      for (let code = start; code <= end; code++) {
        if (glyph + (code - start) !== 0) covered.add(code);
      }
    }
    return covered;
  }

  const segments = view.getUint16(table.offset + 6) / 2;
  const ends = table.offset + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  for (let i = 0; i < segments; i++) {
    const start = view.getUint16(starts + i * 2);
    const end = view.getUint16(ends + i * 2);
    const delta = view.getInt16(deltas + i * 2);
    const rangeOffset = view.getUint16(rangeOffsets + i * 2);
    for (let code = start; code <= end && code !== 0xffff; code++) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        const address = rangeOffsets + i * 2 + rangeOffset + (code - start) * 2;
        const raw = view.getUint16(address);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) covered.add(code);
    }
  }
  return covered;
}
