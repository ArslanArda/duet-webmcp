import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false },
  test: {
    environment: "node",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
