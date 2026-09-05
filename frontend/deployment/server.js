"use strict";

import http from "http";
import fs from "fs";
import path from "path";
import { createGzip, createBrotliCompress, constants } from "zlib";

/**
 * Parse Accept-Encoding header and select best encoding based on quality values
 * Returns the encoding type ("br", "gzip", or null) and its quality value
 */
function parseAcceptEncoding(acceptEncoding) {
  if (!acceptEncoding) {
    return { encoding: null, quality: -1 };
  }

  let bestEncoding = null;
  let bestQuality = -1.0;
  const headerLen = acceptEncoding.length;

  for (let i = 0; i < headerLen; ) {
    // Skip whitespace and commas
    while (i < headerLen && (acceptEncoding[i] === " " || acceptEncoding[i] === "\t" || acceptEncoding[i] === ",")) {
      i++;
    }
    if (i >= headerLen) {
      break;
    }

    const start = i;
    // Find end of encoding name (comma or semicolon)
    while (i < headerLen && acceptEncoding[i] !== "," && acceptEncoding[i] !== ";") {
      i++;
    }

    let encoding = acceptEncoding.slice(start, i).trim();
    const encLen = encoding.length;

    // Skip empty encodings
    if (encLen === 0) {
      while (i < headerLen && acceptEncoding[i] !== ",") {
        i++;
      }
      continue;
    }

    // Parse quality value (defaults to 1.0 if not specified)
    let quality = 1.0;
    if (i < headerLen && acceptEncoding[i] === ";") {
      i++; // skip semicolon
      // Skip whitespace after semicolon
      while (i < headerLen && (acceptEncoding[i] === " " || acceptEncoding[i] === "\t")) {
        i++;
      }
      // Check for q=
      if (i + 1 < headerLen && (acceptEncoding[i] === "q" || acceptEncoding[i] === "Q") && acceptEncoding[i + 1] === "=") {
        i += 2; // skip "q="
        // Skip whitespace after =
        while (i < headerLen && (acceptEncoding[i] === " " || acceptEncoding[i] === "\t")) {
          i++;
        }
        // Parse the quality value
        const qStart = i;
        while (i < headerLen && acceptEncoding[i] !== "," && acceptEncoding[i] !== " " && acceptEncoding[i] !== "\t") {
          i++;
        }
        if (qStart < i) {
          const q = parseFloat(acceptEncoding.slice(qStart, i));
          if (!isNaN(q)) {
            quality = q;
          }
        }
      }
    }

    // Skip encodings with quality 0 (explicitly not accepted)
    if (quality === 0) {
      while (i < headerLen && acceptEncoding[i] !== ",") {
        i++;
      }
      continue;
    }

    // Handle wildcard (*) - use brotli if quality is better than current best
    if (encoding === "*" && quality > bestQuality) {
      bestEncoding = "br";
      bestQuality = quality;
    }

    // Check if this encoding is supported and has higher or equal quality
    // Prefer brotli when quality is equal (better compression ratio)
    if (encLen >= 2 && quality >= bestQuality) {
      // Fast check for "br" or "brotli"
      if ((encoding[0] === "b" || encoding[0] === "B") && (encoding[1] === "r" || encoding[1] === "R")) {
        if (encLen === 2 || (encLen === 6 && encoding.toLowerCase() === "brotli")) {
          // Prefer brotli if quality is better, or equal and current best is gzip
          if (quality > bestQuality || (quality === bestQuality && bestEncoding === "gzip")) {
            bestEncoding = "br";
            bestQuality = quality;
          }
        }
      } else if (
        encLen === 4 &&
        (encoding[0] === "g" || encoding[0] === "G") &&
        (encoding[1] === "z" || encoding[1] === "Z") &&
        (encoding[2] === "i" || encoding[2] === "I") &&
        (encoding[3] === "p" || encoding[3] === "P")
      ) {
        // Only set gzip if quality is strictly better (brotli preferred when equal)
        if (quality > bestQuality) {
          bestEncoding = "gzip";
          bestQuality = quality;
        }
      }
    }

    // Skip to next encoding
    while (i < headerLen && acceptEncoding[i] !== ",") {
      i++;
    }
  }

  return { encoding: bestEncoding, quality: bestQuality };
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Create HTTP server with compression support
 */
export function createServer(distDir, port = 80) {
  const server = http.createServer((req, res) => {
    // Suppress health check requests from logs
    const shouldLog = !req.url.includes("/health.json");

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");

    // Handle OPTIONS requests
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Parse Accept-Encoding and select best compression
    const acceptEncoding = req.headers["accept-encoding"] || "";
    const { encoding: compressionType } = parseAcceptEncoding(acceptEncoding);

    // Strip query string and hash from URL
    const urlPath = req.url.split("?")[0].split("#")[0];
    
    // Determine file path (SPA fallback to index.html for non-file requests)
    let filePath = path.join(distDir, urlPath === "/" ? "index.html" : urlPath);

    // Check if file exists, if not and it's not a file extension, try index.html (SPA routing)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      if (!ext || ext === "") {
        filePath = path.join(distDir, "index.html");
      } else {
        // File doesn't exist
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        if (shouldLog) {
          console.log(`${req.method} ${req.url} - 404`);
        }
        return;
      }
    }

    // Read file
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
        if (shouldLog) {
          console.log(`${req.method} ${req.url} - 500: ${err.message}`);
        }
        return;
      }

      const mimeType = getMimeType(filePath);
      const headers = {
        "Content-Type": mimeType,
      };

      // Add Cache-Control headers for Cloudflare caching
      // These headers help Cloudflare understand what can be cached and for how long
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);
      
      // Check if file has a hash in the name (versioned assets)
      // Versioned assets (e.g., app.abc123.js) can be cached indefinitely since the hash changes on updates
      const hasHash = /[a-f0-9]{8,}/i.test(fileName);
      
      if (ext === ".html" || fileName === "index.html") {
        // HTML files - 1 hour cache (3600 seconds) with stale-while-revalidate
        // HTML may contain dynamic content or need updates, so shorter cache is safer
        // stale-while-revalidate allows Cloudflare to serve instantly while updating in background
        headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400";
      } else if ((ext === ".js" || ext === ".css") && hasHash) {
        // Versioned JS/CSS files - 1 year cache (31536000 seconds), immutable
        // These files have content hashes in their names, so they can be cached indefinitely
        // The hash changes when content changes, ensuring users get updated files
        headers["Cache-Control"] = "public, max-age=31536000, immutable";
      } else if (ext === ".js" || ext === ".css") {
        // Non-versioned JS/CSS files - 1 hour cache (3600 seconds) with stale-while-revalidate
        // Without versioning, we use shorter cache to allow for updates
        // stale-while-revalidate allows Cloudflare to serve instantly while updating in background
        headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400";
      } else if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot"].includes(ext)) {
        // Images and fonts - 1 year cache (31536000 seconds), immutable
        // These assets rarely change and can be cached long-term
        // Cloudflare will serve these from cache, significantly reducing egress
        headers["Cache-Control"] = "public, max-age=31536000, immutable";
      } else {
        // Other static files - 1 hour cache (3600 seconds) with stale-while-revalidate
        // Default cache for unknown file types
        // stale-while-revalidate allows Cloudflare to serve instantly while updating in background
        headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400";
      }

      // Skip compression for already-compressed assets (images, fonts, etc.)
      // These files are already optimised and compression provides minimal benefit
      const alreadyCompressed = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".woff", ".woff2", ".mp4", ".zip", ".gz"].includes(ext);
      
      // Apply compression if supported and asset is not already compressed
      if (!alreadyCompressed && compressionType === "br") {
        headers["Vary"] = "Accept-Encoding";
        headers["Content-Encoding"] = "br";
        delete headers["Content-Length"];

        const brotli = createBrotliCompress({
          params: {
            [constants.BROTLI_PARAM_QUALITY]: 6, // Quality level 6 (optimized for better compression)
          },
        });
        res.writeHead(200, headers);
        brotli.pipe(res);
        brotli.end(data);
        if (shouldLog) {
          console.log(`${req.method} ${req.url} - 200 (brotli)`);
        }
      } else if (!alreadyCompressed && compressionType === "gzip") {
        headers["Vary"] = "Accept-Encoding";
        headers["Content-Encoding"] = "gzip";
        delete headers["Content-Length"];

        const gzip = createGzip({ level: 6 }); // Level 6 (optimized for better compression)
        res.writeHead(200, headers);
        gzip.pipe(res);
        gzip.end(data);
        if (shouldLog) {
          console.log(`${req.method} ${req.url} - 200 (gzip)`);
        }
      } else {
        // No compression
        headers["Content-Length"] = data.length;
        res.writeHead(200, headers);
        res.end(data);
        if (shouldLog) {
          console.log(`${req.method} ${req.url} - 200`);
        }
      }
    });
  });

  server.listen(port, () => {
    console.log(`Static server with compression listening on port ${port}`);
  });

  return server;
}
