import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { overlay, readableOn } from "@/lib/color";
import { fontCoverage } from "@/lib/font-coverage";
import { SHARE_IMAGE_SIZE, keepDrawable, titleLayout, type ShareCard } from "@/lib/share-image";
import { SITE_URL } from "@/lib/site-url";

const FONT_FILE = path.join(process.cwd(), "assets", "fonts", "NotoSansSC-Bold-subset.ttf");
const FONT_NAME = "Noto Sans SC";

type LoadedFont = { data: ArrayBuffer; covered: Set<number> };
let fontTask: Promise<LoadedFont> | null = null;

function loadFont() {
  fontTask ??= readFile(FONT_FILE)
    .then((buffer) => {
      const bytes = new Uint8Array(buffer);
      return {
        data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        covered: fontCoverage(bytes),
      };
    })
    .catch((error) => {
      fontTask = null;
      throw error;
    });
  return fontTask;
}

/** 渲染好的 PNG 按内容版本缓存：同一篇文章被反复抓取时不重复绘制。 */
const cache = new Map<string, Uint8Array>();
const MAX_CACHED = 100;

export async function renderShareImage(key: string, card: ShareCard): Promise<Uint8Array> {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const font = await loadFont();
  const draw = (text: string) => keepDrawable(text, font.covered);
  const title = titleLayout(draw(card.title) || draw(card.siteName));
  // 分类小字：在 #f7f8fa 底和分类色淡底上都达到 4.5:1
  const categoryInk = readableOn(card.categoryColor, ["#f7f8fa", overlay(card.categoryColor, 0x1f / 255, "#f7f8fa")], "#000000");
  const host = new URL(SITE_URL).host;
  const accent = /^#[0-9a-f]{6}$/i.test(card.accent ?? "") ? card.accent! : "#6366f1";
  // Logo 方块上的白字、右下角的小字都要看得清
  const badge = readableOn(accent, ["#ffffff"], "#000000", 4.5);
  const ctaInk = readableOn(accent, ["#f7f8fa"], "#000000");

  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#f7f8fa",
          backgroundImage:
            `radial-gradient(circle at 88% 0%, ${accent}33, ${accent}00 55%), radial-gradient(circle at 0% 100%, rgba(14,165,233,0.12), rgba(14,165,233,0) 50%)`,
          fontFamily: FONT_NAME,
          color: "#111827",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 18,
              backgroundColor: badge,
              color: "#ffffff",
              fontSize: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {draw(card.logoText) || "教"}
          </div>
          <div style={{ fontSize: 32 }}>{draw(card.siteName)}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <div style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 22px",
                borderRadius: 999,
                backgroundColor: `${card.categoryColor}1f`,
                color: categoryInk,
                fontSize: 28,
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: card.categoryColor }} />
              {draw(card.categoryName)}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: title.fontSize, lineHeight: 1.28, letterSpacing: -0.5 }}>
            {title.text}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: "#6b7280" }}>
          <div>{draw(host)}</div>
          <div style={{ color: ctaInk }}>{draw(card.cta ?? "阅读教程 →") || "→"}</div>
        </div>
      </div>
    ),
    {
      ...SHARE_IMAGE_SIZE,
      fonts: [{ name: FONT_NAME, data: font.data, weight: 700, style: "normal" }],
    },
  );
  const png = new Uint8Array(await response.arrayBuffer());

  cache.set(key, png);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return png;
}

/**
 * 字母图标（没上传网站图标时的默认图标）：主题色圆角方块 + 白色 Logo 文字，和页面左上角的 Logo 一样。
 * 只画字体里有的字；一个字都画不了时只画色块。
 */
export async function renderLetterIcon(text: string, background: string, size: number): Promise<Uint8Array> {
  const key = `icon:${text}:${background}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const font = await loadFont();
  const letters = Array.from(keepDrawable(text, font.covered).replace(/\s/g, "")).slice(0, 3);
  const fontSize = Math.round(size * (letters.length <= 1 ? 0.56 : letters.length === 2 ? 0.4 : 0.3));
  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: background,
          // 180 是 iOS 桌面图标：系统自己切圆角，这里铺满
          borderRadius: size === 180 ? 0 : Math.round(size * 0.22),
          color: "#ffffff",
          fontFamily: FONT_NAME,
          fontSize,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {letters.join("")}
      </div>
    ),
    { width: size, height: size, fonts: [{ name: FONT_NAME, data: font.data, weight: 700, style: "normal" }] },
  );
  const png = new Uint8Array(await response.arrayBuffer());
  cache.set(key, png);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return png;
}
