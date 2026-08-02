import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT ?? 8123);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = req.url === "/" ? "/index.html" : (req.url ?? "/").split("?")[0];
    try {
      urlPath = decodeURIComponent(urlPath);
    } catch {
      res.writeHead(400).end("400");
      return;
    }

    const filePath = normalize(join(root, urlPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("403");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("404");
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Porta ${PORT} já está em uso — feche o outro processo ou rode com PORT=<outra> npm run demo`);
  } else {
    console.error(`Falha ao iniciar o servidor da demo: ${e.message}`);
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Demo do React Debug em http://localhost:${PORT}`);
});
