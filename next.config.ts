import type { NextConfig } from "next";

// Every page reads live data behind a login, so this app uses the standard
// (non-Cache-Components) model: nothing is cached unless a page asks for it,
// and data pages export `dynamic = "force-dynamic"`.
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
