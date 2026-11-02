import fs from "node:fs";
import path from "node:path";
import type { Connect } from "vite";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Vercel excludes `/data/` from the SPA rewrite (vercel.json), so a missing
 * data file is a real 404 there. Vite's dev and preview servers would instead
 * answer it with index.html and HTTP 200. Mirror the deployed behaviour so the
 * app's "file missing" path can be exercised locally.
 */
function dataNotFound(): Plugin {
  const middleware =
    (dir: () => string): Connect.NextHandleFunction =>
    (req, res, next) => {
      const pathname = decodeURIComponent((req.url ?? "").split("?")[0]);
      if (!pathname.startsWith("/data/")) return next();
      const file = path.join(dir(), pathname);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return next();
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`Not found: ${pathname}`);
    };

  return {
    name: "polaris-data-not-found",
    configureServer(server) {
      server.middlewares.use(middleware(() => server.config.publicDir));
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        middleware(() =>
          path.resolve(server.config.root, server.config.build.outDir),
        ),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dataNotFound()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "build",
    // The map engine is inherently ~1 MB and is already isolated below, so the
    // default 500 kB warning is only noise here.
    chunkSizeWarningLimit: 1200,
    // maplibre-gl is a large single dependency; split it so the app shell
    // stays small and the map chunk can be cached independently.
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
        },
      },
    },
  },
});
