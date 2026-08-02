import { useEffect, useState } from "react";
import type { EventStore } from "../store";
import type { Health } from "./Dashboard";
import {
  captureBaseline,
  clearBaseline,
  loadBaseline,
  saveBaseline,
  type BaselineData,
} from "../baseline";

function Delta({
  before,
  after,
  lowerIsBetter,
  format,
}: {
  before: number;
  after: number;
  lowerIsBetter: boolean;
  format?: (v: number) => string;
}) {
  const fmt = format ?? ((v: number) => String(v));
  const improved = lowerIsBetter ? after < before : after > before;
  const changed = fmt(after) !== fmt(before);
  return (
    <span>
      {fmt(before)} → {fmt(after)}{" "}
      {changed && (
        <span className={improved ? "delta-good" : "delta-bad"}>
          {improved ? "▼" : "▲"}
        </span>
      )}
    </span>
  );
}

export function BaselineSection({ store, health }: { store: EventStore; health: Health }) {
  const origin = store.pageOrigin;
  const [baseline, setBaseline] = useState<BaselineData | null>(null);

  useEffect(() => {
    if (!origin) return;
    void loadBaseline(origin).then(setBaseline);
  }, [origin]);

  const record = () => {
    const data = captureBaseline(store, health.score);
    setBaseline(data);
    if (origin) void saveBaseline(origin, data);
  };

  const remove = () => {
    setBaseline(null);
    if (origin) void clearBaseline(origin);
  };

  const currentByName = new Map(
    (store.profiler?.components ?? []).map((c) => [
      c.name,
      {
        renders: c.renders,
        unnecessary: c.unnecessary,
        avgMs: c.renders > 0 ? c.totalMs / c.renders : 0,
      },
    ]),
  );

  const rows = baseline
    ? Object.entries(baseline.components)
        .sort((a, b) => b[1].renders - a[1].renders)
        .slice(0, 8)
    : [];

  return (
    <div className="baseline">
      <h3 className="section-title">
        Antes / Depois
        <span className="baseline-actions">
          <button className="btn-copy" onClick={record}>
            {baseline ? "↻ Regravar baseline" : "● Gravar baseline"}
          </button>
          {baseline && (
            <button className="btn-copy" onClick={remove}>
              ✕ Remover
            </button>
          )}
        </span>
      </h3>

      {!baseline ? (
        <p className="settings-note">
          Grave um baseline, aplique o fix no código, recarregue a página, repita a{" "}
          <strong>mesma interação</strong> e compare os números aqui (ex.: "renders 47→3").
        </p>
      ) : (
        <>
          <p className="settings-note">
            Baseline de {new Date(baseline.savedAt).toLocaleString()} — repita a mesma
            interação do baseline antes de comparar.
          </p>
          <div className="baseline-summary">
            <span>
              Health Score:{" "}
              <Delta before={baseline.score} after={health.score} lowerIsBetter={false} />
            </span>
            <span>
              CLS:{" "}
              <Delta
                before={baseline.cls}
                after={store.vitals?.cls ?? 0}
                lowerIsBetter
                format={(v) => v.toFixed(3)}
              />
            </span>
          </div>
          {rows.length > 0 && (
            <table className="rank-table">
              <thead>
                <tr>
                  <th>Componente</th>
                  <th>Renders</th>
                  <th>Desnecessários</th>
                  <th>ms médio</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([name, before]) => {
                  const after = currentByName.get(name) ?? {
                    renders: 0,
                    unnecessary: 0,
                    avgMs: 0,
                  };
                  return (
                    <tr key={name}>
                      <td className="mono">{name}</td>
                      <td>
                        <Delta before={before.renders} after={after.renders} lowerIsBetter />
                      </td>
                      <td>
                        <Delta
                          before={before.unnecessary}
                          after={after.unnecessary}
                          lowerIsBetter
                        />
                      </td>
                      <td>
                        <Delta
                          before={before.avgMs}
                          after={after.avgMs}
                          lowerIsBetter
                          format={(v) => (v > 0 ? `${v.toFixed(1)}` : "—")}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
