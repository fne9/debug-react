import type { EventStore } from "../store";

type Grade = "good" | "warn" | "bad" | "na";

function grade(value: number | null | undefined, warnAt: number, badAt: number): Grade {
  if (value === null || value === undefined) return "na";
  if (value < warnAt) return "good";
  if (value < badAt) return "warn";
  return "bad";
}

function VitalCard({
  label,
  value,
  gradeValue,
  hint,
}: {
  label: string;
  value: string;
  gradeValue: Grade;
  hint?: string;
}) {
  return (
    <div className="kpi" title={hint}>
      <div className={`kpi-value vital-${gradeValue}`}>{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function Vitals({ store }: { store: EventStore }) {
  const v = store.vitals;
  const clsGrade = grade(v?.cls ?? null, 0.1, 0.25);

  const meterPos = v ? Math.min(1, v.cls / 0.35) * 100 : 0;

  return (
    <div className="vitals">
      <div className="timeline-head">
        <h2>Core Web Vitals</h2>
        {v && v.shifts.length > 0 && (
          <span className="timeline-total">{v.shifts.length} layout shifts registrados</span>
        )}
      </div>

      {!v ? (
        <div className="placeholder">
          <h2>Coletando métricas…</h2>
          <p>
            Recarregue a página inspecionada com o painel aberto para capturar FCP, TTFB e LCP
            desde o início do carregamento.
          </p>
        </div>
      ) : (
        <>
          <div className={`cls-meter-card vital-border-${clsGrade}`}>
            <div className="cls-meter-head">
              <span>CLS (Cumulative Layout Shift)</span>
              <span className={`cls-score vital-${clsGrade}`}>{v.cls.toFixed(3)}</span>
            </div>
            <div className="cls-meter">
              <div className="cls-meter-zone zone-good" style={{ width: `${(0.1 / 0.35) * 100}%` }} />
              <div className="cls-meter-zone zone-warn" style={{ width: `${(0.15 / 0.35) * 100}%` }} />
              <div className="cls-meter-zone zone-bad" style={{ flex: 1 }} />
              <div className="cls-meter-pin" style={{ left: `${meterPos}%` }} />
            </div>
            <div className="cls-meter-marks">
              <span style={{ left: `${(0.1 / 0.35) * 100}%` }}>0.1</span>
              <span style={{ left: `${(0.25 / 0.35) * 100}%` }}>0.25</span>
            </div>
            <div className="cls-meter-label">
              {clsGrade === "good" && "🟢 Bom — dentro do limite do Core Web Vitals"}
              {clsGrade === "warn" && "🟡 Precisa melhorar — acima de 0.1"}
              {clsGrade === "bad" && "🔴 Ruim — acima de 0.25"}
            </div>
          </div>

          <div className="kpis">
            <VitalCard
              label="LCP"
              value={v.lcp ? `${(v.lcp.ms / 1000).toFixed(2)}s` : "N/D"}
              gradeValue={grade(v.lcp?.ms ?? null, 2500, 4000)}
              hint={v.lcp ? `${v.lcp.element}${v.lcp.component ? ` em ${v.lcp.component}` : ""}` : undefined}
            />
            <VitalCard
              label="INP (pior interação)"
              value={v.inp ? `${v.inp.worstMs}ms` : "N/D"}
              gradeValue={grade(v.inp?.worstMs ?? null, 200, 500)}
              hint={
                v.inp
                  ? `${v.inp.eventName}${v.inp.component ? ` em ${v.inp.component}` : ""} — ${v.inp.slowCount} interações lentas`
                  : undefined
              }
            />
            <VitalCard
              label="FCP"
              value={v.fcpMs !== null ? `${(v.fcpMs / 1000).toFixed(2)}s` : "N/D"}
              gradeValue={grade(v.fcpMs, 1800, 3000)}
            />
            <VitalCard
              label="TTFB"
              value={v.ttfbMs !== null ? `${v.ttfbMs}ms` : "N/D"}
              gradeValue={grade(v.ttfbMs, 800, 1800)}
            />
            <VitalCard
              label="Load"
              value={v.loadMs !== null ? `${v.loadMs}ms` : "N/D"}
              gradeValue="na"
            />
          </div>

          {v.lcp?.component && (
            <div className="banner-info">
              Elemento do LCP: <span className="mono">{v.lcp.element}</span> renderizado por{" "}
              <strong>{v.lcp.component}</strong>
            </div>
          )}

          <h3 className="section-title">Layout shifts (com atribuição React)</h3>
          {v.shifts.length === 0 ? (
            <p className="all-good">
              Nenhum layout shift registrado ainda — na demo, recarregue a página e aguarde o
              banner atrasado (~1.5s).
            </p>
          ) : (
            <div className="ev-list">
              {[...v.shifts].reverse().map((s) => (
                <div key={`${s.ts}-${s.value}-${s.element}`} className="ev-row k-vital">
                  <div className="ev-main">
                    <span className="ev-time">{formatTime(s.ts)}</span>
                    <span className="ev-kind">+{s.value.toFixed(4)}</span>
                    <span className="ev-label mono">{s.element}</span>
                    <span className="ev-detail">
                      {s.component ? `componente: ${s.component}` : "componente não identificado"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="banner-info">
            💡 Como reduzir CLS: declare <span className="mono">width/height</span> em imagens e
            vídeos, reserve espaço para conteúdo assíncrono (skeletons com{" "}
            <span className="mono">min-height</span>), evite inserir conteúdo acima do existente e
            prefira <span className="mono">transform</span> a mudanças de layout em animações.
          </div>
        </>
      )}
    </div>
  );
}
