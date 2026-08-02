import {
  AGENT_SOURCE,
  type AgentVitalsMessage,
  type EventKind,
  type ShiftRecord,
  type VitalsSummary,
} from "../shared/protocol";
import { getFiberName, isComponentFiber, type FiberLike } from "./react-adapter/fiber";
import { flash, isOverlayEnabled } from "./overlay";

export interface VitalsIO {
  emit: (kind: EventKind, label: string, opts?: { detail?: string; payload?: unknown }) => void;
  track: <T>(fn: () => T) => T;
  send: (msg: AgentVitalsMessage) => void;
}

const MAX_SHIFTS = 50;
const SLOW_INTERACTION_MS = 200;
const MIN_SHIFT_VALUE = 0.001;
const COLOR_SHIFT = "#ef4444";

function fiberFromNode(node: Element): FiberLike | null {
  for (const key of Object.keys(node)) {
    if (key.startsWith("__reactFiber$")) {
      return (node as unknown as Record<string, FiberLike | null>)[key];
    }
  }
  return null;
}

export function domToComponent(node: unknown): string | null {
  let el: Element | null =
    node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  let hops = 0;
  while (el && hops++ < 6) {
    let fiber = fiberFromNode(el);
    let depth = 0;
    while (fiber && depth++ < 50) {
      if (isComponentFiber(fiber)) return getFiberName(fiber);
      fiber = fiber.return;
    }
    el = el.parentElement;
  }
  return null;
}

function describeElement(node: unknown): string {
  if (!(node instanceof Element)) {
    return node instanceof Node ? `#${node.nodeName.toLowerCase()}` : "?";
  }
  const tag = node.tagName.toLowerCase();
  if (node.id) return `<${tag}#${node.id}>`;
  const cls = typeof node.className === "string" ? node.className.split(/\s+/)[0] : "";
  return cls ? `<${tag}.${cls}>` : `<${tag}>`;
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
  sources?: { node?: Node | null }[];
}

interface LcpEntry extends PerformanceEntry {
  element?: Element | null;
}

interface EventTimingEntry extends PerformanceEntry {
  interactionId?: number;
  target?: Node | null;
  processingStart: number;
}

export function initVitals(io: VitalsIO): { refresh: () => void } {
  const summary: VitalsSummary = {
    cls: 0,
    shifts: [],
    lcp: null,
    inp: null,
    fcpMs: null,
    ttfbMs: null,
    loadMs: null,
  };
  let dirty = false;

  let windowValue = 0;
  let windowStart = 0;
  let lastShiftTime = 0;

  function onLayoutShift(entry: LayoutShiftEntry): void {
    if (entry.hadRecentInput || entry.value < MIN_SHIFT_VALUE) return;

    if (
      windowValue > 0 &&
      (entry.startTime - lastShiftTime > 1000 || entry.startTime - windowStart > 5000)
    ) {
      windowValue = 0;
    }
    if (windowValue === 0) windowStart = entry.startTime;
    windowValue += entry.value;
    lastShiftTime = entry.startTime;
    if (windowValue > summary.cls) summary.cls = Number(windowValue.toFixed(4));

    const firstNode = entry.sources?.find((s) => s.node)?.node ?? null;
    const element = firstNode ? describeElement(firstNode) : "?";
    const component = firstNode ? domToComponent(firstNode) : null;

    const record: ShiftRecord = {
      ts: Date.now(),
      value: Number(entry.value.toFixed(4)),
      element,
      component,
    };
    summary.shifts.push(record);
    if (summary.shifts.length > MAX_SHIFTS) summary.shifts.shift();

    io.emit("vital", `CLS +${record.value}`, {
      detail: `${element}${component ? ` em ${component}` : ""} se moveu — acumulado: ${summary.cls}`,
      payload: { tipo: "layout-shift", valor: record.value, acumulado: summary.cls, elemento: element, componente: component },
    });

    if (isOverlayEnabled() && firstNode instanceof Element) {
      flash(firstNode, { name: `CLS ${element}`, color: COLOR_SHIFT });
    }
    dirty = true;
  }

  function observe(type: string, cb: (entries: PerformanceEntry[]) => void, extra?: object): void {
    try {
      const obs = new PerformanceObserver((list) => {
        io.track(() => cb(list.getEntries()));
      });
      obs.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    } catch {

    }
  }

  observe("layout-shift", (entries) => {
    for (const e of entries) onLayoutShift(e as LayoutShiftEntry);
  });

  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1] as LcpEntry | undefined;
    if (!last) return;
    summary.lcp = {
      ms: Math.round(last.startTime),
      element: last.element ? describeElement(last.element) : "?",
      component: last.element ? domToComponent(last.element) : null,
    };
    dirty = true;
  });

  observe(
    "event",
    (entries) => {
      for (const raw of entries) {
        const e = raw as EventTimingEntry;
        if (!e.interactionId) continue;
        const duration = Math.round(e.duration);
        const component = e.target ? domToComponent(e.target) : null;

        if (!summary.inp || duration > summary.inp.worstMs) {
          summary.inp = {
            worstMs: duration,
            eventName: e.name,
            component,
            slowCount: summary.inp?.slowCount ?? 0,
          };
          dirty = true;
        }

        if (duration >= SLOW_INTERACTION_MS) {
          summary.inp!.slowCount++;
          dirty = true;
          io.emit("vital", `Interação lenta: ${e.name} ${duration}ms`, {
            detail: `${e.target ? describeElement(e.target) : "?"}${component ? ` em ${component}` : ""}`,
            payload: {
              tipo: "interacao",
              evento: e.name,
              duracaoMs: duration,
              componente: component,
            },
          });
        }
      }
    },
    { durationThreshold: 40 },
  );

  observe("paint", (entries) => {
    for (const e of entries) {
      if (e.name === "first-contentful-paint") {
        summary.fcpMs = Math.round(e.startTime);
        dirty = true;
      }
    }
  });

  function readNavTiming(): void {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (!nav) return;
    if (summary.ttfbMs === null && nav.responseStart > 0) {
      summary.ttfbMs = Math.round(nav.responseStart);
      dirty = true;
    }
    if (summary.loadMs === null && nav.loadEventEnd > 0) {
      summary.loadMs = Math.round(nav.loadEventEnd);
      dirty = true;
    }
  }

  setInterval(() => {
    io.track(() => {
      readNavTiming();
      if (!dirty) return;
      dirty = false;
      io.send({ source: AGENT_SOURCE, type: "vitals", ts: Date.now(), vitals: summary });
    });
  }, 1000);

  return {
    refresh() {
      dirty = true;
    },
  };
}
