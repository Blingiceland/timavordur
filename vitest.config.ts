import { defineConfig } from "vitest/config";
import path from "path";

// Unit tests only. Integration tests (*.int.test.ts) need the Firebase emulator:
//   npm run test:integration
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.int.test.ts", "node_modules/**"],
    env: { TIMAVORDUR_REQUIRE_EMULATOR: "1" },
  },
});
