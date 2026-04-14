import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import fs from "fs";
import path from "path";

export default defineConfig(({ command, mode }) => {
  // Repo root `.env` (monorepo) then app dir (`frontend/`) — same keys in `frontend/.env*` override root.
  const envFromRoot = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const envFromAppDir = loadEnv(mode, process.cwd(), "");
  const env = { ...envFromRoot, ...envFromAppDir };

  // Read ENVIRONMENT from merged .env, process (Dockerfile / CI), or default to production
  const environment = env.ENVIRONMENT || process.env.ENVIRONMENT || process.env.NODE_ENV || "production";

  const frontendAppVersion =
    env.FRONTEND_APP_VERSION ||
    process.env.FRONTEND_APP_VERSION ||
    process.env.npm_package_version ||
    "development";
  const enableServiceWorker =
    (env.ENABLE_SERVICE_WORKER || process.env.ENABLE_SERVICE_WORKER || "false").toLowerCase() === "true";

  return {
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.js',
        quoteStyle: 'single',
        disableTypes: true,
      }),
      react(),
      // Custom plugin to serve .gz files
      {
        name: "serve-raw-gzip",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url.endsWith(".json.gz")) {
              const filePath = path.join(__dirname, "public", req.url);

              if (fs.existsSync(filePath)) {
                res.setHeader("Content-Type", "application/gzip");
                res.setHeader(
                  "Content-Disposition",
                  'inline; filename="searchIndex_compressed.json.gz"'
                );
                fs.createReadStream(filePath).pipe(res);
                return;
              }
            }
            next();
          });
        },
        // Add transform hook to prevent Vite from processing .gz files
        transform(code, id) {
          if (id.endsWith(".gz")) {
            return {
              code: "",
              map: null,
            };
          }
        },
      },
      sentryVitePlugin({
        // org = organization slug (…/organizations/<slug>/); project = project slug (…/projects/<slug>/).
        org: env.SENTRY_ORG || "eve-industry-planner",
        project: env.SENTRY_PROJECT_ID,
      }),
      VitePWA({
        disable: !enableServiceWorker,
        injectRegister: false,
        registerType: "autoUpdate",
        srcDir: "public",
        filename: "sw.js",
        strategies: "injectManifest",
        injectManifest: {
          injectionPoint: undefined,
        },
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
      // Bundle analyzer - generates stats.html to visualize bundle contents
      visualizer({
        filename: "dist/stats.html",
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
      // Custom plugin to handle service worker environment variables in dev mode
      {
        name: "sw-env-replace",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (
              req.url === "/sw.js" ||
              req.url.startsWith("/sw.js")
            ) {

              const swPath = path.join(__dirname, "public/sw.js");

              if (fs.existsSync(swPath)) {
                let content = fs.readFileSync(swPath, "utf-8");
                // Replace environment variables using new naming convention
                // Support both new FIREBASE_* and legacy VITE_* names for backwards compatibility
                const envReplacements = {
                  "__FIREBASE_API_KEY__": JSON.stringify(
                    env.FIREBASE_API_KEY || env.VITE_fbApiKey || ""
                  ),
                  "__FIREBASE_AUTH_DOMAIN__": JSON.stringify(
                    env.FIREBASE_AUTH_DOMAIN || env.VITE_fbAuthDomain || ""
                  ),
                  "__FIREBASE_DATABASE_URL__": JSON.stringify(
                    env.FIREBASE_DATABASE_URL || env.VITE_fbDatabaseURL || ""
                  ),
                  "__FIREBASE_PROJECT_ID__": JSON.stringify(
                    env.FIREBASE_PROJECT_ID || env.VITE_fbProjectID || ""
                  ),
                  "__FIREBASE_APP_ID__": JSON.stringify(
                    env.FIREBASE_APP_ID || env.VITE_fbAppID || ""
                  ),
                  "__FIREBASE_MEASUREMENT_ID__": JSON.stringify(
                    env.FIREBASE_MEASUREMENT_ID || env.VITE_measurmentID || ""
                  ),
                };

                Object.entries(envReplacements).forEach(
                  ([placeholder, value]) => {
                    if (value && value !== "null" && value !== '""') {
                      content = content.replace(
                        new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"),
                        value
                      );
                    }
                  }
                );
                res.setHeader("Content-Type", "application/javascript");
                res.end(content);
                return;
              }
            }
            next();
          });
        },
      },
    ],

    // Flat `process.env.KEY` entries so esbuild replaces every access (nested `process.env`
    // objects do not reliably rewrite `process.env.ENVIRONMENT` in app + Zustand code).
    define: {
      __APP_VERSION__: JSON.stringify(frontendAppVersion),
      "import.meta.env.SENTRY_PROJECT_ID": JSON.stringify(env.SENTRY_PROJECT_ID),
      "import.meta.env.SENTRY_DSN": JSON.stringify(env.SENTRY_DSN),
      "import.meta.env.ENVIRONMENT": JSON.stringify(environment),
      "process.env.NODE_ENV": JSON.stringify(environment),
      "process.env.ENVIRONMENT": JSON.stringify(environment),
      "process.env.VITE_fbApiKey": JSON.stringify(env.VITE_fbApiKey),
      "process.env.VITE_fbAuthDomain": JSON.stringify(env.VITE_fbAuthDomain),
      "process.env.VITE_fbDatabaseURL": JSON.stringify(env.VITE_fbDatabaseURL),
      "process.env.VITE_fbProjectID": JSON.stringify(env.VITE_fbProjectID),
      "process.env.VITE_fbStorageBucket": JSON.stringify(env.VITE_fbStorageBucket),
      "process.env.VITE_fbMessagingSenderID": JSON.stringify(env.VITE_fbMessagingSenderID),
      "process.env.VITE_fbAppID": JSON.stringify(env.VITE_fbAppID),
      "process.env.VITE_measurmentID": JSON.stringify(env.VITE_measurmentID),
      "process.env.VITE_fbVapidKey": JSON.stringify(env.VITE_fbVapidKey),
      global: {},
    },
    server: {
      port: 3000,
      host: '0.0.0.0', // Bind to all interfaces so Docker containers can access it
      strictPort: false,
      cors: true, // Enable CORS
      proxy: {},
    },
    // Tell Vite to treat .gz files as binary assets
    assetsInclude: ["**/*.gz"],

    resolve: {
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["tests/setup.js"],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        all: true,
        include: ['src/**/*.{js,jsx}'],
        exclude: [
          'node_modules/',
          'dist/',
          'tests/',
          'src/routeTree.gen.js',
          '**/*.test.*',
          '**/*.spec.*',
          '**/coverage/**',
          '**/.{idea,git,cache,output,temp}/**',
          '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*'
        ]
      },
      // Include test files
      include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      // Exclude files from test runs
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/cypress/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*'
      ],
      // Test timeout
      testTimeout: 10000,
      // Hook timeout
      hookTimeout: 10000,
    },

    build: {
      sourcemap: true,
      target: "es2022",
      chunkSizeWarningLimit: 1000, // Increase warning limit to 1MB
      rollupOptions: {
        output: {
          // Let Vite handle chunking automatically - much easier to maintain!
          manualChunks: undefined,
          // Enable automatic chunking based on size and dependencies
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
        },
      },
    },
  };
});
