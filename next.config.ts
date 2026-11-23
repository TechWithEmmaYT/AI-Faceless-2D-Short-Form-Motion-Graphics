import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Project posters (Recents, Projects) are stored on Cloudinary under motionstudio/<userId>/<projectId>/poster.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        // .../image/upload/v<version>/motionstudio/... — `**` is only allowed at the end, so the version is `*`.
        pathname: `/${process.env.CLOUDINARY_CLOUD_NAME ?? "*"}/image/upload/*/motionstudio/**`,
        search: "",
      },
    ],
  },
  // get_example reads the worked examples' stills from disk; ship them with the MCP route.
  outputFileTracingIncludes: {
    "/api/mcp": ["./lib/agent/examples/stills/**/*"],
  },
  async headers() {
    return [
      {
        // The sandboxed render host (scripts/build-render-host.mjs). It runs agent-written code, so:
        // no network (connect-src 'none'), only our own pages may frame it, and it is always loaded
        // in <iframe sandbox="allow-scripts"> (opaque origin: no cookies, storage or parent DOM).
        source: "/render-host/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'none'",
              "script-src 'unsafe-inline' 'unsafe-eval' blob:",
              "worker-src blob:",
              "style-src 'unsafe-inline'",
              "img-src data: blob:",
              "font-src data: blob:",
              "connect-src 'none'",
              "base-uri 'none'",
              "form-action 'none'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
