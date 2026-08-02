const BRIDGE_URL = "ws://127.0.0.1:7823";
const FLUSH_MS = 1000;
const RETRY_MIN_MS = 3000;
const RETRY_MAX_MS = 30000;

export interface BridgeSnapshot {
  url: string;
  data: unknown;
}

export interface BridgeHooks {
  collect: (tabId: number) => BridgeSnapshot | null;
  allTabs: () => number[];
}

export interface BridgeClient {
  markDirty: (tabId: number) => void;
  tabClosed: (tabId: number) => void;
}

export function initBridge(hooks: BridgeHooks): BridgeClient {
  let socket: WebSocket | null = null;
  let retryDelay = RETRY_MIN_MS;
  let retryScheduled = false;
  const dirty = new Set<number>();

  function scheduleRetry(): void {
    if (retryScheduled) return;
    retryScheduled = true;
    setTimeout(() => {
      retryScheduled = false;
      connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
  }

  function connect(): void {
    if (socket) return;
    try {
      const ws = new WebSocket(BRIDGE_URL);
      socket = ws;
      ws.onopen = () => {
        retryDelay = RETRY_MIN_MS;
        send({ type: "hello", version: "0.1.0" });

        for (const tabId of hooks.allTabs()) dirty.add(tabId);
      };
      ws.onclose = () => {
        if (socket === ws) socket = null;
        scheduleRetry();
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {

        }
      };
    } catch {
      socket = null;
      scheduleRetry();
    }
  }

  function send(payload: unknown): void {
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(payload));
      } catch {

      }
    }
  }

  setInterval(() => {
    if (socket?.readyState !== WebSocket.OPEN || dirty.size === 0) return;
    for (const tabId of dirty) {
      const snapshot = hooks.collect(tabId);
      if (snapshot) {
        send({ type: "snapshot", tabId, url: snapshot.url, data: snapshot.data });
      }
    }
    dirty.clear();
  }, FLUSH_MS);

  connect();

  return {
    markDirty(tabId: number) {
      dirty.add(tabId);
    },
    tabClosed(tabId: number) {
      dirty.delete(tabId);
      send({ type: "tab-closed", tabId });
    },
  };
}
