import { expect, test } from "@playwright/test";

test.describe("PWA manifest and icons (production build)", () => {
  test("one manifest, every icon URL returns a real image, tags point at the same assets", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const manifestLinks = await page
      .locator('link[rel="manifest"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(manifestLinks).toEqual(["/manifest.webmanifest"]);

    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/json/);
    const m = await res.json();
    expect(m).toMatchObject({
      short_name: "Ghadi",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    expect(m.theme_color).toBeTruthy();
    expect(m.background_color).toBeTruthy();
    expect(m.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);

    const tagged = await page
      .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
    const urls = [...new Set([...m.icons.map((i: { src: string }) => i.src), ...tagged])];
    expect(urls.length).toBeGreaterThanOrEqual(5);
    for (const u of urls) {
      const r = await request.get(u);
      expect(r.status(), u).toBe(200);
      expect(r.headers()["content-type"], u).toBe("image/png");
      expect((await r.body()).subarray(1, 4).toString(), u).toBe("PNG");
    }
    // The in-app logo (header/sidebar) is the same artwork and loads.
    await page.goto("/dashboard");
    const logo = page.getByRole("img", { name: "Ghadi logo" }).first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  });

  test("service worker serves the manifest network-first so icon changes reach installed apps", async ({
    request,
  }) => {
    const sw = await (await request.get("/sw.js")).text();
    expect(sw).not.toMatch(/pathname === "\/manifest\.webmanifest"/);
    expect(sw).toMatch(/CACHE_VERSION = "ghadi-v7"/);
  });
});
