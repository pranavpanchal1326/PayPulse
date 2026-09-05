import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(here, "./src") },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // The bind mount into the container loses inotify events on Windows hosts.
    watch: { usePolling: true, interval: 300 },
  },
});
