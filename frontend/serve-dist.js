const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT ?? 3000);
const DIST_DIR = path.join(__dirname, "dist");
const INDEX_FILE = path.join(DIST_DIR, "index.html");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
};

function safeJoin(baseDir, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const joined = path.join(baseDir, normalized);
  if (!joined.startsWith(baseDir)) return null;
  return joined;
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] ?? "application/octet-stream";
  const relativePath = path.relative(DIST_DIR, filePath).replace(/\\/g, "/");
  const cacheControl =
    ext === ".html"
      ? "no-cache"
      : relativePath.startsWith("assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end("Erro interno do servidor");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": cacheControl });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";
  const rawPath = url.split("?")[0] ?? "/";

  // Remove leading slash so safeJoin works properly
  const requestPath = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
  const looksLikeAsset = path.extname(requestPath) !== "";

  const filePath = safeJoin(DIST_DIR, requestPath || "index.html");
  if (!filePath) {
    res.writeHead(400);
    res.end("Requisição inválida");
    return;
  }

  fs.stat(filePath, (statErr, stat) => {
    if (!statErr && stat.isDirectory()) {
      // Directory access: try index.html inside, else SPA fallback
      const dirIndex = path.join(filePath, "index.html");
      fs.stat(dirIndex, (dirErr, dirStat) => {
        if (!dirErr && dirStat.isFile()) {
          serveFile(dirIndex, res);
          return;
        }
        serveFile(INDEX_FILE, res);
      });
      return;
    }

    if (!statErr && stat.isFile()) {
      serveFile(filePath, res);
      return;
    }

    if (looksLikeAsset) {
      res.writeHead(404);
      res.end("Arquivo não encontrado");
      return;
    }

    // SPA fallback
    serveFile(INDEX_FILE, res);
  });
});

server.listen(PORT, () => {
  console.log(`[serve-dist] Servindo ${DIST_DIR}`);
  console.log(`[serve-dist] http://localhost:${PORT}`);
});
