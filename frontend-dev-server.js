#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT     = Number(process.env.FRONTEND_PORT || 8080);
const API_PORT = Number(process.env.API_PORT || 3000);
const ROOT     = __dirname;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".toml": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

function send(response, status, headers, body) {
  response.writeHead(status, headers);
  response.end(body);
}

function resolveRequestPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0]);
  const normalizedPath = path.normalize(decodedPath).replace(/^([.][.][/\\])+/, "");
  const requestedPath = normalizedPath === path.sep ? "index.html" : normalizedPath.replace(/^[/\\]+/, "") || "index.html";
  const absolutePath = path.join(ROOT, requestedPath);
  const safeRelative = path.relative(ROOT, absolutePath);
  if (safeRelative.startsWith("..") || path.isAbsolute(safeRelative)) {
    return null;
  }
  return absolutePath;
}

function proxyToApi(request, response) {
  const options = {
    hostname: "127.0.0.1",
    port: API_PORT,
    path: request.url,
    method: request.method,
    headers: { ...request.headers, host: `127.0.0.1:${API_PORT}` },
  };
  const proxy = http.request(options, (upstream) => {
    response.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(response);
  });
  proxy.on("error", (err) => {
    const msg = `Backend unavailable (${err.message}). Start the backend: node backend/src/server.js`;
    send(response, 502, { "Content-Type": "application/json" }, JSON.stringify({ error: msg }));
  });
  request.pipe(proxy);
}

const server = http.createServer((request, response) => {
  // Proxy all /api/* requests to the backend
  if ((request.url || "/").startsWith("/api/")) {
    proxyToApi(request, response);
    return;
  }

  const absolutePath = resolveRequestPath(request.url || "/");
  if (!absolutePath) {
    send(response, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");
    return;
  }

  let filePath = absolutePath;
  try {
    const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    if (stats?.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      send(response, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const body = fs.readFileSync(filePath);
    send(response, 200, {
      "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    }, body);
  } catch (error) {
    send(response, 500, { "Content-Type": "text/plain; charset=utf-8" }, error.message || "Server error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nRF Planner frontend  →  http://127.0.0.1:${PORT}`);
  console.log(`API proxy            →  /api/* forwarded to http://127.0.0.1:${API_PORT}\n`);
});

process.on("SIGINT", () => {
  console.log("\nFrontend dev server stopped.");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nFrontend dev server stopped.");
  process.exit(0);
});
