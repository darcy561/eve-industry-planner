import fs from "fs";
import path from "path";
import { escapeJsString } from "./utils.js";

export function processServiceWorkers(distDir) {
  const SW_FILES = [
    path.join(distDir, "sw.js"),
    path.join(distDir, "firebase-messaging-sw.js"),
  ];

  SW_FILES.forEach(swFile => {
    if (!fs.existsSync(swFile)) return;

    console.log(`Processing service worker: ${swFile}`);

    try {
      let content = fs.readFileSync(swFile, "utf8");

      const replacements = {
        __FIREBASE_API_KEY__: escapeJsString(process.env.FIREBASE_API_KEY || ""),
        __FIREBASE_AUTH_DOMAIN__: escapeJsString(process.env.FIREBASE_AUTH_DOMAIN || ""),
        __FIREBASE_DATABASE_URL__: escapeJsString(process.env.FIREBASE_DATABASE_URL || ""),
        __FIREBASE_PROJECT_ID__: escapeJsString(process.env.FIREBASE_PROJECT_ID || ""),
        __FIREBASE_STORAGE_BUCKET__: escapeJsString(process.env.FIREBASE_STORAGE_BUCKET || ""),
        __FIREBASE_MESSAGING_SENDER_ID__: escapeJsString(process.env.FIREBASE_MESSAGING_SENDER_ID || ""),
        __FIREBASE_APP_ID__: escapeJsString(process.env.FIREBASE_APP_ID || ""),
        __FIREBASE_MEASUREMENT_ID__: escapeJsString(process.env.FIREBASE_MEASUREMENT_ID || ""),
        __FIREBASE_VAPID_KEY__: escapeJsString(process.env.FIREBASE_VAPID_KEY || "")
      };

      for (const [key, val] of Object.entries(replacements)) {
        content = content.replaceAll(key, `'${val}'`);
      }

      fs.writeFileSync(swFile, content, "utf8");
    } catch (error) {
      console.error(`Failed to process service worker ${swFile}: ${error.message}`);
      throw error;
    }
  });
}
