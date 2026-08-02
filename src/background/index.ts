import {
  PORT_AI,
  PORT_CONTENT,
  PORT_PANEL,
  type AgentMessage,
  type AiBackgroundMessage,
  type AiPanelMessage,
  type AgentProfilerMessage,
  type AgentStatsMessage,
  type BackgroundMessage,
  type DebugEvent,
  type DetectedIssue,
  type HeatmapControl,
  type HistoryMessage,
  type MemorySummary,
  type PanelMessage,
  type ReactEnvInfo,
  type ReduxSummary,
  type VitalsSummary,
} from "../shared/protocol";
import { loadSettings } from "../shared/settings";
import { listModels, streamCompletion } from "./ai";
import { initBridge } from "./bridge";

const MAX_BUFFER = 2000;

interface TabState {
  url: string;
  events: DebugEvent[];
  stats: AgentStatsMessage | null;
  env: ReactEnvInfo | null;
  profiler: AgentProfilerMessage | null;
  issues: DetectedIssue[];
  vitals: VitalsSummary | null;
  redux: ReduxSummary | null;
  memory: MemorySummary | null;
  panelPort: chrome.runtime.Port | null;
  contentPort: chrome.runtime.Port | null;
  overlayEnabled: boolean;
  heatmap: HeatmapControl | null;
}

const tabs = new Map<number, TabState>();

function getState(tabId: number): TabState {
  let state = tabs.get(tabId);
  if (!state) {
    state = {
      url: "",
      events: [],
      stats: null,
      env: null,
      profiler: null,
      issues: [],
      vitals: null,
      redux: null,
      memory: null,
      panelPort: null,
      contentPort: null,
      overlayEnabled: false,
      heatmap: null,
    };
    tabs.set(tabId, state);
  }
  return state;
}

function pushEvents(state: TabState, events: DebugEvent[]): void {
  state.events.push(...events);
  if (state.events.length > MAX_BUFFER) {
    state.events.splice(0, state.events.length - MAX_BUFFER);
  }
}

function sendToPanel(state: TabState, message: BackgroundMessage): void {
  try {
    state.panelPort?.postMessage(message);
  } catch {
    state.panelPort = null;
  }
}

const bridge = initBridge({
  collect(tabId) {
    const state = tabs.get(tabId);
    if (!state) return null;
    return {
      url: state.url,
      data: {
        env: state.env,
        stats: state.stats
          ? {
              overheadMsPerFrame: state.stats.overheadMsPerFrame,
              eventsPerSecond: state.stats.eventsPerSecond,
            }
          : null,
        profiler: state.profiler,
        issues: state.issues,
        vitals: state.vitals,
        redux: state.redux,
        memory: state.memory,
      },
    };
  },
  allTabs: () =>
    [...tabs.entries()].filter(([, s]) => s.contentPort !== null).map(([id]) => id),
});

