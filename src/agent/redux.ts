import {
  AGENT_SOURCE,
  type AgentReduxMessage,
  type EventKind,
  type OtherStoreRecord,
  type ReduxActionRecord,
  type ReduxSummary,
} from "../shared/protocol";
import { safeSerialize } from "./serialize";

export interface ReduxIO {
  emit: (kind: EventKind, label: string, opts?: { detail?: string; payload?: unknown }) => void;
  track: <T>(fn: () => T) => T;
  send: (msg: AgentReduxMessage) => void;
}

interface StoreLike {
  getState: () => unknown;
  dispatch: (action: unknown) => unknown;
  subscribe: (listener: () => void) => () => void;
}

type Reducer = (state: unknown, action: unknown) => unknown;
type StoreCreator = (reducer: Reducer, preloadedState?: unknown, enhancer?: unknown) => StoreLike;

const MAX_ACTIONS = 50;
const RECENT_ACTION_WINDOW_MS = 200;

let recentAction: { type: string; ts: number } | null = null;

export function getRecentAction(): { type: string; ts: number } | null {
  if (recentAction && Date.now() - recentAction.ts <= RECENT_ACTION_WINDOW_MS) {
    return recentAction;
  }
  return null;
}

function topLevelChangedKeys(prev: unknown, next: unknown): string[] {
  if (
    prev === null ||
    next === null ||
    typeof prev !== "object" ||
    typeof next !== "object" ||
    Array.isArray(prev) !== Array.isArray(next)
  ) {
    return prev === next ? [] : ["(raiz)"];
  }
  const keys = new Set([...Object.keys(prev as object), ...Object.keys(next as object)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (
      !Object.is(
        (prev as Record<string, unknown>)[key],
        (next as Record<string, unknown>)[key],
      )
    ) {
      changed.push(key);
    }
  }
  return changed;
}

interface RegisteredStore {
  getState: () => unknown;
  dispatch: (action: unknown) => unknown;
}

export function initRedux(io: ReduxIO): { dispatchAction: (json: string) => void; refresh: () => void } {
  const stores: RegisteredStore[] = [];
  const actions: ReduxActionRecord[] = [];
  const others: OtherStoreRecord[] = [];
  let actionSeq = 0;
  let dirty = false;

  function guessLib(name: string): OtherStoreRecord["lib"] {
    if (/zustand/i.test(name)) return "zustand";
    if (/jotai|atom/i.test(name)) return "jotai";
    return "devtools";
  }

  function onAction(store: StoreLike, action: unknown, prevState: unknown): void {
    const type =
      action && typeof action === "object" && "type" in action
        ? String((action as { type: unknown }).type)
        : String(action);
    const nextState = store.getState();
    const changedKeys = topLevelChangedKeys(prevState, nextState);
    recentAction = { type, ts: Date.now() };

    actions.push({
      id: ++actionSeq,
      ts: Date.now(),
      type,
      action: safeSerialize(action),
      changedKeys,
    });
    if (actions.length > MAX_ACTIONS) actions.shift();

    io.emit("state", type, {
      detail: `action Redux — mudou: ${changedKeys.join(", ") || "(nada)"}`,
      payload: { action: safeSerialize(action), chavesAlteradas: changedKeys },
    });
    dirty = true;
  }

  function registerStore(store: StoreLike): StoreLike {
    const originalDispatch = store.dispatch.bind(store);
    const wrappedDispatch = (action: unknown): unknown => {
      const prevState = store.getState();
      const result = originalDispatch(action);
      io.track(() => onAction(store, action, prevState));
      return result;
    };
    stores.push({ getState: () => store.getState(), dispatch: wrappedDispatch });
    const wrapped: StoreLike = { ...store, dispatch: wrappedDispatch };
    io.emit("system", "Store Redux detectado", {
      detail: `via hook do Redux DevTools (store #${stores.length})`,
    });
    dirty = true;
    return wrapped;
  }

  function makeEnhancer(): unknown {
    return (createStore: StoreCreator) =>
      (reducer: Reducer, preloadedState?: unknown, enhancer?: unknown): StoreLike => {
        const store = createStore(reducer, preloadedState, enhancer);
        return registerStore(store);
      };
  }

  const win = window as unknown as Record<string, unknown>;
  if (!win.__REDUX_DEVTOOLS_EXTENSION__) {
    const extension = (() => makeEnhancer()) as unknown as Record<string, unknown> & (() => unknown);

    extension.connect = (options?: { name?: string }) => {
      const name = options?.name || `store #${others.length + 1}`;
      const record: OtherStoreRecord = {
        lib: guessLib(name),
        name,
        state: undefined,
        updatedAt: 0,
      };
      others.push(record);
      io.emit("system", "Store detectada (hook devtools)", {
        detail: `${name} (${record.lib})`,
      });
      dirty = true;

      const capture = (action: unknown, state: unknown): void => {
        io.track(() => {
          record.state = safeSerialize(state);
          record.updatedAt = Date.now();
          if (action) {
            const type =
              typeof action === "string"
                ? action
                : action && typeof action === "object" && "type" in action
                  ? String((action as { type: unknown }).type)
                  : undefined;
            if (type) {
              record.lastActionType = type;
              io.emit("state", type, { detail: `${record.lib}: ${name}` });
            }
          }
          dirty = true;
        });
      };

      return {
        init: (state: unknown) => capture(undefined, state),
        send: (action: unknown, state: unknown) => capture(action, state),
        subscribe: () => () => {},
        unsubscribe: () => {},
        error: () => {},
      };
    };
    win.__REDUX_DEVTOOLS_EXTENSION__ = extension;

    win.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ = (...args: unknown[]) => {
      const composeWithAgent = (funcs: ((x: unknown) => unknown)[]) => {
        const enhancers = funcs.concat(makeEnhancer() as (x: unknown) => unknown);
        return (initial: unknown) => enhancers.reduceRight((acc, fn) => fn(acc), initial);
      };

      if (args.length > 0 && typeof args[0] === "function") {
        return composeWithAgent(args as ((x: unknown) => unknown)[]);
      }
      return (...funcs: ((x: unknown) => unknown)[]) => composeWithAgent(funcs);
    };
  }

  interface QueryClientLike {
    getQueryCache?: () => { getAll?: () => QueryLike[] };
  }
  interface QueryLike {
    queryHash?: string;
    queryKey?: unknown;
    state?: { status?: string; dataUpdatedAt?: number };
    getObserversCount?: () => number;
  }
  let tanstackRecord: OtherStoreRecord | null = null;

  setInterval(() => {
    const client = (window as unknown as Record<string, unknown>).__TANSTACK_QUERY_CLIENT__ as
      | QueryClientLike
      | undefined;
    if (!client || typeof client.getQueryCache !== "function") return;
    io.track(() => {
      try {
        const queries = client.getQueryCache!().getAll?.() ?? [];
        const summary = queries.slice(0, 50).map((q) => ({
          key: q.queryHash ?? JSON.stringify(q.queryKey ?? "?").slice(0, 120),
          status: q.state?.status ?? "?",
          atualizadoHa: q.state?.dataUpdatedAt
            ? `${Math.round((Date.now() - q.state.dataUpdatedAt) / 1000)}s`
            : "nunca",
          observers: q.getObserversCount?.() ?? undefined,
        }));
        if (!tanstackRecord) {
          tanstackRecord = {
            lib: "tanstack-query",
            name: "QueryClient",
            state: undefined,
            updatedAt: 0,
          };
          others.push(tanstackRecord);
          io.emit("system", "TanStack Query detectado", {
            detail: `via window.__TANSTACK_QUERY_CLIENT__ — ${summary.length} queries`,
          });
        }
        tanstackRecord.state = { queries: summary };
        tanstackRecord.updatedAt = Date.now();
        dirty = true;
      } catch {

      }
    });
  }, 2000);

  setInterval(() => {
    if (!dirty) return;
    dirty = false;
    io.track(() => {
      const summary: ReduxSummary = {
        detected: stores.length > 0,
        storeCount: stores.length,
        actions: [...actions],
        state: stores.length > 0 ? safeSerialize(stores[0].getState()) : undefined,
        others: others.length > 0 ? [...others] : undefined,
      };
      io.send({ source: AGENT_SOURCE, type: "redux", ts: Date.now(), redux: summary });
    });
  }, 1000);

  return {
    dispatchAction(json: string) {
      if (stores.length === 0) {
        io.emit("error", "Dispatch manual falhou", {
          detail: "nenhum store Redux registrado nesta página",
        });
        return;
      }
      try {
        const action = JSON.parse(json) as unknown;

        stores[0].dispatch(action);
        io.emit("system", "Dispatch manual", {
          detail:
            action && typeof action === "object" && "type" in action
              ? String((action as { type: unknown }).type)
              : json.slice(0, 80),
        });
      } catch (e) {
        io.emit("error", "Dispatch manual falhou", {
          detail: String(e).slice(0, 200),
        });
      }
    },
    refresh() {
      dirty = true;
    },
  };
}
