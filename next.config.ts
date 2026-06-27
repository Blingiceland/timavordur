import type { NextConfig } from "next";

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
      beforeFiles: [
        // Branded staff entry point: staff.dillon.is shows the Dillon portal at its
        // root while keeping the address bar on staff.dillon.is.
        { source: "/", has: [{ type: "host", value: "staff.dillon.is" }], destination: "/dillon" },
      ],
    };
  },
};

export default nextConfig;
