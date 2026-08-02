import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfilerComponentStat } from "../../shared/protocol";
import type { EventStore } from "../store";
import { useBudgets } from "../budgets";
import { BaselineSection } from "./Baseline";

export interface Health {
  score: number;
  level: "excelente" | "bom" | "atencao" | "critico";
  levelLabel: string;
  penalties: { label: string; points: number }[];
}

export function computeHealth(store: EventStore): Health {
  const summary = store.profiler;
  const totalRenders = summary?.totalRenders ?? 0;
  const unnecessary =
    summary?.components.reduce((acc, c) => acc + c.unnecessary, 0) ?? 0;
  const slow = summary?.slowRenders ?? 0;
  const errors = store.counts.error;

  const penalties: { label: string; points: number }[] = [];

  if (totalRenders > 0 && unnecessary > 0) {
    const ratio = unnecessary / totalRenders;
    const points = Math.min(40, Math.round(ratio * 80));
    penalties.push({
      label: `${unnecessary} renders desnecessários (${Math.round(ratio * 100)}% do total)`,
      points,
    });
  }
  if (errors > 0) {
    penalties.push({ label: `${errors} erro(s) capturado(s)`, points: Math.min(30, errors * 10) });
  }
  if (slow > 0) {
    penalties.push({ label: `${slow} render(s) lentos (>16ms)`, points: Math.min(20, slow * 2) });
  }
  if (store.issues.length > 0) {
    const points = Math.min(
      25,
      store.issues.reduce((acc, i) => acc + (i.severity === "error" ? 10 : 5), 0),
    );
    penalties.push({
      label: `${store.issues.length} problema(s) nos detectores (Efeitos/Diagnóstico)`,
      points,
    });
  }
  const cls = store.vitals?.cls ?? 0;
  if (cls >= 0.1) {
    penalties.push({
      label: `CLS ${cls.toFixed(3)} (${cls >= 0.25 ? "ruim" : "precisa melhorar"})`,
      points: cls >= 0.25 ? 20 : 10,
    });
  }
  const lcpMs = store.vitals?.lcp?.ms ?? 0;
  if (lcpMs >= 4000) {
    penalties.push({ label: `LCP ${(lcpMs / 1000).toFixed(1)}s (lento)`, points: 10 });
  }

  const score = Math.max(0, 100 - penalties.reduce((acc, p) => acc + p.points, 0));
  const level =
    score >= 90 ? "excelente" : score >= 70 ? "bom" : score >= 50 ? "atencao" : "critico";
  const levelLabel =
    level === "excelente"
      ? "Excelente"
      : level === "bom"
        ? "Bom"
        : level === "atencao"
          ? "Atenção"
          : "Crítico";

  return { score, level, levelLabel, penalties };
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function niceScaleMax(peak: number): number {
  const MIN_SCALE = 5;
  if (peak <= MIN_SCALE) return MIN_SCALE;
  const pow = 10 ** Math.floor(Math.log10(peak));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= peak) return m * pow;
  }
  return 10 * pow;
}

function Sparkline({ store }: { store: EventStore }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = 84;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const now = Date.now();
    const buckets = new Array<number>(60).fill(0);
    for (const e of store.events) {
      if (e.kind !== "render") continue;
      const age = Math.floor((now - e.ts) / 1000);
      if (age >= 0 && age < 60) buckets[59 - age]++;
    }

    const PAD_TOP = 16;
    const PAD_BOTTOM = 16;
    const PAD_LEFT = 30;
    const PAD_RIGHT = 6;
    const plotW = width - PAD_LEFT - PAD_RIGHT;
    const plotH = height - PAD_TOP - PAD_BOTTOM;
    const baseY = PAD_TOP + plotH;

    const peak = Math.max(...buckets);
    const scaleMax = niceScaleMax(peak);

    const gridColor = cssVar("--border") || "#35373c";
    const dimColor = cssVar("--text-dim") || "#9aa0a6";
    const barColor = cssVar("--c-render") || "#60a5fa";

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.fillStyle = dimColor;
    ctx.font = "9px Consolas, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const frac of [0, 0.5, 1]) {
      const y = Math.round(baseY - plotH * frac) + 0.5;
      ctx.globalAlpha = frac === 0 ? 1 : 0.45;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, y);
      ctx.lineTo(width - PAD_RIGHT, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const value = scaleMax * frac;
      ctx.fillText(Number.isInteger(value) ? String(value) : value.toFixed(1), PAD_LEFT - 4, y);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let s = 0; s <= 60; s += 15) {
      const x = Math.round(PAD_LEFT + (s / 60) * plotW) + 0.5;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY + 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const labelX = Math.min(Math.max(x, PAD_LEFT + 12), width - PAD_RIGHT - 16);
      ctx.fillText(s === 60 ? "agora" : `-${60 - s}s`, labelX, baseY + 5);
    }

    const barW = plotW / 60;
    ctx.fillStyle = barColor;
    buckets.forEach((v, i) => {
      if (v === 0) return;
      const h = Math.max(2, (v / scaleMax) * plotH);
      ctx.globalAlpha = i === 59 ? 0.45 : 1;
      ctx.fillRect(PAD_LEFT + i * barW + 0.5, baseY - h, Math.max(1, barW - 1), h);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = dimColor;
    ctx.font = "10px Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`pico: ${peak}/s · último segundo: ${buckets[58]}/s · escala: ${scaleMax}/s`, PAD_LEFT, 11);

    if (peak === 0) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("sem renders nos últimos 60s", PAD_LEFT + plotW / 2, PAD_TOP + plotH / 2);
    }
  });

  return <canvas ref={canvasRef} style={{ width: "100%", display: "block" }} />;
}

