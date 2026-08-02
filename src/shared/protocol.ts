export const PROTOCOL_VERSION = 8;

export const AGENT_SOURCE = "react-debug-agent";
export const CONTENT_SOURCE = "react-debug-content";

export const PORT_CONTENT = "react-debug:content";
export const PORT_PANEL = "react-debug:panel";
export const PORT_AI = "react-debug:ai";

export type EventKind =
  | "render"
  | "state"
  | "effect"
  | "error"
  | "memory"
  | "context"
  | "vital"
  | "system";

export interface DebugEvent {
  id: string;
  kind: EventKind;
  ts: number;
  label: string;
  detail?: string;
  payload?: unknown;
}

export interface AgentHelloMessage {
  source: typeof AGENT_SOURCE;
  type: "hello";
  protocolVersion: number;
}

export interface AgentEventsMessage {
  source: typeof AGENT_SOURCE;
  type: "events";
  events: DebugEvent[];
}

export interface AgentStatsMessage {
  source: typeof AGENT_SOURCE;
  type: "stats";
  ts: number;
  overheadMsPerFrame: number;
  eventsPerSecond: number;
}

export interface ReactEnvInfo {
  detected: boolean;
  version?: string;
  buildType: "development" | "production" | "unknown";
}

export interface AgentEnvMessage {
  source: typeof AGENT_SOURCE;
  type: "env";
  ts: number;
  react: ReactEnvInfo;
}

export interface ProfilerComponentStat {
  name: string;
  renders: number;
  mounts: number;
  unnecessary: number;
  totalMs: number;
  lastReason: string;

  source?: string;
}

export interface AgentProfilerMessage {
  source: typeof AGENT_SOURCE;
  type: "profiler";
  ts: number;
  totalComponents: number;
  totalRenders: number;
  slowRenders: number;
  components: ProfilerComponentStat[];
}

export type DetectorId =
  | "effect-no-cleanup"
  | "effect-no-deps"
  | "effect-unstable-deps"
  | "effect-fetch-no-abort"
  | "effect-loop"
  | "key-index"
  | "context-cascade"
  | "suspense-cascade"
  | "hydration-mismatch"
  | "inline-handler";

export interface DetectedIssue {
  id: string;
  detector: DetectorId;
  severity: "error" | "warn";
  component: string;
  title: string;
  detail: string;
  evidence?: string;
  fix: string;
  count: number;
  firstTs: number;
  lastTs: number;
}

export interface AgentIssuesMessage {
  source: typeof AGENT_SOURCE;
  type: "issues";
  ts: number;
  issues: DetectedIssue[];
}

export interface ShiftRecord {
  ts: number;
  value: number;
  element: string;
  component: string | null;
}

export interface VitalsSummary {
  cls: number;
  shifts: ShiftRecord[];
  lcp: { ms: number; element: string; component: string | null } | null;
  inp: {
    worstMs: number;
    eventName: string;
    component: string | null;
    slowCount: number;
  } | null;
  fcpMs: number | null;
  ttfbMs: number | null;
  loadMs: number | null;
}

export interface AgentVitalsMessage {
  source: typeof AGENT_SOURCE;
  type: "vitals";
  ts: number;
  vitals: VitalsSummary;
}

export interface HeatmapControl {
  enabled: boolean;

  offsetSec: number;

  windowSec: number;
}

export interface ReduxActionRecord {
  id: number;
  ts: number;
  type: string;
  action: unknown;
  changedKeys: string[];
}

export interface OtherStoreRecord {
  lib: "zustand" | "jotai" | "tanstack-query" | "devtools";
  name: string;
  state: unknown;
  lastActionType?: string;
  updatedAt: number;
}

export interface ReduxSummary {
  detected: boolean;
  storeCount: number;
  actions: ReduxActionRecord[];
  state: unknown;
  others?: OtherStoreRecord[];
}

export interface AgentReduxMessage {
  source: typeof AGENT_SOURCE;
  type: "redux";
  ts: number;
  redux: ReduxSummary;
}

export interface MemorySample {
  ts: number;
  usedMB: number;
  totalMB: number;
}

export interface MemorySummary {
  supported: boolean;
  samples: MemorySample[];
  usedMB: number;
  totalMB: number;
  limitMB: number;
  peakMB: number;
  growthKBs: number;
  suspicious: boolean;
}

export interface AgentMemoryMessage {
  source: typeof AGENT_SOURCE;
  type: "memory";
  ts: number;
  memory: MemorySummary;
}

export type AgentMessage =
  | AgentHelloMessage
  | AgentEventsMessage
  | AgentStatsMessage
  | AgentEnvMessage
  | AgentProfilerMessage
  | AgentIssuesMessage
  | AgentVitalsMessage
  | AgentReduxMessage
  | AgentMemoryMessage;

export interface ContentReadyMessage {
  source: typeof CONTENT_SOURCE;
  type: "content-ready";
}

export interface ContentControlMessage {
  source: typeof CONTENT_SOURCE;
  type: "control";
  overlay: boolean;
  heatmap?: HeatmapControl;
}

export interface ContentDispatchMessage {
  source: typeof CONTENT_SOURCE;
  type: "dispatch";
  actionJson: string;
}

export type ContentMessage = ContentReadyMessage | ContentControlMessage | ContentDispatchMessage;

export type BackgroundToContentMessage =
  | { type: "control"; overlay: boolean; heatmap?: HeatmapControl }
  | { type: "dispatch"; actionJson: string };

export type PanelMessage =
  | { type: "panel:hello"; tabId: number }
  | { type: "panel:clear"; tabId: number }
  | { type: "panel:control"; tabId: number; overlay: boolean; heatmap?: HeatmapControl }
  | { type: "panel:dispatch"; tabId: number; actionJson: string }
  | { type: "panel:open-demo" };

export interface HistoryMessage {
  type: "history";
  events: DebugEvent[];
  stats: AgentStatsMessage | null;
  env: ReactEnvInfo | null;
  profiler: AgentProfilerMessage | null;
  issues: DetectedIssue[];
  vitals: VitalsSummary | null;
  redux: ReduxSummary | null;
  memory: MemorySummary | null;
}

export type BackgroundMessage =
  | HistoryMessage
  | AgentEventsMessage
  | AgentStatsMessage
  | AgentEnvMessage
  | AgentProfilerMessage
  | AgentIssuesMessage
  | AgentVitalsMessage
  | AgentReduxMessage
  | AgentMemoryMessage;

export type AiProvider = "anthropic" | "google" | "openai";

export type AnalysisKind = "performance" | "failure" | "security";

export type AiPanelMessage =
  | {
      type: "ai:start";
      requestId: string;
      provider: AiProvider;
      model: string;
      system: string;
      prompt: string;
    }
  | { type: "ai:cancel"; requestId: string }
  | { type: "ai:test-key"; provider: AiProvider }
  | { type: "ai:list-models"; provider: AiProvider };

export type AiBackgroundMessage =
  | { type: "ai:chunk"; requestId: string; text: string }
  | { type: "ai:done"; requestId: string }
  | { type: "ai:error"; requestId: string; message: string }
  | { type: "ai:key-test"; provider: AiProvider; ok: boolean; message: string }
  | {
      type: "ai:models";
      provider: AiProvider;
      ok: boolean;
      models: string[];
      message?: string;
    };
