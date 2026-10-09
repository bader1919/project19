import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { netlifyFunctions } from "./scripts/vite-functions";

export default defineConfig({
  plugins: [react(), netlifyFunctions()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
} as Parameters<typeof defineConfig>[0]);
