import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // wrise fork (DEM-1293): served under a path prefix when set, e.g. NOOTION_BASE_PATH=/nootion/
  base: process.env.NOOTION_BASE_PATH || "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000", "/collab": { target: "ws://localhost:3000", ws: true } },
  },
});
