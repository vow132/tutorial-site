import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createVariants, detectImageFormat, optimizeImage } from "./upload-image";

const solid = (width: number, height: number, background: string) =>
  sharp({ create: { width, height, channels: 3, background } });

test("formats are detected by magic bytes, not by name or MIME", async () => {
  assert.equal(detectImageFormat(await solid(4, 4, "#fff").png().toBuffer()), ".png");
  assert.equal(detectImageFormat(await solid(4, 4, "#fff").jpeg().toBuffer()), ".jpg");
  assert.equal(detectImageFormat(await solid(4, 4, "#fff").gif().toBuffer()), ".gif");
  assert.equal(detectImageFormat(await solid(4, 4, "#fff").webp().toBuffer()), ".webp");
  assert.equal(detectImageFormat(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(detectImageFormat(Buffer.from("<html><script>alert(1)</script>")), null);
});

test("large photos are resized to 1600px WebP without EXIF", async () => {
  const jpeg = await solid(3000, 2000, "#3366ff")
    .jpeg()
    .withExif({ IFD0: { Copyright: "secret location" } })
    .toBuffer();
  const { data, ext } = await optimizeImage(jpeg, ".jpg");
  const meta = await sharp(data).metadata();
  assert.equal(ext, ".webp");
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 1600);
  assert.equal(meta.exif, undefined);
});

test("animated WebP keeps every frame", async () => {
  const frames = await Promise.all(
    ["#ff0000", "#0000ff"].map((color) => solid(300, 200, color).png().toBuffer()),
  );
  const animated = await sharp(frames, { join: { animated: true } })
    .webp({ loop: 0, delay: [300, 300] })
    .toBuffer();
  const { data, ext } = await optimizeImage(animated, ".webp");
  assert.equal(ext, ".webp");
  assert.equal(data, animated);
  assert.equal((await sharp(data, { animated: true }).metadata()).pages, 2);
});

test("oversized images are rejected instead of being decoded", async () => {
  // 8000×6000 = 48MP, above the 40MP decode limit.
  const huge = await solid(8000, 6000, "#000").png({ compressionLevel: 9 }).toBuffer();
  await assert.rejects(optimizeImage(huge, ".png"));
});

test("wide images get 400w, 800w and 1200w responsive variants", async () => {
  const { data } = await optimizeImage(await solid(3000, 1500, "#3366ff").jpeg().toBuffer(), ".jpg");
  const variants = await createVariants(data);
  assert.deepEqual(variants.map(([width]) => width), [400, 800, 1200]);
  for (const [width, buffer] of variants) {
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, width);
  }
  const medium = await createVariants(await solid(1000, 500, "#fff").png().toBuffer());
  assert.deepEqual(medium.map(([width]) => width), [400, 800]);
  const small = await createVariants(await solid(900, 500, "#fff").png().toBuffer());
  assert.deepEqual(small.map(([width]) => width), [400]);
  assert.deepEqual(await createVariants(await solid(440, 300, "#fff").png().toBuffer()), []);
});

test("animated images get no variants (re-encoding would drop frames)", async () => {
  const frames = await Promise.all(
    ["#ff0000", "#0000ff"].map((color) => solid(1600, 900, color).png().toBuffer()),
  );
  const animated = await sharp(frames, { join: { animated: true } }).webp({ loop: 0 }).toBuffer();
  assert.deepEqual(await createVariants(animated), []);
  assert.deepEqual(await createVariants(await solid(1600, 900, "#fff").gif().toBuffer()), []);
});
