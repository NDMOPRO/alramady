import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./state/__tests__/setup.ts"],
    include: [
      "state/__tests__/**/*.unit.test.ts",
      "state/__tests__/**/*.component.test.tsx",
    ],
    css: false,
  },
});
