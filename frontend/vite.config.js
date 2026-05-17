import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig(({ command, mode }) => {
  // Repo root `.env` (monorepo) then app dir (`frontend/`) — same keys in `frontend/.env*` override root.
  const envFromRoot = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const envFromAppDir = loadEnv(mode, process.cwd(), "");
  const env = { ...envFromRoot, ...envFromAppDir };

  // Read ENVIRONMENT from merged .env, process (Dockerfile / CI), or default to production
  const environment = env.ENVIRONMENT || process.env.ENVIRONMENT || process.env.NODE_ENV || "production";

  const sentryOrg = env.SENTRY_ORG || process.env.SENTRY_ORG;
  const sentryProjectId = env.SENTRY_PROJECT_ID || process.env.SENTRY_PROJECT_ID;
  const sentryDsn = env.SENTRY_DSN || process.env.SENTRY_DSN;
  const sentryTracesSampleRate =
    env.SENTRY_TRACES_SAMPLE_RATE ?? process.env.SENTRY_TRACES_SAMPLE_RATE ?? "";
  const sentryErrorSampleRate =
    env.SENTRY_ERROR_SAMPLE_RATE ?? process.env.SENTRY_ERROR_SAMPLE_RATE ?? "";

  const frontendAppVersion = (
    env.FRONTEND_APP_VERSION ||
    env.APP_VERSION ||
    process.env.FRONTEND_APP_VERSION ||
    process.env.APP_VERSION ||
    ""
  ).trim();
  if (!frontendAppVersion) {
    throw new Error(
      "FRONTEND_APP_VERSION or APP_VERSION must be set (repo-root .env for local dev; Docker/CI build args for images)."
    );
  }

  const analyzeBundle =
    process.env.ANALYZE === "1" ||
    String(process.env.ANALYZE || "").toLowerCase() === "true";

  // Sentry bundler plugin: heavy on `vite` dev (transforms every module; plugin timings often >50% of HMR).
  // `vite build` still runs it for release/source maps. Set SENTRY_VITE_PLUGIN_IN_DEV=1 to enable during dev.
  const runSentryVitePlugin =
    command === "build" ||
    String(env.SENTRY_VITE_PLUGIN_IN_DEV || process.env.SENTRY_VITE_PLUGIN_IN_DEV || "").trim() === "1";

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
      ...(runSentryVitePlugin
        ? [
            sentryVitePlugin({
              // org = organization slug (…/organizations/<slug>/); project = project slug (…/projects/<slug>/).
              org: sentryOrg || "eve-industry-planner",
              project: sentryProjectId,
              telemetry: false,
            }),
          ]
        : []),
      ...(analyzeBundle
        ? [
            visualizer({
              filename: "dist/stats.html",
              open: false,
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
    ],

    // Flat `process.env.KEY` entries so the bundler replaces every access (nested `process.env`
    // objects do not reliably rewrite `process.env.ENVIRONMENT` in app + Zustand code).
    define: {
      __APP_VERSION__: JSON.stringify(frontendAppVersion),
      "import.meta.env.SENTRY_PROJECT_ID": JSON.stringify(sentryProjectId),
      "import.meta.env.SENTRY_DSN": JSON.stringify(sentryDsn),
      "import.meta.env.SENTRY_TRACES_SAMPLE_RATE": JSON.stringify(sentryTracesSampleRate),
      "import.meta.env.SENTRY_ERROR_SAMPLE_RATE": JSON.stringify(sentryErrorSampleRate),
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
      chunkSizeWarningLimit: 1000, // kB — warn when a chunk exceeds this size after minification
    },
  };
});
