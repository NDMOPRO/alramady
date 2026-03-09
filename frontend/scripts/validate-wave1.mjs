import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const routeConfig = require("../lib/navigation/routes.config.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function ok(message) {
  notes.push(`✓ ${message}`);
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

const primary = routeConfig.primaryNavItems;
if (primary.length !== 1) {
  fail(`يجب أن تحتوي الملاحة الأساسية على عنصر واحد فقط (الحالي: ${primary.length})`);
} else if (primary[0]?.href !== "/home") {
  fail(`العنصر الأساسي يجب أن يشير إلى /home (الحالي: ${primary[0]?.href ?? "غير معرف"})`);
} else {
  ok("الملاحة الأساسية موحدة على /home");
}

const requiredRedirects = [
  ["/data/:path*", "/home", "engine", "data"],
  ["/ai/:path*", "/home", "engine", "ai"],
  ["/reports/:path*", "/home", "engine", "reports"],
  ["/presentations/:path*", "/home", "engine", "presentations"],
  ["/library/:path*", "/home", "engine", "library"],
  ["/admin/:path*", "/home", "engine", "settings"],
  ["/dashboard/:path*", "/home", "mode", "dashboard"],
  ["/excel/:path*", "/home", "mode", "excel"],
  ["/replication/:path*", "/home", "mode", "replication"],
];

for (const [pattern, target, contextParam, contextValue] of requiredRedirects) {
  const found = routeConfig.legacyRouteRules.find(
    (rule) =>
      rule.pattern === pattern &&
      rule.target === target &&
      rule.contextParam === contextParam &&
      rule.contextValue === contextValue
  );
  if (!found) {
    fail(`قاعدة تحويل مفقودة: ${pattern} -> ${target}?${contextParam}=${contextValue}`);
  }
}
if (!failures.some((item) => item.includes("قاعدة تحويل"))) {
  ok("تحويل المسارات إلى الكانفس الموحد مفعل");
}

const homeContent = read("app/(dashboard)/home/page.tsx");
if (!homeContent.includes("hasCanvasContext")) {
  fail("صفحة /home يجب أن تحتفظ بسياق الروابط القديمة عبر hasCanvasContext");
} else {
  ok("سياق الروابط القديمة محفوظ في /home");
}

const commandCenter = read("components/workspaces/RasidCommandCenter.tsx");
if (
  !commandCenter.includes("متقدم:") ||
  !commandCenter.includes("رفع ملفات") ||
  !commandCenter.includes("/api/replication/literal-match")
) {
  fail("RasidCommandCenter لا يطبق واجهة المحادثة المبسطة مع المطابقة الحرفية الفعلية");
} else {
  ok("واجهة المحادثة المبسطة والمطابقة الحرفية الفعلية في RasidCommandCenter مفعلة");
}

const dashboardPagesDir = path.join(root, "app", "(dashboard)");
const pageFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry.isFile() && entry.name === "page.tsx") {
      pageFiles.push(full);
    }
  }
}
walk(dashboardPagesDir);

const commandCenterPages = pageFiles.filter((file) =>
  fs.readFileSync(file, "utf8").includes("RasidCommandCenter")
);
if (commandCenterPages.length !== 1) {
  fail(`RasidCommandCenter يجب أن يظهر في صفحة واحدة فقط (الحالي: ${commandCenterPages.length})`);
} else {
  const rel = path.relative(root, commandCenterPages[0]).replace(/\\/g, "/");
  if (rel !== "app/(dashboard)/home/page.tsx") {
    fail(`RasidCommandCenter موجود في صفحة غير /home: ${rel}`);
  } else {
    ok("RasidCommandCenter محصور في /home");
  }
}

const loginContent = read("app/(auth)/login/page.tsx");
if (!loginContent.includes('window.location.href = "/home"')) {
  fail("توجيه ما بعد تسجيل الدخول ليس /home");
} else {
  ok("توجيه تسجيل الدخول إلى /home");
}

const registerContent = read("app/(auth)/register/page.tsx");
if (!registerContent.includes('router.push("/home")')) {
  fail("توجيه ما بعد إنشاء الحساب ليس /home");
} else {
  ok("توجيه إنشاء الحساب إلى /home");
}

if (failures.length > 0) {
  console.error("Single Canvas validation failed:");
  for (const item of failures) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("Single Canvas validation passed:");
for (const item of notes) {
  console.log(item);
}