chrome.runtime.onConnect.addListener((port) => {

  const fromExtensionPage =
    port.sender?.url?.startsWith(chrome.runtime.getURL("")) === true;

  if (port.name === PORT_AI) {
    if (!fromExtensionPage) {
      port.disconnect();
      return;
    }
    handleAiPort(port);
    return;
  }

  if (port.name === PORT_CONTENT) {
    const tabId = port.sender?.tab?.id;
    const frameId = port.sender?.frameId;
    if (tabId === undefined || frameId !== 0) return;

    const state = getState(tabId);
    state.events = [];
    state.stats = null;
    state.env = null;
    state.profiler = null;
    state.issues = [];
    state.vitals = null;
    state.redux = null;
    state.memory = null;
    state.contentPort = port;
    state.url = port.sender?.url ?? "";

    if (state.overlayEnabled || state.heatmap?.enabled) {
      try {
        port.postMessage({
          type: "control",
          overlay: state.overlayEnabled,
          heatmap: state.heatmap ?? undefined,
        });
      } catch {

      }
    }

    port.onDisconnect.addListener(() => {
      if (state.contentPort === port) state.contentPort = null;
    });

    port.onMessage.addListener((msg: AgentMessage) => {
      switch (msg.type) {
        case "events":
          pushEvents(state, msg.events);
          break;
        case "stats":
          state.stats = msg;
          break;
        case "env":
          state.env = msg.react;
          break;
        case "profiler":
          state.profiler = msg;
          break;
        case "issues":
          state.issues = msg.issues;
          break;
        case "vitals":
          state.vitals = msg.vitals;
          break;
        case "redux":
          state.redux = msg.redux;
          break;
        case "memory":
          state.memory = msg.memory;
          break;
        default:
          return;
      }
      sendToPanel(state, msg);
      if (msg.type !== "events" && msg.type !== "stats") bridge.markDirty(tabId);
    });
    return;
  }

  if (port.name === PORT_PANEL) {
    if (!fromExtensionPage) {
      port.disconnect();
      return;
    }
    let boundTabId: number | undefined;

    port.onMessage.addListener((msg: PanelMessage) => {
      if (msg.type === "panel:hello") {

        if (boundTabId !== undefined && boundTabId !== msg.tabId) {
          const prev = tabs.get(boundTabId);
          if (prev && prev.panelPort === port) prev.panelPort = null;
        }
        boundTabId = msg.tabId;
        const state = getState(msg.tabId);
        state.panelPort = port;
        const history: HistoryMessage = {
          type: "history",
          events: state.events,
          stats: state.stats,
          env: state.env,
          profiler: state.profiler,
          issues: state.issues,
          vitals: state.vitals,
          redux: state.redux,
          memory: state.memory,
        };
        port.postMessage(history);
      } else if (msg.type === "panel:clear") {
        const state = getState(msg.tabId);
        state.events = [];
      } else if (msg.type === "panel:control") {
        const state = getState(msg.tabId);
        state.overlayEnabled = msg.overlay;
        if (msg.heatmap) state.heatmap = msg.heatmap;
        try {
          state.contentPort?.postMessage({
            type: "control",
            overlay: msg.overlay,
            heatmap: msg.heatmap,
          });
        } catch {
          state.contentPort = null;
        }
      } else if (msg.type === "panel:open-demo") {

        void chrome.tabs.create({ url: chrome.runtime.getURL("demo/index.html") });
      } else if (msg.type === "panel:dispatch") {
        const state = getState(msg.tabId);
        try {
          state.contentPort?.postMessage({ type: "dispatch", actionJson: msg.actionJson });
        } catch {
          state.contentPort = null;
        }
      }
    });

    port.onDisconnect.addListener(() => {
      if (boundTabId !== undefined) {
        const state = tabs.get(boundTabId);
        if (state && state.panelPort === port) state.panelPort = null;
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId);
  bridge.tabClosed(tabId);
});

function handleAiPort(port: chrome.runtime.Port): void {
  const inFlight = new Map<string, AbortController>();

  const send = (message: AiBackgroundMessage): void => {
    try {
      port.postMessage(message);
    } catch {

    }
  };

  port.onDisconnect.addListener(() => {
    for (const controller of inFlight.values()) controller.abort();
    inFlight.clear();
  });

  port.onMessage.addListener((msg: AiPanelMessage) => {
    void (async () => {
      if (msg.type === "ai:cancel") {
        inFlight.get(msg.requestId)?.abort();
        inFlight.delete(msg.requestId);
        return;
      }

      if (msg.type === "ai:test-key" || msg.type === "ai:list-models") {
        const settings = await loadSettings();
        const key = settings.keys[msg.provider];
        if (!key) {
          const message = "Nenhuma chave cadastrada para este provedor.";
          if (msg.type === "ai:test-key") {
            send({ type: "ai:key-test", provider: msg.provider, ok: false, message });
          } else {
            send({ type: "ai:models", provider: msg.provider, ok: false, models: [], message });
          }
          return;
        }
        try {
          const models = await listModels(msg.provider, key);
          if (msg.type === "ai:test-key") {
            send({
              type: "ai:key-test",
              provider: msg.provider,
              ok: true,
              message: `Chave válida — ${models.length} modelo(s) disponíveis.`,
            });
          } else {
            send({ type: "ai:models", provider: msg.provider, ok: true, models });
          }
        } catch (e) {
          const message = `Falha ao consultar o provedor: ${String(e instanceof Error ? e.message : e)}`;
          if (msg.type === "ai:test-key") {
            send({ type: "ai:key-test", provider: msg.provider, ok: false, message });
          } else {
            send({ type: "ai:models", provider: msg.provider, ok: false, models: [], message });
          }
        }
        return;
      }

      if (msg.type === "ai:start") {
        const settings = await loadSettings();
        const key = settings.keys[msg.provider];
        if (!key) {
          send({
            type: "ai:error",
            requestId: msg.requestId,
            message: "Nenhuma chave cadastrada para este provedor — configure na tab Configurações.",
          });
          return;
        }
        const controller = new AbortController();
        inFlight.set(msg.requestId, controller);
        try {
          await streamCompletion({
            provider: msg.provider,
            key,
            model: msg.model,
            system: msg.system,
            prompt: msg.prompt,
            signal: controller.signal,
            onChunk: (text) => send({ type: "ai:chunk", requestId: msg.requestId, text }),
          });
          send({ type: "ai:done", requestId: msg.requestId });
        } catch (e) {
          if (controller.signal.aborted) {
            send({ type: "ai:done", requestId: msg.requestId });
          } else {
            send({
              type: "ai:error",
              requestId: msg.requestId,
              message: String(e instanceof Error ? e.message : e).slice(0, 500),
            });
          }
        } finally {
          inFlight.delete(msg.requestId);
        }
      }
    })();
  });
}
