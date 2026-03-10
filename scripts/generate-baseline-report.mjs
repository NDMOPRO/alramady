import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const rootDir = process.cwd();
const checksPath = resolve(rootDir, "docs", "integration", "baseline_checks.json");
const outputPath = resolve(rootDir, "docs", "integration", "baseline_report.md");

if (!existsSync(checksPath)) {
  throw new Error(`Missing baseline checks file: ${checksPath}`);
}

const checks = JSON.parse(readFileSync(checksPath, "utf8"));
const failures = checks.filter((item) => !item.success);
const successes = checks.filter((item) => item.success);

function listServiceEntrypoints() {
  const servicesDir = resolve(rootDir, "services");
  if (!existsSync(servicesDir)) {
    return [];
  }

  return readdirSync(servicesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const indexPath = join(servicesDir, entry.name, "src", "index.ts");
      return {
        name: entry.name,
        entrypoint: existsSync(indexPath) ? indexPath : null,
      };
    })
    .filter((entry) => entry.entrypoint);
}

function extractVersions() {
  const report = {
    node: "24.14.0",
    npm: "11.9.0",
    package_manager: "npm@11.9.0",
    docker: "29.2.1",
    docker_compose: "v5.0.2",
  };

  const frontendBuild = checks.find((item) => item.target === "frontend" && item.script === "build");
  if (frontendBuild?.outputTail?.includes("Next.js")) {
    report.frontend = "next";
  }

  return report;
}

const services = listServiceEntrypoints();
const versions = extractVersions();
const dockerTargets = [
  "postgres",
  "redis",
  "minio",
  "elasticsearch",
  "rendering-environment",
];

const lines = [
  "# Baseline Report",
  "",
  `تاريخ التثبيت المرجعي: ${new Date().toISOString()}`,
  "",
  "## Baseline Lock",
  "",
  `Node مثبت على ${versions.node} وnpm على ${versions.npm} مع قفل package manager إلى ${versions.package_manager}.`,
  `Docker مثبت على ${versions.docker} وDocker Compose على ${versions.docker_compose}.`,
  "ملف البيئة المرجعي المستخدم هو `.env.example` بعد إضافة `GOVERNANCE_RUNTIME_URL` كنقطة الربط المركزية للـregistry/evidence runtime.",
  "",
  "## الفحص الشامل قبل أي تعديل",
  "",
  `إجمالي الفحوصات الناجحة: ${successes.length}.`,
  `إجمالي الفحوصات الفاشلة: ${failures.length}.`,
  failures.length === 0
    ? "لا توجد إخفاقات حالية في baseline المسجل."
    : `الإخفاقات الحالية المحسوبة من baseline الأصلي تتركز في: ${failures.map((item) => `${item.target}/${item.script}`).join("، ")}.`,
  "",
  "## أبرز الإخفاقات الحالية",
  "",
  ...(
    failures.length === 0
      ? ["لا توجد إخفاقات مفتوحة في baseline الحالي."]
      : failures.map((item) => `- ${item.target} / ${item.script}: ${String(item.outputTail ?? "").split("\n").slice(-5).join(" ").trim()}`)
  ),
  "",
  "## الخدمات ونقاط الدخول",
  "",
  ...services.map((service) => `- ${service.name}: ${service.entrypoint}`),
  `- frontend-canvas: ${resolve(rootDir, "frontend", "app", "(dashboard)", "home", "page.tsx")}`,
  "",
  "## ملاحظة docker-compose",
  "",
  `خدمات الـbaseline التي يجب أن ترتفع في compose هي: ${dockerTargets.join("، ")}.`,
  "",
  "## توصيف baseline الحالي",
  "",
  "هذا التقرير يمثل خط الأساس قبل أي إصلاحات من دفعة التكامل. أي نتيجة نجاح لاحقة يجب أن تُقارن به مع إثباتات build/typecheck/lint/tests/evidence في نفس المسارات.",
  "",
];

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(outputPath);
