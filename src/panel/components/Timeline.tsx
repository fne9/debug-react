import { useMemo, useState } from "react";
import type { DebugEvent, EventKind } from "../../shared/protocol";
import type { EventStore } from "../store";

const KINDS: { kind: EventKind; label: string }[] = [
  { kind: "render", label: "Render" },
  { kind: "state", label: "Estado" },
  { kind: "effect", label: "Efeito" },
  { kind: "error", label: "Erro" },
  { kind: "memory", label: "Memória" },
  { kind: "context", label: "Contexto" },
  { kind: "vital", label: "Vitals" },
  { kind: "system", label: "Sistema" },
];

const MAX_ROWS = 500;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}

interface Row {
  event: DebugEvent;
  count: number;
  firstTs: number;
  firstId: string;

}

function EventRow({
  row,
  onOpenProfiler,
  onIgnore,
}: {
  row: Row;
  onOpenProfiler: (component: string) => void;
  onIgnore: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { event, count } = row;
  const hasPayload = event.payload !== undefined;

  return (
    <div
      className={`ev-row k-${event.kind} ${hasPayload ? "expandable" : ""}`}
      onClick={() => hasPayload && setOpen((o) => !o)}
    >
      <div className="ev-main">
        <span className="ev-time">{formatTime(event.ts)}</span>
        <span className="ev-kind">{event.kind.toUpperCase()}</span>
        <span className="ev-label">{event.label}</span>
        {count > 1 && (
          <span
            className="ev-count"
            title={`${count} ocorrências entre ${formatTime(row.firstTs)} e ${formatTime(event.ts)}`}
          >
            ×{count}
          </span>
        )}
        {event.detail && <span className="ev-detail">{event.detail}</span>}
        <span className="ev-actions">
          {event.kind === "render" && (
            <button
              className="ev-goto"
              title="Abrir no Perfilador"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProfiler(event.label);
              }}
            >
              🔎
            </button>
          )}
          <button
            className="ev-goto"
            title={`Ignorar "${event.label}" nesta sessão`}
            onClick={(e) => {
              e.stopPropagation();
              onIgnore(event.label);
            }}
          >
            🚫
          </button>
          {hasPayload && <span className="ev-arrow">{open ? "▼" : "▶"}</span>}
        </span>
      </div>
      {open && hasPayload && <pre className="ev-payload">{safeStringify(event.payload)}</pre>}
    </div>
  );
}

export function Timeline({
  store,
  onOpenProfiler,
}: {
  store: EventStore;
  onOpenProfiler: (component: string) => void;
}) {
  const [activeKinds, setActiveKinds] = useState<Set<EventKind>>(
    () => new Set(KINDS.map((k) => k.kind)),
  );
  const [search, setSearch] = useState("");
  const [groupRepeats, setGroupRepeats] = useState(true);
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());

  const toggleKind = (kind: EventKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const ignore = (label: string) => {
    setIgnored((prev) => new Set(prev).add(label));
  };

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list: Row[] = [];

    for (let i = store.events.length - 1; i >= 0; i--) {
      const e = store.events[i];
      if (!activeKinds.has(e.kind)) continue;
      if (ignored.has(e.label)) continue;
      if (
        query &&
        !e.label.toLowerCase().includes(query) &&
        !(e.detail ?? "").toLowerCase().includes(query)
      ) {
        continue;
      }

      const last = list[list.length - 1];
      if (groupRepeats && last && last.event.kind === e.kind && last.event.label === e.label) {
        last.count++;
        last.firstTs = e.ts;
        last.firstId = e.id;
        continue;
      }

      list.push({ event: e, count: 1, firstTs: e.ts, firstId: e.id });
      if (list.length >= MAX_ROWS) break;
    }
    return list;
  }, [store.events, activeKinds, search, groupRepeats, ignored]);

  return (
    <div className="timeline">
      <div className="timeline-head">
        <h2>Linha do tempo</h2>
        <span className="timeline-total">{store.events.length} eventos</span>
        <button className="btn-danger" onClick={store.clear}>
          Limpar
        </button>
      </div>

      <div className="timeline-toolbar">
        <div className="chips">
          {KINDS.map(({ kind, label }) => (
            <button
              key={kind}
              className={`chip k-${kind} ${activeKinds.has(kind) ? "on" : "off"}`}
              onClick={() => toggleKind(kind)}
            >
              {label} <span className="chip-count">{store.counts[kind]}</span>
            </button>
          ))}
        </div>
        <label className="group-toggle">
          <input
            type="checkbox"
            checked={groupRepeats}
            onChange={(e) => setGroupRepeats(e.target.checked)}
          />
          Agrupar repetidos
        </label>
        {ignored.size > 0 && (
          <button
            className="chip off"
            title={[...ignored].join(", ")}
            onClick={() => setIgnored(new Set())}
          >
            Ignorados: {ignored.size} ✕
          </button>
        )}
        <input
          className="search"
          placeholder="Buscar eventos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <div className="placeholder">
          <h2>Sem eventos ainda</h2>
          <p>
            Interaja com a página inspecionada (ou recarregue-a) para ver renders, efeitos e
            erros aparecendo aqui em tempo real.
          </p>
        </div>
      ) : (
        <div className="ev-list">
          {rows.map((row) => (
            <EventRow
              key={row.firstId}
              row={row}
              onOpenProfiler={onOpenProfiler}
              onIgnore={ignore}
            />
          ))}
        </div>
      )}
    </div>
  );
}
