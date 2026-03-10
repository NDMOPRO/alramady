/** @type {import('next').NextConfig} */
const { buildLegacyRedirects } = require("./lib/navigation/routes.config.cjs");
const serverApiUrl =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:80";

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  swcMinify: true,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.rasid.sa",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  // Environment variables available at build time
  env: {
    NEXT_PUBLIC_APP_NAME: "Rasid",
    NEXT_PUBLIC_APP_NAME_AR: "راصد",
  },

  // Legacy route redirects
  async redirects() {
    return buildLegacyRedirects();
  },

  // API proxy rewrites for development
  async rewrites() {
    if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1") {
      return [];
    }

    return [
      {
        source: "/api/governance/:path*",
        destination: `${serverApiUrl}/api/governance/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${serverApiUrl}/api/v1/:path*`,
      },
    ];
  },

  // Custom headers for security
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