function fixSnippet(stat: ProfilerComponentStat): string {
  const props =
    stat.lastReason.startsWith("props:") && stat.lastReason.length > 7
      ? stat.lastReason.slice(7).split(",").map((s) => s.trim())
      : [];
  const fn = props[0] ?? "onAction";
  const obj = props[1] ?? "style";
  return [
    `// ${stat.name} re-renderiza porque o pai recria props a cada render.`,
    `// No componente PAI:`,
    ``,
    `const ${fn}Handler = useCallback(() => { /* ... */ }, []);`,
    `const ${obj}Memo = useMemo(() => ({ /* ... */ }), []);`,
    ``,
    `<${stat.name} ${fn}={${fn}Handler} ${obj}={${obj}Memo} />`,
    ``,
    `// E se ${stat.name} é puro, memoize-o na definição:`,
    `export default React.memo(${stat.name});`,
  ].join("\n");
}

function OffenderCard({ stat }: { stat: ProfilerComponentStat }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | undefined>(undefined);
  const snippet = fixSnippet(stat);

  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = snippet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="offender">
      <div className="offender-head" onClick={() => setOpen((o) => !o)}>
        <span className="mono offender-name">{stat.name}</span>
        <span className="offender-issue">
          {stat.unnecessary > 0
            ? `⚠ ${stat.unnecessary} renders desnecessários — ${stat.lastReason}`
            : `${stat.renders} renders — ${stat.lastReason}`}
        </span>
        <span className="ev-arrow">{open ? "▼" : "▶"}</span>
      </div>
      {open && (
        <div className="offender-fix">
          <div className="offender-fix-head">
            <strong>Fix sugerido</strong>
            <button className="btn-copy" onClick={copy}>
              {copied ? "✓ Copiado" : "Copiar"}
            </button>
          </div>
          <pre className="ev-payload">{snippet}</pre>
        </div>
      )}
    </div>
  );
}

export function Dashboard({ store }: { store: EventStore }) {
  const health = useMemo(() => computeHealth(store), [store]);
  const summary = store.profiler;
  const { violations } = useBudgets(store);

  const offenders = useMemo(
    () =>
      [...(summary?.components ?? [])]
        .sort((a, b) => b.unnecessary - a.unnecessary || b.renders - a.renders)
        .slice(0, 5),
    [summary],
  );

  const unnecessaryTotal =
    summary?.components.reduce((acc, c) => acc + c.unnecessary, 0) ?? 0;

  return (
    <div className="dashboard">
      <div className="health-row">
        <div className={`health-card health-${health.level}`}>
          <div className="health-score">{store.profiler ? health.score : "—"}</div>
          <div className="health-level">
            {store.profiler ? `React Health: ${health.levelLabel}` : "Aguardando dados"}
          </div>
        </div>
        <div className="health-penalties">
          {health.penalties.length === 0 ? (
            <p className="all-good">
              {store.profiler
                ? "✅ Nenhum problema detectado até agora. Interaja com a página para ampliar a análise."
                : "Interaja com a página inspecionada (ou recarregue-a) para calcular o Health Score."}
            </p>
          ) : (
            health.penalties.map((p) => (
              <div key={p.label} className="penalty">
                <span className="penalty-points">-{p.points}</span> {p.label}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className={`kpi-value ${store.counts.error > 0 ? "kpi-bad" : ""}`}>
            {store.counts.error}
          </div>
          <div className="kpi-label">Erros</div>
        </div>
        <div className="kpi">
          <div className={`kpi-value ${unnecessaryTotal > 0 ? "kpi-warn" : ""}`}>
            {unnecessaryTotal}
          </div>
          <div className="kpi-label">Renders desnecessários</div>
        </div>
        <div className="kpi">
          <div className={`kpi-value ${(summary?.slowRenders ?? 0) > 0 ? "kpi-bad" : ""}`}>
            {summary?.slowRenders ?? "—"}
          </div>
          <div className="kpi-label">Renders lentos</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">{summary?.totalComponents ?? "—"}</div>
          <div className="kpi-label">Componentes</div>
        </div>
      </div>

      {violations.length > 0 && (
        <div className="budget-violations">
          <strong>🎯 Perf budgets estourados</strong>
          {violations.map((v) => (
            <div key={`${v.component}:${v.detail}`} className="budget-violation">
              <span className="mono">{v.component}</span> — {v.detail}
            </div>
          ))}
        </div>
      )}

      <h3 className="section-title">Pressão de render (últimos 60s)</h3>
      <Sparkline store={store} />

      <h3 className="section-title">Principais infratores</h3>
      {offenders.length === 0 ? (
        <p className="all-good">Sem renders registrados ainda.</p>
      ) : (
        <div className="offenders">
          {offenders.map((stat) => (
            <OffenderCard key={stat.name} stat={stat} />
          ))}
        </div>
      )}

      <BaselineSection store={store} health={health} />
    </div>
  );
}
