import { expect, test, type Page } from "@playwright/test";
import { E2E_AUTH_TOKEN, E2E_AUTH_USER } from "@/lib/auth/e2e";

const PNG_PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=";

function pngFile(name: string) {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(PNG_PIXEL, "base64"),
  };
}

async function waitForHome(page: Page) {
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("rasid_token", token);
    window.localStorage.setItem("rasid_refresh_token", "e2e-refresh-token");
    window.localStorage.setItem("rasid_user", JSON.stringify(user));
  }, { token: E2E_AUTH_TOKEN, user: E2E_AUTH_USER });

  await page.goto("/home");
  await page.waitForSelector('[data-rased-id="header.bar"]', { timeout: 15_000 });
}

async function uploadStrictPair(page: Page) {
  await page.locator('input[type="file"]').setInputFiles([pngFile("strict-a.png"), pngFile("strict-b.png")]);
  await expect(page.locator('[data-rased-id^="card.file."]').first()).toBeVisible();
}

test.describe("OptionsLimitGate", () => {
  test("limits visible option surfaces and hides technical UI copy", async ({ page }) => {
    await waitForHome(page);
    await uploadStrictPair(page);

    await expect(page.locator('[data-rased-id^="card.actions."]').first()).toBeVisible({ timeout: 300 });

    const surfaces = page.locator("[data-rased-options-surface]:visible");
    const surfaceCount = await surfaces.count();

    for (let index = 0; index < surfaceCount; index += 1) {
      const count = await surfaces.nth(index).locator('[data-rased-option="true"]:visible').count();
      expect(count, `options surface ${index} exceeded the 7-option rule`).toBeLessThanOrEqual(7);
    }

    const visibleText = await page.locator("body").innerText();
    expect(visibleText).not.toMatch(/pipeline|graph|nodes?|plancard|runcard|previewcard|resultcard|evidencecard|filecard|contextactionscard|focus stage|command palette|current flow/i);
  });
});

test.describe("ClickAllGate", () => {
  test("clicks every primary visible control without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const notFoundUrls: string[] = [];
    page.on("filechooser", async (chooser) => {
      await chooser.setFiles([pngFile("strict-a.png"), pngFile("strict-b.png")]);
    });

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("response", (response) => {
      if (response.status() === 404) {
        notFoundUrls.push(response.url());
      }
    });

    await waitForHome(page);
    await uploadStrictPair(page);

    await page.locator('[data-rased-id="upload.primary"]').click({ force: true });
    await page.locator('[data-rased-id="composer.upload"]').click({ force: true });
    await page.locator('[data-rased-id="theme.toggle"]').click();
    await page.locator('[data-rased-id="motion.toggle"]').click();
    await page.locator('[data-rased-id="motion.toggle"]').click();
    await page.locator('[data-rased-id="composer.input"]').fill("ما حالة الجلسة؟");
    await page.locator('[data-rased-id="composer.send"]').click();
    await page.locator('[data-rased-id="sidebar.tab.library"]').click();
    await page.locator('[data-rased-id="sidebar.tab.history"]').click();
    await page.locator('[data-rased-id="sidebar.tab.permissions"]').click();
    await page.locator('[data-rased-id="permissions.to-exports"]').click();
    await page.locator('[data-rased-id="sidebar.tab.context"]').click();
    await page.locator('[data-rased-id="sidebar.search"]').click();
    await expect(page.locator('[data-rased-id="command.palette"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-rased-id="command.palette"]')).toBeHidden();

    await page.locator('[data-rased-id="action.compare-visuals"]').click();
    await expect(page.locator('[data-rased-id^="card.result."]').first()).toBeVisible();
    await expect(page.locator('[data-rased-id^="card.evidence."]').first()).toBeVisible();

    await page.locator('[data-rased-id="result.open_focus"]').click();
    await expect(page.locator('[data-rased-id="focus.stage"]')).toBeVisible();
    await page.locator('[data-rased-id="focus.preview"]').click();
    await page.locator('[data-rased-id="focus.export"]').click();
    await page.locator('[data-rased-id="focus.share"]').click();
    await page.locator('[data-rased-id="focus.close"]').click();
    await expect(page.locator('[data-rased-id="focus.stage"]')).toBeHidden();

    await page.locator('[data-rased-id="command.palette.open"]').click();
    await expect(page.locator('[data-rased-id="command.palette"]')).toBeVisible();
    await page.locator('[data-rased-id="command.palette.input"]').fill("مطابقة");
    await page.locator('[data-rased-options-surface="command-results"] [data-rased-option="true"]').first().click();
    await expect(page.locator('[data-rased-id^="card.evidence."]').first()).toBeVisible();

    await page.locator('[data-rased-id="session.reset"]').click();

    expect(notFoundUrls).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

test.describe("IntegrationProofGate", () => {
  test("proves the vertical slice from action to result and evidence", async ({ page }) => {
    await waitForHome(page);
    await uploadStrictPair(page);

    await page.locator('[data-rased-id="action.compare-visuals"]').click();

    await expect(page.locator('[data-rased-id^="card.plan."]').first()).toBeVisible();
    await expect(page.locator('[data-rased-id^="card.run."]').first()).toBeVisible();
    await expect(page.locator('[data-rased-id^="card.preview."]').first()).toBeVisible();
    await expect(page.locator('[data-rased-id^="card.result."]').first()).toBeVisible();
    await expect(page.locator('[data-rased-id^="card.evidence."]').first()).toBeVisible();

    await expect(page.locator('[data-rased-id^="card.result."]').first()).toContainText("مكتمل");
    await expect(page.locator("body")).not.toContainText("Completed");
  });
});
