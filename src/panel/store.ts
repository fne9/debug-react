import { useEffect, useMemo, useRef, useState } from "react";
import {
  PORT_PANEL,
  type AgentProfilerMessage,
  type BackgroundMessage,
  type DebugEvent,
  type DetectedIssue,
  type EventKind,
  type HeatmapControl,
  type MemorySummary,
  type PanelMessage,
  type ReactEnvInfo,
  type ReduxSummary,
  type VitalsSummary,
} from "../shared/protocol";

export const MAX_EVENTS = 2000;

export interface PanelStats {
  overheadMsPerFrame: number;
  eventsPerSecond: number;
}

export interface EventStore {
  events: DebugEvent[];
  counts: Record<EventKind, number>;
  agentConnected: boolean;
  stats: PanelStats | null;
  env: ReactEnvInfo | null;
  profiler: AgentProfilerMessage | null;
  issues: DetectedIssue[];
  vitals: VitalsSummary | null;
  redux: ReduxSummary | null;
  memory: MemorySummary | null;
  pageOrigin: string;
  recording: boolean;
  setRecording: (on: boolean) => void;
  overlayEnabled: boolean;
  setOverlay: (on: boolean) => void;
  heatmap: HeatmapControl;
  setHeatmap: (cfg: HeatmapControl) => void;
  dispatchAction: (actionJson: string) => void;
  openDemo: () => void;
  clear: () => void;
}

const EMPTY_COUNTS: Record<EventKind, number> = {
  render: 0,
  state: 0,
  effect: 0,
  error: 0,
  memory: 0,
  context: 0,
  vital: 0,
  system: 0,
};

