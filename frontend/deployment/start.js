"use strict";

import fs from "fs";
import path from "path";
import { generateRuntimeConfig } from "./runtimeConfig.js";
import { createServer } from "./server.js";

process.title = "frontend-service";

const DIST_DIR = path.join(process.cwd(), "dist");
const PORT = 80;

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  console.error(`Error: dist directory not found at ${DIST_DIR}`);
  process.exit(1);
}

try {
  // Generate runtime config
  generateRuntimeConfig(DIST_DIR);

  // Start custom server with compression support
  const server = createServer(DIST_DIR, PORT);

  // Node is PID 1 here, so the process only stops on a signal it handles itself.
  const shutdown = () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}
