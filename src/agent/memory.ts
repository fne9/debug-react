import {
  AGENT_SOURCE,
  type AgentMemoryMessage,
  type EventKind,
  type MemorySample,
  type MemorySummary,
} from "../shared/protocol";

export interface MemoryIO {
  emit: (kind: EventKind, label: string, opts?: { detail?: string; payload?: unknown }) => void;
  track: <T>(fn: () => T) => T;
  send: (msg: AgentMemoryMessage) => void;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

const SAMPLE_INTERVAL_MS = 2000;
const MAX_SAMPLES = 90;
const GROWTH_WINDOW_MS = 60_000;
const SUSPICIOUS_KBS = 100;

const MB = 1024 * 1024;

export function initMemory(io: MemoryIO): { refresh: () => void } {
  const perf = performance as Performance & { memory?: PerformanceMemory };
  const supported = !!perf.memory;

  const samples: MemorySample[] = [];
  let peakMB = 0;
  let suspicious = false;
  let dirty = supported;

  function computeGrowthKBs(): number {
    if (samples.length < 2) return 0;
    const now = samples[samples.length - 1];
    let first = samples[0];
    for (const s of samples) {
      if (now.ts - s.ts <= GROWTH_WINDOW_MS) {
        first = s;
        break;
      }
    }
    const elapsedS = (now.ts - first.ts) / 1000;
    if (elapsedS < 20) return 0;
    return ((now.usedMB - first.usedMB) * 1024) / elapsedS;
  }

  setInterval(() => {
    io.track(() => {
      if (!supported) return;
      const m = perf.memory!;
      const sample: MemorySample = {
        ts: Date.now(),
        usedMB: Number((m.usedJSHeapSize / MB).toFixed(1)),
        totalMB: Number((m.totalJSHeapSize / MB).toFixed(1)),
      };
      samples.push(sample);
      if (samples.length > MAX_SAMPLES) samples.shift();
      if (sample.usedMB > peakMB) peakMB = sample.usedMB;

      const growthKBs = computeGrowthKBs();
      const nowSuspicious = growthKBs > SUSPICIOUS_KBS;
      if (nowSuspicious && !suspicious) {
        io.emit("memory", "Crescimento de memória suspeito", {
          detail: `+${growthKBs.toFixed(0)} KB/s sustentados por ~60s — pode ser vazamento (ou GC ainda não rodou)`,
          payload: { taxaKBs: Number(growthKBs.toFixed(1)), usadoMB: sample.usedMB },
        });
      }
      suspicious = nowSuspicious;
      dirty = true;
    });
  }, SAMPLE_INTERVAL_MS);

  setInterval(() => {
    if (!dirty) return;
    dirty = false;
    io.track(() => {
      const last = samples[samples.length - 1];
      const summary: MemorySummary = {
        supported,
        samples: [...samples],
        usedMB: last?.usedMB ?? 0,
        totalMB: last?.totalMB ?? 0,
        limitMB: supported ? Number((perf.memory!.jsHeapSizeLimit / MB).toFixed(0)) : 0,
        peakMB,
        growthKBs: Number(computeGrowthKBs().toFixed(1)),
        suspicious,
      };
      io.send({ source: AGENT_SOURCE, type: "memory", ts: Date.now(), memory: summary });
    });
  }, SAMPLE_INTERVAL_MS);

  return {
    refresh() {
      dirty = true;
    },
  };
}
