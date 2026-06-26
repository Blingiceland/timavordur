import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't infer it from a stray parent
  // lockfile (was emitting a "multiple lockfiles detected" warning at build).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
