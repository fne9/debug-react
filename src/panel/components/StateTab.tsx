import { useEffect, useRef, useState } from "react";
import type { OtherStoreRecord, ReduxActionRecord } from "../../shared/protocol";
import type { EventStore } from "../store";

const LIB_LABEL: Record<OtherStoreRecord["lib"], string> = {
  zustand: "Zustand",
  jotai: "Jotai",
  "tanstack-query": "TanStack Query",
  devtools: "hook devtools",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function JsonNode({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  const isObject = value !== null && typeof value === "object";
  if (!isObject) {
    return (
      <div className="json-leaf" style={{ paddingLeft: depth * 14 }}>
        <span className="json-key">{name}:</span>{" "}
        <span className={`json-val json-${typeof value}`}>
          {typeof value === "string" ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  return (
    <details open={depth < 2} className="json-branch" style={{ paddingLeft: depth * 14 }}>
      <summary>
        <span className="json-key">{name}</span>{" "}
        <span className="json-meta">
          {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </summary>
      {entries.map(([k, v]) => (
        <JsonNode key={k} name={k} value={v} depth={depth + 1} />
      ))}
    </details>
  );
}

function ActionRow({ action }: { action: ReduxActionRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ev-row k-state expandable" onClick={() => setOpen((o) => !o)}>
      <div className="ev-main">
        <span className="ev-time">{formatTime(action.ts)}</span>
        <span className="ev-label mono">{action.type}</span>
        <span className="ev-detail">
          {action.changedKeys.length > 0
            ? `mudou: ${action.changedKeys.join(", ")}`
            : "(sem mudança)"}
        </span>
        <span className="ev-arrow">{open ? "▼" : "▶"}</span>
      </div>
      {open && <pre className="ev-payload">{JSON.stringify(action.action, null, 2)}</pre>}
    </div>
  );
}

function OtherStores({ others }: { others: OtherStoreRecord[] }) {
  return (
    <div className="other-stores">
      <h3 className="section-title">Outras stores (leitura básica)</h3>
      {others.map((o, i) => (
        <details key={`${o.name}:${i}`} className="other-store" open={others.length === 1}>
          <summary>
            <span className="mono">{o.name}</span>
            <span className="other-store-lib">{LIB_LABEL[o.lib]}</span>
            {o.lastActionType && (
              <span className="other-store-action">última action: {o.lastActionType}</span>
            )}
          </summary>
          <div className="json-tree">
            <JsonNode name="state" value={o.state} depth={0} />
          </div>
        </details>
      ))}
    </div>
  );
}

export function StateTab({ store }: { store: EventStore }) {
  const redux = store.redux;
  const [actionType, setActionType] = useState("");
  const [payloadJson, setPayloadJson] = useState("");
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchedAt, setDispatchedAt] = useState(0);
  const dispatchedTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(dispatchedTimerRef.current), []);

  const doDispatch = () => {
    const type = actionType.trim();
    if (!type) {
      setDispatchError("Informe o type da action.");
      return;
    }
    const action: { type: string; payload?: unknown } = { type };
    const raw = payloadJson.trim();
    if (raw) {

      try {
        action.payload = JSON.parse(raw) as unknown;
      } catch {
        setDispatchError('Payload não é JSON válido — ex.: {"id": 3}, 42 ou "texto".');
        return;
      }
    }
    setDispatchError(null);
    store.dispatchAction(JSON.stringify(action));
    setDispatchedAt(Date.now());
    window.clearTimeout(dispatchedTimerRef.current);
    dispatchedTimerRef.current = window.setTimeout(() => setDispatchedAt(0), 1500);
  };

  const others = redux?.others ?? [];

  if (!redux || (!redux.detected && others.length === 0)) {
    return (
      <div className="placeholder">
        <h2>Nenhum store detectado</h2>
        <p>
          A extensão emula o hook do Redux DevTools: apps com{" "}
          <span className="mono">configureStore</span> (Redux Toolkit),{" "}
          <span className="mono">composeWithDevTools</span> ou o middleware{" "}
          <span className="mono">devtools</span> do Zustand são detectados automaticamente ao
          criar o store — recarregue a página com o painel aberto. Se o Redux DevTools oficial
          estiver instalado, desative-o para esta página (os dois disputam o mesmo hook). Para
          TanStack Query, exponha o client com{" "}
          <span className="mono">window.__TANSTACK_QUERY_CLIENT__ = queryClient</span>.
        </p>
      </div>
    );
  }

  if (!redux.detected && others.length > 0) {
    return (
      <div className="state-tab">
        <div className="timeline-head">
          <h2>Estado</h2>
          <span className="timeline-total">{others.length} store(s) não-Redux</span>
        </div>
        <OtherStores others={others} />
      </div>
    );
  }

  return (
    <div className="state-tab">
      <div className="timeline-head">
        <h2>Estado (Redux)</h2>
        <span className="timeline-total">
          {redux.storeCount} store{redux.storeCount > 1 ? "s" : ""} · {redux.actions.length}{" "}
          actions
        </span>
      </div>

      <div className="state-cols">
        <div className="state-col">
          <h3 className="section-title">Histórico de actions</h3>
          {redux.actions.length === 0 ? (
            <p className="all-good">Nenhuma action despachada ainda.</p>
          ) : (
            <div className="ev-list state-actions">
              {[...redux.actions].reverse().map((a) => (
                <ActionRow key={a.id} action={a} />
              ))}
            </div>
          )}
        </div>

        <div className="state-col">
          <h3 className="section-title">Árvore de estado (ao vivo)</h3>
          <div className="json-tree">
            <JsonNode name="state" value={redux.state} depth={0} />
          </div>
        </div>
      </div>

      {others.length > 0 && <OtherStores others={others} />}

      <div className="dispatch-box">
        <h3 className="section-title">Dispatch manual</h3>
        <div className="dispatch-form">
          <input
            className="search dispatch-type"
            placeholder="type — ex.: cart/add"
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value);
              setDispatchError(null);
            }}
          />
          <textarea
            className="search dispatch-payload"
            placeholder='payload (JSON, opcional) — ex.: {"id": 3}'
            value={payloadJson}
            onChange={(e) => {
              setPayloadJson(e.target.value);
              setDispatchError(null);
            }}
            rows={3}
          />
          {dispatchError && <div className="dispatch-error">{dispatchError}</div>}
          <button className="btn-copy" onClick={doDispatch}>
            {dispatchedAt > 0 ? "✓ Despachada" : "Despachar action"}
          </button>
        </div>
      </div>
    </div>
  );
}
