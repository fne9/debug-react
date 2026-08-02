import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfilerComponentStat } from "../../shared/protocol";
import type { EventStore } from "../store";
import { PAGE_BUDGET, useBudgets, type UseBudgets } from "../budgets";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function BarChart({ items }: { items: { label: string; value: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const rowH = 22;
    const height = Math.max(1, items.length) * rowH + 4;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const max = Math.max(1, ...items.map((i) => i.value));
    const barColor = cssVar("--c-render") || "#60a5fa";
    const textColor = cssVar("--text") || "#e8eaed";
    const dimColor = cssVar("--text-dim") || "#9aa0a6";
    const labelW = Math.min(180, width * 0.35);

    ctx.font = "11px Consolas, monospace";
    ctx.textBaseline = "middle";

    items.forEach((item, i) => {
      const y = i * rowH + rowH / 2;
      ctx.fillStyle = textColor;
      ctx.fillText(
        item.label.length > 24 ? `${item.label.slice(0, 23)}…` : item.label,
        0,
        y,
        labelW - 8,
      );
      const barMax = width - labelW - 48;
      const w = Math.max(2, (item.value / max) * barMax);
      ctx.fillStyle = barColor;
      ctx.fillRect(labelW, y - 7, w, 14);
      ctx.fillStyle = dimColor;
      ctx.fillText(String(item.value), labelW + w + 6, y);
    });
  }, [items]);

  return <canvas ref={canvasRef} style={{ width: "100%", display: "block" }} />;
}

