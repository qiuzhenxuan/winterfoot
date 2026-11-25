import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
// three.js is bundled in ./vendor/three so the game runs on any computer (and any static host).
const THREE_DIR = path.join(ROOT_DIR, "vendor", "three");
const PORT = Number(process.argv[2] || 8090);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function resolveSafe(baseDir, relPath) {
  const cleaned = decodeURIComponent(relPath).replace(/^\/+/, "");
  const fullPath = path.resolve(baseDir, cleaned);
  if (fullPath !== baseDir && !fullPath.startsWith(baseDir + path.sep)) {
    return null;
  }
  return fullPath;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  let filePath = null;

  if (url.pathname.startsWith("/vendor/three/")) {
    const subPath = url.pathname.slice("/vendor/three/".length);
    filePath = resolveSafe(THREE_DIR, subPath);
  } else {
    const target = url.pathname === "/" ? "/index.html" : url.pathname;
    filePath = resolveSafe(ROOT_DIR, target);
  }

  if (!filePath) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not Found: " + url.pathname);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[Winterfoot] Server running at http://127.0.0.1:${PORT}/`);
  console.log(`[Winterfoot] Mapping /vendor/three/ -> ${THREE_DIR}`);
});
