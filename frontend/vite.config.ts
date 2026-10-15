/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  preview: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    css: false,
    // Tests assert the API paths the client sends (relative to the base). Pin
    // the base to the empty string so the assertions are deterministic and do
    // not depend on VITE_API_BASE_URL leaking in from the shell or RUN.json.
    env: { VITE_API_BASE_URL: "" },
  },
});
