import { useEffect, useMemo, useRef, useState } from "react";
import type { AiBackgroundMessage, AnalysisKind } from "../../shared/protocol";
import { DEFAULT_SETTINGS, PROVIDER_LABELS, loadSettings, type AiSettings } from "../../shared/settings";
import type { EventStore } from "../store";
import { buildSnapshot } from "../ai/snapshot";
import { KIND_LABELS, SYSTEM_PROMPT, buildPrompt } from "../ai/prompts";
import { useAiPort } from "../ai/useAiPort";

const KINDS: AnalysisKind[] = ["performance", "failure", "security"];

type RunState = "idle" | "streaming" | "done" | "error";

export function AiTab({
  store,
  onOpenSettings,
}: {
  store: EventStore;
  onOpenSettings: () => void;
}) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [runState, setRunState] = useState<RunState>("idle");
  const [runKind, setRunKind] = useState<AnalysisKind | null>(null);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const sendAi = useAiPort((msg: AiBackgroundMessage) => {
    if (msg.type === "ai:chunk" && msg.requestId === requestIdRef.current) {
      setOutput((prev) => prev + msg.text);
    } else if (msg.type === "ai:done" && msg.requestId === requestIdRef.current) {
      setRunState("done");
      requestIdRef.current = null;
    } else if (msg.type === "ai:error" && msg.requestId === requestIdRef.current) {
      setError(msg.message);
      setRunState("error");
      requestIdRef.current = null;
    }
  });

  const [snapshotTick, setSnapshotTick] = useState(0);
  const snapshotJson = useMemo(
    () => JSON.stringify(buildSnapshot(store), null, 2),

    [snapshotTick],
  );

  useEffect(() => {
    if (runState === "streaming" && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, runState]);

  const hasKey = Boolean(settings.keys[settings.provider]);
  const ready = hasKey && settings.model !== "";

  const start = (kind: AnalysisKind) => {
    const requestId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
    requestIdRef.current = requestId;
    setRunKind(kind);
    setOutput("");
    setError(null);
    setRunState("streaming");
    sendAi({
      type: "ai:start",
      requestId,
      provider: settings.provider,
      model: settings.model,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(kind, snapshotJson),
    });
  };

  const cancel = () => {
    if (requestIdRef.current) {
      sendAi({ type: "ai:cancel", requestId: requestIdRef.current });
    }
  };

  const diffs = useMemo(
    () => [...output.matchAll(/```diff\r?\n([\s\S]*?)```/g)].map((m) => m[1]),
    [output],
  );

  const exportPatch = () => {
    const blob = new Blob([diffs.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "react-debug-fix.patch";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!loaded) return <div className="placeholder"><p>Carregando…</p></div>;

  if (!hasKey) {
    return (
      <div className="placeholder">
        <h2>Análise de IA (BYOK)</h2>
        <p>
          Cadastre a sua chave de API ({PROVIDER_LABELS[settings.provider]}) para analisar
          esta sessão. A chave fica só nesta máquina e as chamadas vão direto para o
          provedor — sem servidor intermediário.
        </p>
        <button className="btn-copy" onClick={onOpenSettings}>
          Abrir Configurações
        </button>
      </div>
    );
  }

  return (
    <div className="ai-tab">
      <div className="timeline-head">
        <h2>Análise de IA</h2>
        <span className="timeline-total">
          {PROVIDER_LABELS[settings.provider]} · {settings.model || "modelo não selecionado"}
        </span>
      </div>

      {!ready && (
        <div className="settings-status bad">
          Selecione um modelo na tab Configurações antes de analisar.{" "}
          <button className="btn-copy" onClick={onOpenSettings}>Abrir Configurações</button>
        </div>
      )}

      <div className="ai-actions">
        {KINDS.map((kind) => (
          <button
            key={kind}
            className={`btn-copy ai-kind ${runKind === kind && runState === "streaming" ? "active" : ""}`}
            disabled={!ready || runState === "streaming"}
            onClick={() => start(kind)}
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
        {runState === "streaming" && (
          <button className="btn-copy ai-cancel" onClick={cancel}>
            ■ Cancelar
          </button>
        )}
      </div>

      <details className="ai-preview">
        <summary>
          Preview do payload — exatamente o que será enviado ({(snapshotJson.length / 1024).toFixed(1)} KB,
          dados sensíveis redigidos no cliente)
          <button
            className="btn-copy"
            onClick={(e) => {
              e.preventDefault();
              setSnapshotTick((n) => n + 1);
            }}
          >
            ↻ Atualizar snapshot
          </button>
        </summary>
        <pre className="ev-payload ai-snapshot">{snapshotJson}</pre>
      </details>

      {(output || runState === "streaming" || error) && (
        <div className="ai-result">
          <div className="ai-result-head">
            <strong>
              {runKind ? `Análise: ${KIND_LABELS[runKind]}` : "Resultado"}
              {runState === "streaming" && " — gerando…"}
            </strong>
            {diffs.length > 0 && runState !== "streaming" && (
              <button className="btn-copy" onClick={exportPatch}>
                ⬇ Exportar .patch ({diffs.length} diff{diffs.length > 1 ? "s" : ""})
              </button>
            )}
          </div>
          {error && <div className="settings-status bad">{error}</div>}
          <pre ref={outputRef} className="ai-output">
            {output || (runState === "streaming" ? "Aguardando o provedor…" : "")}
            {runState === "streaming" && <span className="ai-cursor">▌</span>}
          </pre>
        </div>
      )}

      {runState === "idle" && !output && (
        <p className="settings-note">
          Escolha um tipo de análise acima. O snapshot inclui detectores disparados, top
          infratores de render, Web Vitals, actions Redux (redigidas), memória e erros —
          nunca a página inteira.
        </p>
      )}
    </div>
  );
}
