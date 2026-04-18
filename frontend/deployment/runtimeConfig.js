import fs from "fs";
import path from "path";
import { escapeJsString } from "./utils.js";

export function generateRuntimeConfig(distDir) {
  const CONFIG_FILE = path.join(distDir, "env.js");

  console.log(`Generating runtime config at container startup...`);

  try {
    const configContent = `// Runtime configuration - injected at container startup
window.env = {
  ENVIRONMENT: "${escapeJsString(process.env.ENVIRONMENT || "production")}",
  FIREBASE_API_KEY: "${escapeJsString(process.env.FIREBASE_API_KEY || "")}",
  FIREBASE_AUTH_DOMAIN: "${escapeJsString(process.env.FIREBASE_AUTH_DOMAIN || "")}",
  FIREBASE_DATABASE_URL: "${escapeJsString(process.env.FIREBASE_DATABASE_URL || "")}",
  FIREBASE_PROJECT_ID: "${escapeJsString(process.env.FIREBASE_PROJECT_ID || "")}",
  FIREBASE_APP_ID: "${escapeJsString(process.env.FIREBASE_APP_ID || "")}",
  RECAPTCHA_KEY: "${escapeJsString(process.env.RECAPTCHA_KEY || "")}",
  GA4_MEASUREMENT_ID: "${escapeJsString(process.env.GA4_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID || "")}",
  EVE_CLIENT_ID: "${escapeJsString(process.env.EVE_CLIENT_ID || "")}",
  EVE_CALLBACK_URL: "${escapeJsString(process.env.EVE_CALLBACK_URL || "")}",
  EVE_SCOPE: "${escapeJsString(process.env.EVE_SCOPE || "")}"
};
`;

    fs.writeFileSync(CONFIG_FILE, configContent, "utf8");
    console.log(`Runtime config generated: ${CONFIG_FILE}`);
  } catch (error) {
    console.error(`Failed to generate runtime config: ${error.message}`);
    throw error;
  }
}
