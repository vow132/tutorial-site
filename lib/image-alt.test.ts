import assert from "node:assert/strict";
import test from "node:test";
import { altFromFileName } from "./image-alt";

test("meaningful file names become image descriptions", () => {
  assert.equal(altFromFileName("flexbox-main-axis.png"), "flexbox main axis");
  assert.equal(altFromFileName("Grid_布局_示意图.webp"), "Grid 布局 示意图");
  assert.equal(altFromFileName("Docker 架构图.JPG"), "Docker 架构图");
});

test("camera, screenshot and pasted names are left empty", () => {
  for (const name of [
    "image.png",
    "IMG_2024.JPG",
    "DSC01234.jpg",
    "PXL_20240101_123456.jpg",
    "Screenshot 2024-01-01 at 10.00.00.png",
    "屏幕截图 2024-05-01 101010.png",
    "微信图片_20240101.jpg",
    "截图(2).png",
    "20240101123456.png",
    "3f2a9c1e-77b0-4c1a-9a51-0e6b9d1f2a3b.webp",
    ".png",
  ]) {
    assert.equal(altFromFileName(name), "", name);
  }
});
