import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TABS } from "./tabs";
import { useEventStore } from "./store";
import { Timeline } from "./components/Timeline";
import { Profiler } from "./components/Profiler";
import { Dashboard } from "./components/Dashboard";
import { IssueList } from "./components/Issues";
import { Vitals } from "./components/Vitals";
import { StateTab } from "./components/StateTab";
import { MemoryTab } from "./components/MemoryTab";
import { AiTab } from "./components/AiTab";
import { SettingsTab } from "./components/SettingsTab";
import { exportSession } from "./export";

if (chrome.devtools.panels.themeName === "dark") {
  document.documentElement.classList.add("theme-dark");
}

function App() {
  const [active, setActive] = useState("timeline");
  const [profilerFilter, setProfilerFilter] = useState("");
  const store = useEventStore();

  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  const openProfilerFor = (component: string) => {
    setProfilerFilter(component);
    setActive("profiler");
  };

  const effectIssues = store.issues.filter((i) => i.detector.startsWith("effect"));
  const diagnosticIssues = store.issues.filter((i) => !i.detector.startsWith("effect"));

  return (
    <div className="app">
      <header className="header">
        <span className="logo">⚛️</span>
        <strong>React Debug</strong>
        <span className="version">v0.1.0</span>
        <span className="spacer" />
        <button
          className="hdr-btn"
          title="Exportar reprodução — JSON com timeline + achados para anexar em ticket"
          onClick={() => exportSession(store)}
        >
          ⬇ Exportar
        </button>
        <button
          className={`hdr-btn ${store.overlayEnabled ? "active" : ""}`}
          title="Destacar na página os componentes que renderizam"
          onClick={() => store.setOverlay(!store.overlayEnabled)}
        >
          Overlay {store.overlayEnabled ? "●" : "○"}
        </button>
        <button
          className={`hdr-btn ${store.heatmap.enabled ? "active" : ""}`}
          title="Heatmap de render na página: cor por frequência, com scrubber temporal"
          onClick={() =>
            store.setHeatmap({ ...store.heatmap, enabled: !store.heatmap.enabled, offsetSec: 0 })
          }
        >
          Heatmap {store.heatmap.enabled ? "●" : "○"}
        </button>
        {store.recording && <span className="badge-recording">Gravando</span>}
        <label className="toggle">
          <input
            type="checkbox"
            checked={store.recording}
            onChange={(e) => store.setRecording(e.target.checked)}
          />
          <span className="track" />
          <span className="toggle-label">{store.recording ? "ON" : "OFF"}</span>
        </label>
      </header>

      {store.heatmap.enabled && (
        <div className="heatmap-bar">
          <span className="heatmap-label">
            🔥 Heatmap — janela de {store.heatmap.windowSec}s
            {store.heatmap.offsetSec === 0
              ? " · ao vivo"
              : ` · ${store.heatmap.offsetSec}s atrás`}
          </span>
          <input
            className="heatmap-scrubber"
            type="range"
            min={0}
            max={60}
            step={1}

            value={60 - store.heatmap.offsetSec}
            onChange={(e) =>
              store.setHeatmap({ ...store.heatmap, offsetSec: 60 - Number(e.target.value) })
            }
            title="Arraste para revisitar os últimos 60s (dados coletados com o heatmap ligado)"
          />
          {store.heatmap.offsetSec !== 0 && (
            <button
              className="hdr-btn"
              onClick={() => store.setHeatmap({ ...store.heatmap, offsetSec: 0 })}
            >
              ⏵ Ao vivo
            </button>
          )}
          <span className="heatmap-legend">
            <i className="heat-cold" /> 1–2 <i className="heat-warm" /> 3–7{" "}
            <i className="heat-hot" /> 8+ renders
          </span>
        </div>
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === active ? "active" : ""}
            onClick={() => setActive(t.id)}
          >
            {t.label}
            {t.id === "timeline" && store.counts.error > 0 && (
              <span className="tab-badge">{store.counts.error}</span>
            )}
            {t.id === "profiler" &&
              (store.profiler?.components.reduce((acc, c) => acc + c.unnecessary, 0) ?? 0) >
                0 && (
                <span className="tab-badge badge-warn">
                  {store.profiler!.components.reduce((acc, c) => acc + c.unnecessary, 0)}
                </span>
              )}
            {t.id === "effects" && effectIssues.length > 0 && (
              <span
                className={`tab-badge ${effectIssues.some((i) => i.severity === "error") ? "" : "badge-warn"}`}
              >
                {effectIssues.length}
              </span>
            )}
            {t.id === "memory" && store.memory?.suspicious && (
              <span className="tab-badge badge-warn">!</span>
            )}
            {t.id === "vitals" && (store.vitals?.cls ?? 0) >= 0.1 && (
              <span
                className={`tab-badge ${(store.vitals?.cls ?? 0) >= 0.25 ? "" : "badge-warn"}`}
              >
                {store.vitals!.cls.toFixed(2)}
              </span>
            )}
            {t.id === "diagnostics" && diagnosticIssues.length > 0 && (
              <span
                className={`tab-badge ${diagnosticIssues.some((i) => i.severity === "error") ? "" : "badge-warn"}`}
              >
                {diagnosticIssues.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        {active === "dashboard" ? (
          <Dashboard store={store} />
        ) : active === "timeline" ? (
          <Timeline store={store} onOpenProfiler={openProfilerFor} />
        ) : active === "profiler" ? (
          <Profiler store={store} filter={profilerFilter} onFilterChange={setProfilerFilter} />
        ) : active === "effects" ? (
          <IssueList
            title="useEffect Auditor"
            issues={effectIssues}
            emptyTitle="Nenhum problema de efeito detectado"
            emptyText="Cleanups faltando, deps instáveis, efeitos sem array de deps e fetch sem abort aparecerão aqui conforme os componentes renderizam."
          />
        ) : active === "diagnostics" ? (
          <IssueList
            title="Diagnóstico"
            issues={diagnosticIssues}
            emptyTitle="Nenhum problema de código detectado"
            emptyText="Padrões como key={index} em listas aparecerão aqui conforme os componentes renderizam."
          />
        ) : active === "vitals" ? (
          <Vitals store={store} />
        ) : active === "state" ? (
          <StateTab store={store} />
        ) : active === "memory" ? (
          <MemoryTab store={store} />
        ) : active === "ai" ? (
          <AiTab store={store} onOpenSettings={() => setActive("settings")} />
        ) : active === "settings" ? (
          <SettingsTab />
        ) : (
          <div className="placeholder">
            <h2>{tab.title}</h2>
            <p>{tab.description}</p>
          </div>
        )}
      </main>

      <footer className="statusbar">
        <span>
          <span className={`dot ${store.agentConnected ? "ok" : ""}`} />{" "}
          {store.agentConnected
            ? "Agent conectado à página"
            : "Aguardando agent (recarregue a página inspecionada)"}
        </span>
        <span>
          Overhead:{" "}
          {store.stats ? `${store.stats.overheadMsPerFrame.toFixed(3)} ms/frame` : "—"}
        </span>
        <span>
          {store.stats ? `${Math.round(store.stats.eventsPerSecond)} eventos/s` : ""}
        </span>
        <span style={{ marginLeft: "auto" }}>
          {store.env?.detected ? (
            `React ${store.env.version ?? "?"} (${store.env.buildType === "development" ? "dev" : store.env.buildType})`
          ) : (
            <>
              React não detectado —{" "}
              <button className="link-btn" onClick={store.openDemo}>
                ▶ testar na demo embutida
              </button>
            </>
          )}
        </span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
