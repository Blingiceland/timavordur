import type { NextConfig } from "next";
import { BRANDED_HOSTS } from "./src/lib/branded-hosts";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't infer it from a stray parent
  // lockfile (was emitting a "multiple lockfiles detected" warning at build).
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    // beforeFiles: runs BEFORE filesystem routes, so it overrides the existing "/"
    // landing route for this host (a plain-array rewrite is "afterFiles" and would
    // be ignored because "/" already matches the landing page).
    return {
      // Branded staff entry points (e.g. staff.dillon.is, staff.discobar.is) show
      // the company portal at their root while keeping the address bar unchanged.
      beforeFiles: Object.entries(BRANDED_HOSTS).map(([slug, host]) => ({
        source: "/",
        has: [{ type: "host" as const, value: host }],
        destination: `/${slug}`,
      })),
    };
  },
};

export default nextConfig;
