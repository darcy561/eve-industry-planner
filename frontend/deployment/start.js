"use strict";

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { generateRuntimeConfig } from "./runtimeConfig.js";
import { processServiceWorkers } from "./swInjection.js";

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

  // Process service workers
  processServiceWorkers(DIST_DIR);

  console.log(`Starting static server on port ${PORT}...`);
  
  // Start serve with SPA support and CORS
  const serveArgs = ["-s", DIST_DIR, "-l", PORT.toString(), "--cors"];
  const child = spawn("serve", serveArgs, { stdio: "inherit" });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`serve process exited with code ${code}`);
    }
    process.exit(code || 0);
  });

  child.on("error", (err) => {
    console.error("Failed to start serve:", err);
    process.exit(1);
  });
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}
