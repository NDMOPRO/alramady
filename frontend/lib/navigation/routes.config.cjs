const primaryPageIds = ["home", "data", "analysis", "reports", "presentations", "library", "settings"];

const primaryNavItems = [
  {
    id: "home",
    nameAr: "الرئيسية",
    href: "/home",
    prefixes: ["/", "/home"],
  },
  {
    id: "data",
    nameAr: "البيانات",
    href: "/data",
    prefixes: ["/data", "/excel", "/convert"],
  },
  {
    id: "analysis",
    nameAr: "التحليل",
    href: "/analysis",
    prefixes: ["/analysis", "/ai", "/dashboard", "/observer", "/replicate", "/replication", "/literal-match", "/automation"],
  },
  {
    id: "reports",
    nameAr: "التقارير",
    href: "/reports",
    prefixes: ["/reports"],
  },
  {
    id: "presentations",
    nameAr: "العروض",
    href: "/presentations",
    prefixes: ["/presentations", "/infographics", "/templates"],
  },
  {
    id: "library",
    nameAr: "المكتبة",
    href: "/library",
    prefixes: ["/library"],
  },
  {
    id: "settings",
    nameAr: "الإعدادات",
    href: "/settings",
    prefixes: ["/settings", "/admin"],
  },
];

// Legacy redirects kept only for truly obsolete paths
const legacyRouteRules = [];

function buildDestination(rule) {
  const query = new URLSearchParams();
  if (rule.contextParam && rule.contextValue) {
    query.set(rule.contextParam, rule.contextValue);
  }
  if (rule.extraQuery) {
    Object.entries(rule.extraQuery).forEach(([key, value]) => query.set(key, value));
  }
  const qs = query.toString();
  return qs ? `${rule.target}?${qs}` : rule.target;
}

function buildLegacyRedirects() {
  return legacyRouteRules.map((rule) => ({
    source: rule.pattern,
    destination: buildDestination(rule),
    permanent: false,
  }));
}

module.exports = {
  primaryPageIds,
  primaryNavItems,
  legacyRouteRules,
  buildLegacyRedirects,
};
