import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      sentryVitePlugin({
        org: "eve-industry-planner",
        project: env.VITE_SENTRY_PROJECT,
      }),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "null",
        srcDir: "public",
        filename: "sw.js",
        strategies: "injectManifest", // Allows you to provide a custom service worker
        injectManifest: {
          injectionPoint: undefined,
        },
      }),
    ],

    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      global: {},
    },
    server: {
      port: 3000,
    },

    test: {
      environment: "jsdom",
      coverage: {},
      setupFiles: "tests/setup.ts",
    },

    build: {
      sourcemap: true,
    },
  };
});
