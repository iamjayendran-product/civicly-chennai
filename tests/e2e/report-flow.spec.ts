import { test, expect, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Seeds a report directly via the create_report RPC (real anonymous sign-in,
// same RPC the real report form will eventually call) instead of driving a
// submission UI, since the report form (Task 15) isn't built yet. create_report
// only validates that photo paths are well-formed and prefixed with the
// caller's own uid — it doesn't check the storage object actually exists — so
// this intentionally skips a real Storage upload to keep the test focused on
// what it's actually proving: that an inserted report appears live on the map.
async function createTestReport(lng: number, lat: number): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError || !signInData.user) {
    throw new Error(`anonymous sign-in failed: ${signInError?.message}`);
  }
  const userId = signInData.user.id;
  const { data, error } = await supabase.rpc("create_report", {
    p_category: "pothole",
    p_subtype: null,
    p_note: "e2e test report",
    p_lng: lng,
    p_lat: lat,
    p_photo_paths: [`${userId}/e2e-test.jpg`],
  });
  if (error || !data) {
    throw new Error(`create_report failed: ${error?.message}`);
  }
  return data as string;
}

// `.maplibregl-canvas` exists in the DOM as soon as the MapLibre `Map`
// constructor runs — well before `map.on('load')`, before the base style's
// sources/layers are added, and before the initial tile fetch/paint settles.
// Screenshotting immediately after `waitForSelector` would capture the canvas
// mid-repaint, so a later "pixels changed" assertion could pass just from
// ongoing tile loading rather than from the seeded report actually appearing.
// Instead, poll screenshots until several consecutive ones are byte-identical
// — that's the signal the initial render has quiesced — and use that as the
// baseline.
async function waitForStableScreenshot(
  canvas: Locator,
  { intervalMs = 250, consecutiveMatches = 3, timeoutMs = 20_000 } = {},
): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;
  let last: Buffer | null = null;
  let matches = 0;
  while (Date.now() < deadline) {
    const shot = await canvas.screenshot();
    if (last && shot.equals(last)) {
      matches += 1;
      if (matches >= consecutiveMatches) {
        return shot;
      }
    } else {
      matches = 0;
    }
    last = shot;
    await canvas.page().waitForTimeout(intervalMs);
  }
  throw new Error(`canvas did not stabilize within ${timeoutMs}ms`);
}

test("a report appears live on an open map without reload", async ({ page }) => {
  await page.goto("/home");
  await page.waitForSelector(".maplibregl-canvas");
  const canvas = page.locator(".maplibregl-canvas").first();
  const pinsBefore = await waitForStableScreenshot(canvas);

  await createTestReport(80.27, 13.06);

  await expect
    .poll(async () => (await canvas.screenshot()).equals(pinsBefore), {
      timeout: 10_000,
    })
    .toBe(false);
});
