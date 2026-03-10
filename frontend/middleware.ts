import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const VIEW_MAPPINGS: Array<{ pattern: RegExp; view: "dashboards" | "dataLake" | "reports" | "library" | "settings" }> = [
  { pattern: /^\/(dashboard|analysis|observer)(\/|$)/i, view: "dashboards" },
  { pattern: /^\/(data|excel|convert|replicate|replication|literal-match|localization)(\/|$)/i, view: "dataLake" },
  { pattern: /^\/reports?(\/|$)/i, view: "reports" },
  { pattern: /^\/(library|templates|presentations)(\/|$)/i, view: "library" },
  { pattern: /^\/(settings|admin)(\/|$)/i, view: "settings" },
];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  for (const mapping of VIEW_MAPPINGS) {
    if (!mapping.pattern.test(pathname)) {
      continue;
    }

    const target = request.nextUrl.clone();
    target.pathname = "/home";
    target.search = search;
    target.searchParams.set("view", mapping.view);
    return NextResponse.redirect(target);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/analysis/:path*",
    "/observer/:path*",
    "/data/:path*",
    "/excel/:path*",
    "/convert/:path*",
    "/replicate/:path*",
    "/replication/:path*",
    "/literal-match/:path*",
    "/localization/:path*",
    "/report/:path*",
    "/reports/:path*",
    "/library/:path*",
    "/templates/:path*",
    "/presentations/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
