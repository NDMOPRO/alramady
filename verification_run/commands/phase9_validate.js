const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const BASE_URL = "http://localhost";
const OUTPUT_JSON = path.join(
  __dirname,
  "..",
  "raw_outputs",
  "phase9_browser_results.json"
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

async function apiLogin() {
  const response = await fetch(`${BASE_URL}/api/v1/governance/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email: "admin@rasid.demo",
      password: "Password123!",
    }),
  });

  const payload = await response.json();
  const data = payload?.data || payload;
  const token = data?.accessToken || data?.token;
  const refreshToken = data?.refreshToken || "";
  const user = data?.user || null;

  if (!response.ok || !token) {
    throw new Error(`login failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return { token, refreshToken, user };
}

async function waitForPath(page, matcher, timeout = 60000) {
  const predicate =
    typeof matcher === "string"
      ? (pathname) => pathname === matcher
      : (pathname) => matcher.test(pathname);

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const pathname = new URL(page.url()).pathname;
    if (predicate(pathname)) {
      return pathname;
    }
    await sleep(200);
  }

  throw new Error(`timed out waiting for path ${matcher}`);
}

async function waitForText(page, text, timeout = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const bodyText = await page.evaluate(() => document.body.innerText || "");
    if (bodyText.includes(text)) {
      return bodyText;
    }
    await sleep(300);
  }

  throw new Error(`timed out waiting for text: ${text}`);
}

async function getPageState(page) {
  return page.evaluate(() => {
    const heading = document.querySelector("h1, h2, h3");
    const htmlDir = document.documentElement.getAttribute("dir");
    const bodyDir = document.body.getAttribute("dir");
    const computedDirection = window.getComputedStyle(document.body).direction;
    return {
      title: document.title,
      heading: heading ? heading.textContent.replace(/\s+/g, " ").trim() : "",
      htmlDir,
      bodyDir,
      computedDirection,
      assistantVisible: (document.body.innerText || "").includes("مساعد راصد الذكي"),
      bodySnippet: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1800),
    };
  });
}

async function clickByTestId(page, testId) {
  await page.waitForSelector(`[data-testid="${testId}"]`, { timeout: 60000 });
  await page.click(`[data-testid="${testId}"]`);
}

async function clickByText(page, selector, text) {
  const clicked = await page.evaluate(
    ({ selector, text }) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      const match = nodes.find((node) => (node.textContent || "").replace(/\s+/g, " ").includes(text));
      if (!match) return false;
      match.click();
      return true;
    },
    { selector, text }
  );

  if (!clicked) {
    throw new Error(`could not click ${selector} with text ${text}`);
  }
}

async function clickNavHref(page, href) {
  await page.waitForSelector(`aside a[href="${href}"]`, { timeout: 60000 });
  await page.click(`aside a[href="${href}"]`);
}

async function setInputValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 60000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value);
}

async function openAssistant(page, surfaceId) {
  const actionSelector = `[data-testid^="rasid-action-${surfaceId}-"]`;
  const visible = await page.$(actionSelector);
  if (visible) {
    return;
  }
  await clickByTestId(page, `rasid-assistant-toggle-${surfaceId}`);
  await page.waitForSelector(actionSelector, { timeout: 60000 });
}

