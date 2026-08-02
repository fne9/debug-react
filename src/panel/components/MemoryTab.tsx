import { useEffect, useRef } from "react";
import type { EventStore } from "../store";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function MemoryChart({ store }: { store: EventStore }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samples = store.memory?.samples ?? [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = 120;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    if (samples.length < 2) return;

    const max = Math.max(...samples.map((s) => s.totalMB), 1) * 1.1;
    const x = (i: number) => (i / (samples.length - 1)) * (width - 40) + 4;
    const y = (v: number) => height - 14 - (v / max) * (height - 24);

    ctx.strokeStyle = cssVar("--text-dim") || "#9aa0a6";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    samples.forEach((s, i) => (i === 0 ? ctx.moveTo(x(i), y(s.totalMB)) : ctx.lineTo(x(i), y(s.totalMB))));
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = cssVar("--c-render") || "#60a5fa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((s, i) => (i === 0 ? ctx.moveTo(x(i), y(s.usedMB)) : ctx.lineTo(x(i), y(s.usedMB))));
    ctx.stroke();

    ctx.fillStyle = cssVar("--text-dim") || "#9aa0a6";
    ctx.font = "10px Consolas, monospace";
    ctx.fillText(`${max.toFixed(0)} MB`, width - 44, 10);
    ctx.fillText("0", width - 14, height - 4);
  }, [samples]);

  return <canvas ref={canvasRef} style={{ width: "100%", display: "block" }} />;
}

export function MemoryTab({ store }: { store: EventStore }) {
  const m = store.memory;

  if (!m || !m.supported) {
    return (
      <div className="placeholder">
        <h2>Memória indisponível</h2>
        <p>
          A leitura de heap usa <span className="mono">performance.memory</span>, disponível em
          navegadores Chromium (Chrome, Brave, Edge). {m ? "Este navegador não expõe a API." : "Aguardando dados do agent…"}
        </p>
      </div>
    );
  }

  const usagePct = m.limitMB > 0 ? (m.usedMB / m.limitMB) * 100 : 0;

  return (
    <div className="memory-tab">
      <div className="timeline-head">
        <h2>Memória</h2>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-value vital-good">{m.usedMB.toFixed(1)} MB</div>
          <div className="kpi-label">Heap usado</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">{m.totalMB.toFixed(1)} MB</div>
          <div className="kpi-label">Heap total</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">
            {m.limitMB >= 1024 ? `${(m.limitMB / 1024).toFixed(1)} GB` : `${m.limitMB} MB`}
          </div>
          <div className="kpi-label">Limite do heap</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">{m.peakMB.toFixed(1)} MB</div>
          <div className="kpi-label">Pico de uso</div>
        </div>
      </div>

      <h3 className="section-title">Uso do heap ({usagePct.toFixed(1)}%)</h3>
      <div className="heap-bar">
        <div
          className={`heap-bar-fill ${usagePct >= 90 ? "heap-bad" : usagePct >= 70 ? "heap-warn" : ""}`}
          style={{ width: `${Math.min(100, usagePct)}%` }}
        />
        <span className="heap-mark" style={{ left: "70%" }}>
          70%
        </span>
        <span className="heap-mark heap-mark-bad" style={{ left: "90%" }}>
          90%
        </span>
      </div>

      <h3 className="section-title">Taxa de crescimento</h3>
      <div className={`growth-card ${m.suspicious ? "growth-suspicious" : ""}`}>
        <div className="growth-value">
          {m.growthKBs >= 0 ? "+" : ""}
          {m.growthKBs.toFixed(1)} KB/s
        </div>
        <div className="growth-label">
          {m.suspicious
            ? "⚠ Crescimento suspeito sustentado (~60s) — pode ser vazamento, ou o GC ainda não rodou. Interaja menos e observe se a curva desce."
            : "Normal"}
        </div>
      </div>

      <h3 className="section-title">Linha do tempo da memória (últimos ~3 min)</h3>
      <MemoryChart store={store} />
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-swatch legend-used" /> Heap usado
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-total" /> Heap total
        </span>
      </div>

      <div className="banner-info">
        💡 Dicas: arrays/objetos grandes retidos em estado crescem o heap; listeners não
        removidos no unmount seguram componentes inteiros na memória (veja o useEffect Auditor);
        closures em intervals vazados retêm tudo que capturam.
      </div>
    </div>
  );
}
