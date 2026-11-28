// Run after bun run build and bun run preview. CHROMIUM_PATH can select a system binary.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://127.0.0.1:5318/";
const out = process.argv[3] ?? "out/mvs-tract";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const capture = async (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const openPlay = async (page, href = url) => {
  await page.goto(href);
  await page.getByRole("radio", { name: "Play", exact: true }).click();
  await page.locator(".s-folds canvas").waitFor();
};
const watch = (page) => {
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
};
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const hashFolds = async (page) => {
  await page.addStyleTag({ content: ".s-folds .screen-body { flex: none; width: 300px; height: 180px; }" });
  const canvas = page.locator(".s-folds canvas");
  await page.waitForFunction(() => {
    const el = document.querySelector(".s-folds canvas");
    if (el?.width !== 300 || el.height !== 180) return false;
    return el.getContext("2d").getImageData(0, 0, 300, 180).data.some((n, i) => i % 4 !== 3 && n > 0);
  });
  const png = await canvas.evaluate((c) => c.toDataURL());
  return createHash("sha256").update(png).digest("hex");
};

try {
  for (const width of [320, 375, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width < 768 ? 830 : 950 }, deviceScaleFactor: 1 });
    watch(page);
    await openPlay(page);
    assert.equal(await page.locator(".mvs-tract").count(), 1);
    assert.ok(await fits(page), `horizontal overflow in tract at ${width}`);
    // The exact same 2D renderer still paints in the themed layout.
    await page.waitForFunction(() => {
      const c = document.querySelector(".anatomy canvas");
      return c?.width > 100 && c?.height > 100 && c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some((n, i) => i % 4 !== 3 && n > 0);
    });
    if (width === 1440) {
      await page.getByRole("button", { name: "Breathe", exact: true }).click();
      await page.waitForFunction(() => {
        const t = window.__chimeraEngine?.latest?.t;
        return t?.outRms > 0.001 && t.glottalArea?.some((x) => x > 0.001) && t.glottalFlow?.length > 0;
      });
      const folds = page.locator(".s-folds canvas");
      const first = await folds.evaluate((c) => c.toDataURL());
      await page.waitForFunction((p) => document.querySelector(".s-folds canvas")?.toDataURL() !== p, first);
      await capture(page, "desktop-live");
      await page.getByRole("checkbox", { name: "3D", exact: true }).check();
      await page.getByRole("img", { name: /Vocal tract in 3D/ }).waitFor();
      assert.equal(await page.locator(".no-webgl").count(), 0);
      await page.waitForTimeout(350);
      await capture(page, "desktop-3d");
      await page.getByRole("radio", { name: "Bestiary", exact: true }).click();
      await page.locator(".creature-canvas").waitFor();
      await page.getByRole("radio", { name: "Play", exact: true }).click();
    }
    if (width === 375) await capture(page, "phone-play");
    await page.getByRole("link", { name: "악보 작업실", exact: true }).click();
    await page.waitForURL(/\/studio\/$/);
    assert.ok(await fits(page), `horizontal overflow in studio at ${width}`);
    if (width === 1440) {
      await page.locator("#example").click();
      await page.waitForFunction(() => document.querySelectorAll(".note").length > 1);
      await page.locator("#render").click();
      await page.waitForFunction(() => document.querySelector("audio")?.src.startsWith("blob:"));
    }
    await page.getByRole("link", { name: /성대 실험실/ }).click();
    await page.locator(".mvs-tract").waitFor();
    await page.close();
  }

  // 300×180 and no audio: pixel identical data from the original stroboscope in both shells.
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
  watch(page);
  await openPlay(page);
  const themed = await hashFolds(page);
  await page.getByRole("link", { name: "원본 테마", exact: true }).click();
  await page.waitForURL(/theme=original/);
  await page.getByRole("radio", { name: "Play", exact: true }).click();
  assert.equal(await page.locator(".mvs-tract").count(), 0);
  const original = await hashFolds(page);
  assert.equal(themed, original, "idle vocal-fold canvas differs between themes");
  await page.getByRole("link", { name: "먀용 테마", exact: true }).click();
  await page.locator(".mvs-tract").waitFor();
  assert.deepEqual(errors, []);
  console.log(`Responsive roundtrip: 320 / 375 / 768 / 1440. Live folds and 3D/bestiary: OK. Idle fold canvas SHA-256: ${themed}`);
} finally {
  await browser.close();
}
