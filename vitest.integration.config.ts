import { defineConfig } from "vitest/config";
import path from "path";

// API integration tests against the Firebase emulator ONLY (demo- project,
// no credentials). Run via: npm run test:integration
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.int.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080",
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099",
      GCLOUD_PROJECT: "demo-timavordur",
      CLIENT_IP_SOURCE: "vercel",
      TIMAVORDUR_REQUIRE_EMULATOR: "1",
    },
  },
});
