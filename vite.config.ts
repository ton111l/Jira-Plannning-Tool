import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

/**
 * Dev: `npm run dev` (или `npm run dev:extension`) — Vite + @crxjs/vite-plugin
 * собирают расширение в `dist/` с HMR. В браузере: Загрузить распакованное →
 * выбрать именно папку `dist` репозитория (не корень проекта).
 */
export default defineConfig({
  plugins: [crx({ manifest })],
  server: {
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true
  }
});
