import {
  AGENT_SOURCE,
  CONTENT_SOURCE,
  PROTOCOL_VERSION,
  type AgentEnvMessage,
  type AgentEventsMessage,
  type AgentHelloMessage,
  type AgentIssuesMessage,
  type AgentMemoryMessage,
  type AgentProfilerMessage,
  type AgentReduxMessage,
  type AgentStatsMessage,
  type AgentVitalsMessage,
  type ContentMessage,
  type DebugEvent,
  type EventKind,
  type ReactEnvInfo,
} from "../shared/protocol";
import { RingBuffer } from "./ring-buffer";
import { initReactAdapter } from "./react-adapter";
import { initVitals } from "./vitals";
import { initRedux } from "./redux";
import { initMemory } from "./memory";
import { setHeatmap, setOverlayEnabled } from "./overlay";

declare global {
  interface Window {
    __REACT_DEBUG_AGENT__?: {
      version: string;
      protocolVersion: number;
      emit: (kind: EventKind, label: string, opts?: { detail?: string; payload?: unknown }) => void;
    };
  }
}

const MAX_PENDING = 2000;
const FLUSH_MS = 16;
const STATS_INTERVAL_MS = 1000;
const FRAME_MS = 16.67;

(() => {
  if (window.__REACT_DEBUG_AGENT__) return;

  const sessionId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  let seq = 0;
  let contentReady = false;
  let flushScheduled = false;
  const pending = new RingBuffer<DebugEvent>(MAX_PENDING);

  let busyMs = 0;
  let eventsInWindow = 0;
  let windowStart = performance.now();
  let trackDepth = 0;

  function track<T>(fn: () => T): T {
    if (trackDepth > 0) return fn();
    trackDepth++;
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      trackDepth--;
      busyMs += performance.now() - t0;
    }
  }

  function emit(kind: EventKind, label: string, opts?: { detail?: string; payload?: unknown }): void {
    track(() => {
      pending.push({
        id: `${sessionId}:${++seq}`,
        kind,
        ts: Date.now(),
        label,
        detail: opts?.detail,
        payload: opts?.payload,
      });
      eventsInWindow++;
      scheduleFlush();
    });
  }

  function scheduleFlush(): void {
    if (flushScheduled || !contentReady) return;
    flushScheduled = true;
    setTimeout(flush, FLUSH_MS);
  }

  function flush(): void {
    flushScheduled = false;
    track(() => {
      if (pending.size === 0) return;
      const message: AgentEventsMessage = {
        source: AGENT_SOURCE,
        type: "events",
        events: pending.drain(),
      };
      window.postMessage(message, "*");
    });
  }

  setInterval(() => {
    const now = performance.now();
    const elapsed = now - windowStart;
    if (contentReady && elapsed > 0) {
      const message: AgentStatsMessage = {
        source: AGENT_SOURCE,
        type: "stats",
        ts: Date.now(),
        overheadMsPerFrame: busyMs / Math.max(1, elapsed / FRAME_MS),
        eventsPerSecond: eventsInWindow / (elapsed / 1000),
      };
      window.postMessage(message, "*");
    }
    busyMs = 0;
    eventsInWindow = 0;
    windowStart = now;
  }, STATS_INTERVAL_MS);

  let lastEnvMessage: AgentEnvMessage | null = null;

  function sendEnv(react: ReactEnvInfo): void {
    lastEnvMessage = { source: AGENT_SOURCE, type: "env", ts: Date.now(), react };
    if (contentReady) window.postMessage(lastEnvMessage, "*");
  }

  function sendProfiler(message: AgentProfilerMessage): void {
    if (contentReady) window.postMessage(message, "*");
  }

  function sendIssues(message: AgentIssuesMessage): void {
    if (contentReady) window.postMessage(message, "*");
  }

  function sendVitals(message: AgentVitalsMessage): void {
    if (contentReady) window.postMessage(message, "*");
  }

  function sendRedux(message: AgentReduxMessage): void {
    if (contentReady) window.postMessage(message, "*");
  }

  function sendMemory(message: AgentMemoryMessage): void {
    if (contentReady) window.postMessage(message, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data as ContentMessage | undefined;
    if (!data || data.source !== CONTENT_SOURCE) return;

    if (data.type === "content-ready" && !contentReady) {
      contentReady = true;
      if (lastEnvMessage) window.postMessage(lastEnvMessage, "*");
      vitals.refresh();
      redux.refresh();
      memory.refresh();
      scheduleFlush();
    } else if (data.type === "control") {
      setOverlayEnabled(data.overlay);
      if (data.heatmap) setHeatmap(data.heatmap);
    } else if (data.type === "dispatch") {
      redux.dispatchAction(data.actionJson);
    }
  });

  const redux = initRedux({ emit, track, send: sendRedux });

  initReactAdapter({ emit, track, sendEnv, sendProfiler, sendIssues });

  const vitals = initVitals({ emit, track, send: sendVitals });

  const memory = initMemory({ emit, track, send: sendMemory });

  const hello: AgentHelloMessage = {
    source: AGENT_SOURCE,
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
  };
  window.postMessage(hello, "*");

  window.addEventListener(
    "error",
    (event) => {
      if (event instanceof ErrorEvent && event.message) {
        emit("error", event.message, {
          detail: event.filename ? `${event.filename.split("/").pop()}:${event.lineno}` : undefined,
          payload: { stack: event.error?.stack?.split("\n").slice(0, 8).join("\n") },
        });
      } else if (event.target && event.target !== window) {
        const el = event.target as Element;
        emit("error", "Falha ao carregar recurso", {
          detail: `<${el.tagName?.toLowerCase() ?? "?"}> ${(el as HTMLImageElement).src ?? ""}`.slice(0, 200),
        });
      }
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    emit("error", "Promise rejeitada sem tratamento", {
      detail: String(event.reason).slice(0, 200),
    });
  });

  window.__REACT_DEBUG_AGENT__ = {
    version: "0.1.0",
    protocolVersion: PROTOCOL_VERSION,
    emit,
  };

  emit("system", "Agent instalado", { detail: `protocolo v${PROTOCOL_VERSION}` });
})();
