import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import fs from "node:fs/promises";
import path from "node:path";
import { bakeOverlay } from "./scripts/bake-overlay-core.mjs";

const basePath = process.env.BASE_PATH ?? "/";

function mapperDevApiPlugin() {
  return {
    name: "mapper-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/bake-overlay", async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("Allow", "POST");
          response.end("Method Not Allowed");
          return;
        }

        try {
          const result = await bakeOverlay(server.config.root);
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(result));
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error)
            })
          );
        }
      });

      server.middlewares.use("/api/save-alignment", async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("Allow", "POST");
          response.end("Method Not Allowed");
          return;
        }

        try {
          const alignment = await readJsonBody(request);
          const saved = normalizeAlignment(alignment);
          const alignmentPath = path.join(server.config.root, "public", "alignment.json");
          await fs.writeFile(alignmentPath, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ ok: true, alignment: saved }));
        } catch (error) {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error)
            })
          );
        }
      });
    }
  };
}

async function readJsonBody(request: NodeJS.ReadableStream): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }

  return JSON.parse(body);
}

function normalizeAlignment(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("Expected alignment object.");
  }

  const record = value as Record<string, unknown>;
  return {
    x: requiredNumber(record.x, "x"),
    y: requiredNumber(record.y, "y"),
    width: requiredNumber(record.width, "width"),
    height: requiredNumber(record.height, "height"),
    scale: requiredNumber(record.scale, "scale"),
    rotation: requiredNumber(record.rotation, "rotation")
  };
}

function requiredNumber(value: unknown, key: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Expected numeric ${key}.`);
  }

  return number;
}

export default defineConfig({
  base: basePath,
  build: {
    rollupOptions: {
      input: {
        app: "index.html",
        alignment: "alignment.html"
      }
    }
  },
  plugins: [
    mapperDevApiPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["manifest.webmanifest", "pwa-192.svg", "pwa-512.svg"],
      manifest: {
        name: "UNF - RuFor map",
        short_name: "RuFor map",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#101418",
        theme_color: "#101418",
        icons: [
          {
            src: "pwa-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "pwa-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,webp,png,json}"],
        maximumFileSizeToCacheInBytes: 120 * 1024 * 1024
      }
    })
  ]
});
