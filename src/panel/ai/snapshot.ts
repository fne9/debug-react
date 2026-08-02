import type { EventStore } from "../store";
import { computeHealth } from "../components/Dashboard";
import { redactValue } from "./redact";

export function buildSnapshot(store: EventStore): unknown {
  const health = computeHealth(store);
  const profiler = store.profiler;

  const snapshot = {
    ferramenta: "React Debug (extensão DevTools)",
    geradoEm: new Date().toISOString(),
    react: store.env ?? { detected: false, buildType: "unknown" },
    overhead: store.stats
      ? {
          msPorFrame: Number(store.stats.overheadMsPerFrame.toFixed(3)),
          eventosPorSegundo: Math.round(store.stats.eventsPerSecond),
        }
      : null,
    healthScore: {
      score: health.score,
      nivel: health.levelLabel,
      penalidades: health.penalties,
    },
    perfilador: profiler
      ? {
          totalComponentes: profiler.totalComponents,
          totalRenders: profiler.totalRenders,
          rendersLentos: profiler.slowRenders,
          topComponentes: profiler.components.slice(0, 15).map((c) => ({
            nome: c.name,
            renders: c.renders,
            mounts: c.mounts,
            desnecessarios: c.unnecessary,
            tempoTotalMs: Number(c.totalMs.toFixed(1)),
            ultimaRazao: c.lastReason,
          })),
        }
      : null,
    problemasDetectados: store.issues.map((i) => ({
      detector: i.detector,
      severidade: i.severity,
      componente: i.component,
      titulo: i.title,
      detalhe: i.detail,
      evidencia: i.evidence,
      ocorrencias: i.count,
    })),
    webVitals: store.vitals
      ? {
          cls: store.vitals.cls,
          shifts: store.vitals.shifts.slice(-10),
          lcp: store.vitals.lcp,
          inp: store.vitals.inp,
          fcpMs: store.vitals.fcpMs,
          ttfbMs: store.vitals.ttfbMs,
          loadMs: store.vitals.loadMs,
        }
      : null,
    redux: store.redux?.detected
      ? {
          stores: store.redux.storeCount,
          ultimasActions: store.redux.actions.slice(-20).map((a) => ({
            type: a.type,
            chavesAlteradas: a.changedKeys,
          })),
          estadoAtual: store.redux.state,
        }
      : null,
    memoria: store.memory?.supported
      ? {
          usadaMB: store.memory.usedMB,
          totalMB: store.memory.totalMB,
          limiteMB: store.memory.limitMB,
          picoMB: store.memory.peakMB,
          crescimentoKBs: store.memory.growthKBs,
          crescimentoSuspeito: store.memory.suspicious,
        }
      : null,
    errosRecentes: store.events
      .filter((e) => e.kind === "error")
      .slice(-10)
      .map((e) => ({ mensagem: e.label, detalhe: e.detail })),
  };

  return redactValue(snapshot);
}
