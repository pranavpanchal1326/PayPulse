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
  build: {
    // The landing page's data module awaits its fetch at the top level, which
    // keeps every act reading plain constants instead of threading a loading
    // state through eight components. Vite's default target is es2020 and
    // predates the feature; es2022 is where it landed. Chrome 89, Safari 15
    // and Firefox 89 - all 2021 - so nothing real is excluded.
    target: "es2022",
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // The bind mount into the container loses inotify events on Windows hosts.
    watch: { usePolling: true, interval: 300 },
  },
});
