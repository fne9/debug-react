import type { EventStore } from "./store";

export function exportSession(store: EventStore): void {
  const payload = {
    ferramenta: "React Debug",
    versao: "0.1.0",
    exportadoEm: new Date().toISOString(),
    pagina: store.pageOrigin,
    react: store.env,
    overhead: store.stats,
    timeline: store.events,
    perfilador: store.profiler,
    problemasDetectados: store.issues,
    webVitals: store.vitals,
    redux: store.redux,
    memoria: store.memory,
  };

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `react-debug-sessao-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
