import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't infer it from a stray parent
  // lockfile (was emitting a "multiple lockfiles detected" warning at build).
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      // Branded staff entry point: staff.dillon.is shows the Dillon portal at its
      // root while keeping the address bar on staff.dillon.is.
      { source: "/", has: [{ type: "host", value: "staff.dillon.is" }], destination: "/dillon" },
    ];
  },
};

export default nextConfig;
