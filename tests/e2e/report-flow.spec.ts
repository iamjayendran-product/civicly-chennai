import { test, expect } from "@playwright/test";
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

test("a report appears live on an open map without reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".maplibregl-canvas");
  const pinsBefore = await page.locator(".maplibregl-canvas").first().screenshot();

  await createTestReport(80.27, 13.06);

  await expect
    .poll(async () => (await page.locator(".maplibregl-canvas").first().screenshot()).equals(pinsBefore), {
      timeout: 10_000,
    })
    .toBe(false);
});
