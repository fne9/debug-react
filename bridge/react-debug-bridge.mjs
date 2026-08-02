#!/usr/bin/env node

import { createServer } from "node:http";
import { createHash } from "node:crypto";

const PORT = Number(process.env.REACT_DEBUG_BRIDGE_PORT || 7823);
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const VERSION = "0.1.0";

const log = (...args) => console.error("[react-debug-bridge]", ...args);

const tabs = new Map();
let extensionSockets = 0;

function handleExtensionMessage(text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  if (msg.type === "snapshot" && typeof msg.tabId === "number") {
    tabs.set(msg.tabId, {
      url: String(msg.url ?? ""),
      updatedAt: Date.now(),
      data: msg.data ?? {},
    });
  } else if (msg.type === "tab-closed" && typeof msg.tabId === "number") {
    tabs.delete(msg.tabId);
  } else if (msg.type === "hello") {
    log(`extensão conectada (v${msg.version ?? "?"})`);
  }
}

function wsAcceptKey(key) {
  return createHash("sha1").update(key + WS_GUID).digest("base64");
}

function sendFrame(socket, opcode, payload = Buffer.alloc(0)) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try {
    socket.write(Buffer.concat([header, payload]));
  } catch {

  }
}

function handleWsSocket(socket) {
  extensionSockets++;
  let buffer = Buffer.alloc(0);
  let fragments = [];
  let fragOpcode = 0;

  const ping = setInterval(() => sendFrame(socket, 0x9), 20000);

  const cleanup = () => {
    clearInterval(ping);
    extensionSockets = Math.max(0, extensionSockets - 1);
  };
  socket.on("close", cleanup);
  socket.on("error", () => socket.destroy());

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 2) return;
      const fin = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let len = buffer[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buffer.length < 4) return;
        len = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buffer.length < 10) return;
        len = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (!Number.isSafeInteger(len) || len > 64 * 1024 * 1024) {

        socket.destroy();
        return;
      }
      const maskLen = masked ? 4 : 0;
      if (buffer.length < offset + maskLen + len) return;

      let payload = buffer.subarray(offset + maskLen, offset + maskLen + len);
      if (masked) {
        const mask = buffer.subarray(offset, offset + 4);
        const unmasked = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ mask[i & 3];
        payload = unmasked;
      }
      buffer = buffer.subarray(offset + maskLen + len);

      if (opcode === 0x8) {
        sendFrame(socket, 0x8);
        socket.end();
        return;
      }
      if (opcode === 0x9) {
        sendFrame(socket, 0xa, payload);
        continue;
      }
      if (opcode === 0xa) continue;

      if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
        if (opcode !== 0x0) fragOpcode = opcode;
        fragments.push(payload);
        if (fin) {
          const message = Buffer.concat(fragments);
          fragments = [];
          if (fragOpcode === 0x1) handleExtensionMessage(message.toString("utf8"));
        }
      }
    }
  });
}

const server = createServer((req, res) => {

  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      name: "react-debug-bridge",
      version: VERSION,
      extensionConnections: extensionSockets,
      tabs: [...tabs.entries()].map(([tabId, t]) => ({ tabId, url: t.url, updatedAt: t.updatedAt })),
    }),
  );
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || (req.headers.upgrade ?? "").toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }

  const origin = String(req.headers.origin ?? "");
  if (origin.startsWith("http://") || origin.startsWith("https://")) {
    log(`conexão WebSocket recusada (origin não permitida: ${origin})`);
    socket.destroy();
    return;
  }
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${wsAcceptKey(String(key))}\r\n\r\n`,
  );
  handleWsSocket(socket);
});

server.listen(PORT, "127.0.0.1", () => {
  log(`ouvindo em ws://127.0.0.1:${PORT} (extensão) e MCP via stdio`);
});
server.on("error", (e) => {
  log(`falha ao abrir a porta ${PORT}: ${e.message}`);
  process.exit(1);
});

function pickTab(tabId) {
  if (tabId !== undefined && tabId !== null) {
    const tab = tabs.get(Number(tabId));
    if (!tab) throw new Error(`aba ${tabId} não encontrada — use list_tabs para ver as abas ativas`);
    return { tabId: Number(tabId), ...tab };
  }
  let best = null;
  for (const [id, tab] of tabs) {
    if (!best || tab.updatedAt > best.updatedAt) best = { tabId: id, ...tab };
  }
  if (!best) {
    throw new Error(
      "nenhuma aba conectada — abra no Chrome uma página com a extensão React Debug ativa (recarregue a página se necessário)",
    );
  }
  return best;
}