function BudgetBox({
  budgetsApi,
  componentNames,
}: {
  budgetsApi: UseBudgets;
  componentNames: string[];
}) {
  const { origin, budgets, violations, addBudget, removeBudget } = budgetsApi;
  const [component, setComponent] = useState("");
  const [maxRenders, setMaxRenders] = useState("");
  const [maxMs, setMaxMs] = useState("");
  const [maxCls, setMaxCls] = useState("");

  const pageBudget = budgets.find((b) => b.component === PAGE_BUDGET);
  const componentBudgets = budgets.filter((b) => b.component !== PAGE_BUDGET);

  const add = () => {
    const name = component.trim();
    const renders = Number(maxRenders);
    const ms = Number(maxMs);
    if (!name) return;
    if (!(renders > 0) && !(ms > 0)) return;
    addBudget({
      component: name,
      maxRendersPer10s: renders > 0 ? renders : undefined,
      maxAvgMs: ms > 0 ? ms : undefined,
    });
    setComponent("");
    setMaxRenders("");
    setMaxMs("");
  };

  const saveCls = () => {
    const cls = Number(maxCls);
    if (cls > 0) addBudget({ component: PAGE_BUDGET, maxCls: cls });
    else removeBudget(PAGE_BUDGET);
    setMaxCls("");
  };

  return (
    <details className="budget-box">
      <summary>
        🎯 Perf budgets{origin ? ` — ${origin}` : ""}
        {violations.length > 0 && <span className="tab-badge">{violations.length}</span>}
      </summary>

      {violations.length > 0 && (
        <div className="budget-violations">
          {violations.map((v) => (
            <div key={`${v.component}:${v.detail}`} className="budget-violation">
              <span className="mono">{v.component}</span> — {v.detail}
            </div>
          ))}
        </div>
      )}

      {componentBudgets.length > 0 && (
        <div className="budget-list">
          {componentBudgets.map((b) => (
            <div key={b.component} className="budget-row">
              <span className="mono">{b.component}</span>
              <span className="budget-limits">
                {b.maxRendersPer10s !== undefined && `≤ ${b.maxRendersPer10s} renders/10s`}
                {b.maxRendersPer10s !== undefined && b.maxAvgMs !== undefined && " · "}
                {b.maxAvgMs !== undefined && `≤ ${b.maxAvgMs}ms/render`}
              </span>
              <button
                className="btn-copy"
                title="Remover budget"
                onClick={() => removeBudget(b.component)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="budget-form">
        <input
          className="search"
          list="budget-components"
          placeholder="Componente"
          value={component}
          onChange={(e) => setComponent(e.target.value)}
        />
        <datalist id="budget-components">
          {componentNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <input
          className="search budget-num"
          type="number"
          min="1"
          placeholder="renders/10s"
          value={maxRenders}
          onChange={(e) => setMaxRenders(e.target.value)}
        />
        <input
          className="search budget-num"
          type="number"
          min="1"
          placeholder="ms/render"
          value={maxMs}
          onChange={(e) => setMaxMs(e.target.value)}
        />
        <button className="btn-copy" onClick={add}>
          + Adicionar
        </button>
      </div>

      <div className="budget-form">
        <span className="budget-cls-label">
          CLS máx. da página{pageBudget?.maxCls !== undefined ? ` (atual: ${pageBudget.maxCls})` : ""}:
        </span>
        <input
          className="search budget-num"
          type="number"
          min="0"
          step="0.01"
          placeholder="ex.: 0.1"
          value={maxCls}
          onChange={(e) => setMaxCls(e.target.value)}
        />
        <button className="btn-copy" onClick={saveCls}>
          {Number(maxCls) > 0 ? "Salvar" : pageBudget ? "Remover" : "Salvar"}
        </button>
      </div>
    </details>
  );
}

function vscodeUrl(source: string): string | null {
  const match = /^(.+):(\d+):(\d+)$/.exec(source);
  if (!match) return null;
  return `vscode://file/${match[1]}:${match[2]}:${match[3]}`;
}

function SourceLink({ source }: { source?: string }) {
  if (!source) return null;
  const url = vscodeUrl(source);
  if (!url) return null;
  const short = source.split(/[\\/]/).pop() ?? source;
  return (
    <a
      className="src-link"
      href={url}
      title={`Abrir no VS Code: ${source}`}
      onClick={(e) => e.stopPropagation()}
    >
      ↗ {short}
    </a>
  );
}

function reasonBadgeClass(reason: string): string {
  if (reason.startsWith("montagem")) return "badge-mount";
  if (reason.startsWith("props")) return "badge-props";
  if (reason.startsWith("estado")) return "badge-state";
  return "badge-parent";
}

export function Profiler({
  store,
  filter,
  onFilterChange,
}: {
  store: EventStore;
  filter: string;
  onFilterChange: (value: string) => void;
}) {
  const [sortBy, setSortBy] = useState<"renders" | "unnecessary" | "totalMs">("renders");
  const summary = store.profiler;
  const env = store.env;
  const budgetsApi = useBudgets(store);

  const rows = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const list = (summary?.components ?? []).filter(
      (c) => !query || c.name.toLowerCase().includes(query),
    );
    return [...list].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [summary, filter, sortBy]);

  const chartItems = useMemo(
    () =>
      (summary?.components ?? [])
        .slice(0, 10)
        .map((c) => ({ label: c.name, value: c.renders })),
    [summary],
  );

  const avgMs =
    summary && summary.totalRenders > 0
      ? summary.components.reduce((acc, c) => acc + c.totalMs, 0) / summary.totalRenders
      : null;

  return (
    <div className="profiler">
      <div className="timeline-head">
        <h2>Perfilador</h2>
        <input
          className="search"
          placeholder="Filtrar componente..."
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
        />
      </div>

      {env?.buildType === "production" && (
        <div className="banner-warn">
          Build de <strong>produção</strong> detectado — nomes de componentes podem estar
          minificados e o tempo de render pode não estar disponível. Rode o app em modo de
          desenvolvimento para dados completos.
        </div>
      )}
      {env === null && (
        <div className="banner-info">
          React ainda não detectado nesta página. Recarregue a página inspecionada com o
          painel aberto — ou{" "}
          <button className="link-btn" onClick={store.openDemo}>
            ▶ teste na demo embutida
          </button>
          .
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-value">{summary?.totalComponents ?? "—"}</div>
          <div className="kpi-label">Componentes</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">{summary?.totalRenders ?? "—"}</div>
          <div className="kpi-label">Renders totais</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">{avgMs !== null ? `${avgMs.toFixed(1)}ms` : "N/D"}</div>
          <div className="kpi-label">Tempo médio de render</div>
        </div>
        <div className="kpi">
          <div className={`kpi-value ${summary?.slowRenders ? "kpi-bad" : ""}`}>
            {summary?.slowRenders ?? "—"}
          </div>
          <div className="kpi-label">Renders lentos (&gt;16ms)</div>
        </div>
      </div>

      <BudgetBox
        budgetsApi={budgetsApi}
        componentNames={(summary?.components ?? []).map((c) => c.name)}
      />

      {chartItems.length > 0 && (
        <>
          <h3 className="section-title">Top componentes por renders</h3>
          <BarChart items={chartItems} />
        </>
      )}

      <h3 className="section-title">Ranking de componentes</h3>
      {rows.length === 0 ? (
        <div className="placeholder">
          <h2>Sem renders registrados</h2>
          <p>Interaja com a página (ex.: clique no contador da demo) para popular o ranking.</p>
        </div>
      ) : (
        <table className="rank-table">
          <thead>
            <tr>
              <th>Componente</th>
              <th className="sortable" onClick={() => setSortBy("renders")}>
                Renders {sortBy === "renders" ? "▾" : ""}
              </th>
              <th className="sortable" onClick={() => setSortBy("unnecessary")}>
                Desnecessários {sortBy === "unnecessary" ? "▾" : ""}
              </th>
              <th>Montagens</th>
              <th className="sortable" onClick={() => setSortBy("totalMs")}>
                Tempo total {sortBy === "totalMs" ? "▾" : ""}
              </th>
              <th>Último gatilho</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: ProfilerComponentStat) => (
              <tr key={c.name}>
                <td className="mono">
                  {c.name} <SourceLink source={c.source} />
                </td>
                <td>{c.renders}</td>
                <td className={c.unnecessary > 0 ? "cell-bad" : ""}>
                  {c.unnecessary > 0 ? `⚠ ${c.unnecessary}` : "0"}
                </td>
                <td>{c.mounts}</td>
                <td>{c.totalMs > 0 ? `${c.totalMs.toFixed(1)}ms` : "—"}</td>
                <td>
                  <span className={`reason-badge ${reasonBadgeClass(c.lastReason)}`}>
                    {c.lastReason}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