function createApiCollector(page) {
  const entries = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/")) {
      return;
    }

    let body = "";
    const headers = response.headers() || {};
    const contentType = headers["content-type"] || "";
    if (contentType.includes("application/json")) {
      try {
        body = normalizeText(await response.text()).slice(0, 500);
      } catch {
        body = "";
      }
    }

    entries.push({
      url: url.replace(BASE_URL, ""),
      status: response.status(),
      method: response.request().method(),
      body,
    });
  });

  return {
    clear() {
      entries.length = 0;
    },
    snapshot() {
      const deduped = [];
      const seen = new Set();
      for (const entry of entries) {
        const key = `${entry.method} ${entry.url} ${entry.status}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(entry);
      }
      return deduped;
    },
  };
}

async function main() {
  const auth = await apiLogin();
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1440, height: 1200 },
  });
  const page = await browser.newPage();
  const api = createApiCollector(page);

  await page.evaluateOnNewDocument((payload) => {
    localStorage.setItem("rasid_token", payload.token);
    localStorage.setItem("rasid_refresh_token", payload.refreshToken || "");
    if (payload.user) {
      localStorage.setItem("rasid_user", JSON.stringify(payload.user));
    }
  }, auth);

  const result = {
    login: {
      user: auth.user?.email || "admin@rasid.demo",
    },
    navigation: [],
    surfaces: {},
  };

  async function captureSurface(route, surfaceKey) {
    api.clear();
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle2", timeout: 90000 });
    await sleep(1000);
    const state = await getPageState(page);
    result.surfaces[surfaceKey] = {
      route,
      loadedPath: new URL(page.url()).pathname,
      pageState: state,
      initialApis: api.snapshot(),
    };
  }

  await captureSurface("/home", "home");

  await openAssistant(page, "home");
  api.clear();
  await clickByTestId(page, "rasid-action-home-refresh-home");
  await waitForText(page, "تم تحديث مؤشرات الصفحة الرئيسية");
  result.surfaces.home.assistant = {
    executedAction: "refresh-home",
    apis: api.snapshot(),
  };

  api.clear();
  await page.waitForSelector('input[type="file"]', { timeout: 60000 });
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(path.join(__dirname, "..", "raw_outputs", "phase4-home-sample.csv"));
  await waitForText(page, "تم اكتشاف ملف بيانات");
  result.surfaces.home.smartEntry = await page.evaluate(() => {
    const body = document.body.innerText || "";
    const actionButtons = Array.from(document.querySelectorAll("button"))
      .map((button) => (button.textContent || "").replace(/\s+/g, " ").trim())
      .filter((text) => text.includes("خدمة") || text.includes("تقرير PDF") || text.includes("عرض تقديمي"));
    return {
      detectedBody: normalize(body).slice(0, 2000),
      actionButtons,
    };

    function normalize(value) {
      return value.replace(/\s+/g, " ").trim();
    }
  });

  await clickByText(page, "button", "خدمة التحليل");
  await waitForText(page, "نتيجة التحليل الذكي");
  result.surfaces.home.execution = {
    action: "analyze-dataset",
    apis: api.snapshot(),
    outputSnippet: normalizeText(await page.evaluate(() => document.body.innerText || "")).slice(0, 2400),
  };

  api.clear();
  await clickNavHref(page, "/data");
  await waitForPath(page, "/data");
  await sleep(1000);
  result.navigation.push({
    from: "/home",
    to: "/data",
    apiCalls: api.snapshot(),
  });

  result.surfaces.data = {
    route: "/data",
    loadedPath: new URL(page.url()).pathname,
    pageState: await getPageState(page),
    initialApis: api.snapshot(),
  };

  await openAssistant(page, "data");
  api.clear();
  await clickByTestId(page, "rasid-action-data-refresh-connectors");
  await waitForText(page, "تم تحديث الموصلات السحابية");
  result.surfaces.data.assistant = {
    executedAction: "refresh-connectors",
    apis: api.snapshot(),
    outputSnippet: normalizeText(await page.evaluate(() => document.body.innerText || "")).slice(0, 1800),
  };

  api.clear();
  await clickByText(page, "button", "افتح أحدث مجموعة لتشغيل خدماتها");
  await waitForPath(page, /^\/data\/.+$/, 60000);
  result.surfaces.data.detailNavigation = {
    route: new URL(page.url()).pathname,
    apis: api.snapshot(),
    pageState: await getPageState(page),
  };

  api.clear();
  await page.goto(`${BASE_URL}/data`, { waitUntil: "networkidle2", timeout: 90000 });
  await sleep(1000);
  api.clear();
  await clickNavHref(page, "/analysis");
  await waitForPath(page, "/analysis");
  await sleep(1000);
  result.navigation.push({
    from: "data-detail",
    to: "/analysis",
    apiCalls: api.snapshot(),
  });

  result.surfaces.analysis = {
    route: "/analysis",
    loadedPath: new URL(page.url()).pathname,
    pageState: await getPageState(page),
    initialApis: api.snapshot(),
  };

  await openAssistant(page, "analysis");
  api.clear();
  await clickByTestId(page, "rasid-action-analysis-run-current-analysis");
  await waitForText(page, "تم تشغيل التحليل على");
  result.surfaces.analysis.execution = {
    action: "run-current-analysis",
    apis: api.snapshot(),
    outputSnippet: normalizeText(await page.evaluate(() => document.body.innerText || "")).slice(0, 2200),
  };

  api.clear();
  await clickNavHref(page, "/reports");
  await waitForPath(page, "/reports");
  await sleep(1000);
  result.navigation.push({
    from: "/analysis",
    to: "/reports",
    apiCalls: api.snapshot(),
  });

  result.surfaces.reports = {
    route: "/reports",
    loadedPath: new URL(page.url()).pathname,
    pageState: await getPageState(page),
    initialApis: api.snapshot(),
  };

  api.clear();
  await page.waitForSelector('[data-testid="reports-create-build"]:not([disabled])', { timeout: 90000 });
  await clickByTestId(page, "reports-create-build");
  await waitForText(page, "تم إنشاء التقرير وبناؤه فعليًا عبر reporting-service");
  result.surfaces.reports.execution = {
    action: "create-build-report",
    apis: api.snapshot(),
    outputSnippet: normalizeText(await page.evaluate(() => document.body.innerText || "")).slice(0, 2200),
  };

  api.clear();
  await clickNavHref(page, "/presentations");
  await waitForPath(page, "/presentations");
  await sleep(1000);
  result.navigation.push({
    from: "/reports",
    to: "/presentations",
    apiCalls: api.snapshot(),
  });

  result.surfaces.presentations = {
    route: "/presentations",
    loadedPath: new URL(page.url()).pathname,
    pageState: await getPageState(page),
    initialApis: api.snapshot(),
  };

  api.clear();
  const blankTitle = `عرض تحقق المرحلة 9 ${Date.now()}`;
  await setInputValue(page, '[data-testid="presentations-blank-title"]', blankTitle);
  await clickByTestId(page, "presentations-create-blank");
  await waitForPath(page, /^\/presentations\/.+$/, 90000);
  result.surfaces.presentations.execution = {
    action: "create-blank-presentation",
    route: new URL(page.url()).pathname,
    apis: api.snapshot(),
    pageState: await getPageState(page),
  };

  api.clear();
  await clickNavHref(page, "/library");
  await waitForPath(page, "/library");
  await sleep(1000);
  result.navigation.push({
    from: "presentation-detail",
    to: "/library",
    apiCalls: api.snapshot(),
  });

  result.surfaces.library = {
    route: "/library",
    loadedPath: new URL(page.url()).pathname,
    pageState: await getPageState(page),
    initialApis: api.snapshot(),
  };

  api.clear();
  await setInputValue(page, '[data-testid="library-search-input"]', "phase7-audit-export");
  await clickByTestId(page, "library-search-button");
  await sleep(1500);
  const firstViewButton = await page.$$('[data-testid^="library-view-"]');
  if (!firstViewButton.length) {
    throw new Error("library search returned no view buttons");
  }
  await firstViewButton[0].click();
  await page.waitForSelector('[data-testid="library-selected-asset"]', { timeout: 60000 });
  await page.waitForSelector('[data-testid="library-import-selected-asset"]', { timeout: 60000 });
  await clickByTestId(page, "library-import-selected-asset");
  await waitForText(page, "تم استيراد");
  result.surfaces.library.execution = {
    action: "import-selected-asset",
    apis: api.snapshot(),
    outputSnippet: normalizeText(await page.evaluate(() => document.body.innerText || "")).slice(0, 2600),
  };

  api.clear();
  await clickNavHref(page, "/settings");
  await waitForPath(page, "/settings");
  await sleep(1000);
  result.navigation.push({
    from: "/library",
    to: "/settings",
    apiCalls: api.snapshot(),
  });

  result.surfaces.settings = {
    route: "/settings",
    loadedPath: new URL(page.url()).pathname,
    pageState: await getPageState(page),
    initialApis: api.snapshot(),
  };

  await openAssistant(page, "settings");
  api.clear();
  await clickByTestId(page, "rasid-action-settings-open-first-user");
  await page.waitForSelector('[data-testid="settings-save-user"]', { timeout: 60000 });
  await clickByTestId(page, "settings-save-user");
  await waitForText(page, "تم تحديث المستخدم");
  result.surfaces.settings.execution = {
    action: "open-first-user-and-save",
    apis: api.snapshot(),
    outputSnippet: normalizeText(await page.evaluate(() => document.body.innerText || "")).slice(0, 2400),
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