const TAB_ID_SCHEMA = {
  type: "object",
  properties: {
    tabId: {
      type: "number",
      description: "ID da aba (opcional; padrão = aba com dados mais recentes; veja list_tabs)",
    },
  },
  additionalProperties: false,
};

const TOOLS = [
  {
    name: "list_tabs",
    description:
      "Lista as abas do Chrome monitoradas pela extensão React Debug (id, URL, versão do React, última atualização).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: () =>
      [...tabs.entries()].map(([tabId, t]) => ({
        tabId,
        url: t.url,
        atualizadoHa: `${Math.round((Date.now() - t.updatedAt) / 1000)}s`,
        react: t.data.env ?? null,
      })),
  },
  {
    name: "get_render_report",
    description:
      "Relatório de renders do React em tempo real: total de componentes/renders, renders lentos, e por componente as contagens, renders desnecessários (props inline recriadas), tempo total e a causa do último render. Use para responder 'quais componentes re-renderizam demais e por quê'.",
    inputSchema: TAB_ID_SCHEMA,
    handler: (args) => {
      const tab = pickTab(args?.tabId);
      return {
        url: tab.url,
        react: tab.data.env ?? null,
        overhead: tab.data.stats ?? null,
        perfilador: tab.data.profiler ?? null,
      };
    },
  },
  {
    name: "get_effect_issues",
    description:
      "Problemas detectados pelos analisadores estáticos de runtime: useEffect sem cleanup, sem array de deps, deps instáveis, efeito em loop, fetch sem AbortController e key={index}. Cada item traz componente, evidência (código do efeito) e fix sugerido.",
    inputSchema: TAB_ID_SCHEMA,
    handler: (args) => {
      const tab = pickTab(args?.tabId);
      return { url: tab.url, problemas: tab.data.issues ?? [] };
    },
  },
  {
    name: "get_vitals",
    description:
      "Core Web Vitals da página com atribuição React: CLS (com o componente que causou cada layout shift), LCP, INP (pior interação e handler responsável), FCP, TTFB e load.",
    inputSchema: TAB_ID_SCHEMA,
    handler: (args) => {
      const tab = pickTab(args?.tabId);
      return { url: tab.url, webVitals: tab.data.vitals ?? null };
    },
  },
  {
    name: "get_state_snapshot",
    description:
      "Snapshot do estado da aplicação: árvore de estado Redux atual, últimas actions com as chaves alteradas, e resumo de memória (heap usado, taxa de crescimento, suspeita de vazamento).",
    inputSchema: TAB_ID_SCHEMA,
    handler: (args) => {
      const tab = pickTab(args?.tabId);
      return { url: tab.url, redux: tab.data.redux ?? null, memoria: tab.data.memory ?? null };
    },
  },
];

function rpcReply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function rpcError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

function handleRpc(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  if (method === "initialize") {
    rpcReply(id, {
      protocolVersion: params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "react-debug-bridge", version: VERSION },
    });
    return;
  }
  if (method === "ping") {
    rpcReply(id, {});
    return;
  }
  if (isNotification) return;

  if (method === "tools/list") {
    rpcReply(id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
    return;
  }

  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) {
      rpcError(id, -32602, `tool desconhecida: ${params?.name}`);
      return;
    }
    try {
      const result = tool.handler(params?.arguments ?? {});
      rpcReply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (e) {
      rpcReply(id, {
        content: [{ type: "text", text: `Erro: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      });
    }
    return;
  }

  rpcError(id, -32601, `método não suportado: ${method}`);
}

let stdinBuffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinBuffer += chunk;
  let newline;
  while ((newline = stdinBuffer.indexOf("\n")) >= 0) {
    const line = stdinBuffer.slice(0, newline).trim();
    stdinBuffer = stdinBuffer.slice(newline + 1);
    if (!line) continue;
    try {
      handleRpc(JSON.parse(line));
    } catch (e) {
      log(`mensagem MCP inválida: ${e.message}`);
    }
  }
});

process.stdin.on("end", () => {
  if (!process.stdin.isTTY) {
    log("stdio encerrado pelo cliente MCP — saindo");
    process.exit(0);
  }
});