export function useEventStore(): EventStore {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [agentConnected, setAgentConnected] = useState(false);
  const [stats, setStats] = useState<PanelStats | null>(null);
  const [env, setEnv] = useState<ReactEnvInfo | null>(null);
  const [profiler, setProfiler] = useState<AgentProfilerMessage | null>(null);
  const [issues, setIssues] = useState<DetectedIssue[]>([]);
  const [vitals, setVitals] = useState<VitalsSummary | null>(null);
  const [redux, setRedux] = useState<ReduxSummary | null>(null);
  const [memory, setMemory] = useState<MemorySummary | null>(null);
  const [pageOrigin, setPageOrigin] = useState("");
  const [recording, setRecording] = useState(true);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [heatmap, setHeatmapState] = useState<HeatmapControl>({
    enabled: false,
    offsetSec: 0,
    windowSec: 5,
  });

  useEffect(() => {
    const readOrigin = () => {
      chrome.devtools.inspectedWindow.eval("location.origin", (result) => {
        if (typeof result === "string") setPageOrigin(result);
      });
    };
    readOrigin();
    const onNavigated = () => readOrigin();
    chrome.devtools.network.onNavigated.addListener(onNavigated);
    return () => chrome.devtools.network.onNavigated.removeListener(onNavigated);
  }, []);

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const overlayRef = useRef(overlayEnabled);
  overlayRef.current = overlayEnabled;
  const heatmapRef = useRef(heatmap);
  heatmapRef.current = heatmap;

  const post = (msg: PanelMessage) => {
    const port = portRef.current;
    if (!port) return;
    try {
      port.postMessage(msg);
    } catch {
      if (portRef.current === port) portRef.current = null;
    }
  };

  useEffect(() => {
    let disposed = false;
    let retryTimer: number | undefined;
    let retryDelayMs = 300;

    const handleMessage = (msg: BackgroundMessage) => {
      if (msg.type === "history") {

        setEvents((prev) =>
          msg.events.length > 0 ? msg.events.slice(-MAX_EVENTS) : prev,
        );
        if (msg.events.length > 0) setAgentConnected(true);
        if (msg.stats) {
          setStats({
            overheadMsPerFrame: msg.stats.overheadMsPerFrame,
            eventsPerSecond: msg.stats.eventsPerSecond,
          });
        }
        if (msg.env) setEnv(msg.env);
        if (msg.profiler) setProfiler(msg.profiler);
        setIssues(msg.issues);
        if (msg.vitals) setVitals(msg.vitals);
        if (msg.redux) setRedux(msg.redux);
        if (msg.memory) setMemory(msg.memory);
        return;
      }
      if (msg.type === "redux") {
        setAgentConnected(true);
        setRedux(msg.redux);
        return;
      }
      if (msg.type === "memory") {
        setAgentConnected(true);
        setMemory(msg.memory);
        return;
      }
      if (msg.type === "issues") {
        setAgentConnected(true);
        setIssues(msg.issues);
        return;
      }
      if (msg.type === "vitals") {
        setAgentConnected(true);
        setVitals(msg.vitals);
        return;
      }
      if (msg.type === "env") {
        setAgentConnected(true);
        setEnv(msg.react);
        return;
      }
      if (msg.type === "profiler") {
        setAgentConnected(true);
        setProfiler(msg);
        return;
      }
      if (msg.type === "events") {
        setAgentConnected(true);
        if (!recordingRef.current) return;
        setEvents((prev) => {
          const next = prev.concat(msg.events);
          return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
        });
        return;
      }
      if (msg.type === "stats") {
        setAgentConnected(true);
        setStats({
          overheadMsPerFrame: msg.overheadMsPerFrame,
          eventsPerSecond: msg.eventsPerSecond,
        });
      }
    };

    const connect = () => {
      if (disposed) return;
      const port = chrome.runtime.connect({ name: PORT_PANEL });
      portRef.current = port;

      port.onMessage.addListener((msg: BackgroundMessage) => {
        retryDelayMs = 300;
        handleMessage(msg);
      });

      port.onDisconnect.addListener(() => {
        if (portRef.current === port) portRef.current = null;
        if (disposed) return;
        setAgentConnected(false);
        retryTimer = window.setTimeout(connect, retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, 5000);
      });

      try {
        const hello: PanelMessage = {
          type: "panel:hello",
          tabId: chrome.devtools.inspectedWindow.tabId,
        };
        port.postMessage(hello);

        if (overlayRef.current || heatmapRef.current.enabled) {
          port.postMessage({
            type: "panel:control",
            tabId: chrome.devtools.inspectedWindow.tabId,
            overlay: overlayRef.current,
            heatmap: heatmapRef.current,
          } satisfies PanelMessage);
        }
      } catch {

      }
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<EventKind, number> = { ...EMPTY_COUNTS };
    for (const e of events) c[e.kind]++;
    return c;
  }, [events]);

  const clear = () => {
    setEvents([]);
    post({
      type: "panel:clear",
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
  };

  const dispatchAction = (actionJson: string) => {
    post({
      type: "panel:dispatch",
      tabId: chrome.devtools.inspectedWindow.tabId,
      actionJson,
    });
  };

  const setOverlay = (on: boolean) => {
    setOverlayEnabled(on);
    post({
      type: "panel:control",
      tabId: chrome.devtools.inspectedWindow.tabId,
      overlay: on,
    });
  };

  const setHeatmap = (cfg: HeatmapControl) => {
    setHeatmapState(cfg);
    post({
      type: "panel:control",
      tabId: chrome.devtools.inspectedWindow.tabId,
      overlay: overlayRef.current,
      heatmap: cfg,
    });
  };

  const openDemo = () => {
    post({ type: "panel:open-demo" });
  };

  return {
    events,
    counts,
    agentConnected,
    stats,
    env,
    profiler,
    issues,
    vitals,
    redux,
    memory,
    pageOrigin,
    recording,
    setRecording,
    overlayEnabled,
    setOverlay,
    heatmap,
    setHeatmap,
    dispatchAction,
    openDemo,
    clear,
  };
}
