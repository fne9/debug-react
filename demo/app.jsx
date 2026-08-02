import {
  Suspense,
  createContext,
  lazy,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

function createStore(reducer, preloadedState, enhancer) {
  if (typeof preloadedState === "function" && enhancer === undefined) {
    enhancer = preloadedState;
    preloadedState = undefined;
  }
  if (enhancer) return enhancer(createStore)(reducer, preloadedState);

  let state = preloadedState !== undefined ? preloadedState : reducer(undefined, { type: "@@INIT" });
  const listeners = new Set();
  return {
    getState: () => state,
    dispatch(action) {
      state = reducer(state, action);
      listeners.forEach((l) => l());
      return action;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const CATALOGO = [
  { id: 1, nome: "Teclado", preco: 199 },
  { id: 2, nome: "Mouse", preco: 99 },
  { id: 3, nome: "Monitor", preco: 1299 },
];

function carrinhoReducer(state = { itens: [], total: 0 }, action) {
  switch (action.type) {
    case "cart/add": {
      const produto = CATALOGO.find((p) => p.id === action.payload?.id) ?? action.payload;
      if (!produto?.preco) return state;
      return {
        itens: [...state.itens, produto],
        total: state.total + produto.preco,
      };
    }
    case "cart/clear":
      return { itens: [], total: 0 };
    default:
      return state;
  }
}

const devtoolsEnhancer =
  typeof window.__REDUX_DEVTOOLS_EXTENSION__ === "function"
    ? window.__REDUX_DEVTOOLS_EXTENSION__()
    : undefined;

const cartStore = createStore(carrinhoReducer, devtoolsEnhancer);

function ReduxSection() {
  const state = useSyncExternalStore(cartStore.subscribe, cartStore.getState);
  return (
    <section>
      <h2>Redux (Etapa 6)</h2>
      <p>
        Carrinho: {state.itens.length} itens — total R$ {state.total}
      </p>
      {CATALOGO.map((p) => (
        <button key={p.id} onClick={() => cartStore.dispatch({ type: "cart/add", payload: { id: p.id } })}>
          + {p.nome}
        </button>
      ))}{" "}
      <button onClick={() => cartStore.dispatch({ type: "cart/clear" })}>Limpar carrinho</button>
      <p style={{ color: "#666" }}>
        Experimente também o dispatch manual na tab Estado: type <code>cart/add</code>, payload{" "}
        <code>{'{"id": 3}'}</code>.
      </p>
    </section>
  );
}

function ProductCard({ product, onBuy, style }) {
  return (
    <div className="card" style={style}>
      <strong>{product.name}</strong> — R$ {product.price}
      <button onClick={onBuy}>Comprar</button>
    </div>
  );
}

function LeakyClock() {
  const [now, setNow] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    setInterval(() => setNow(new Date().toLocaleTimeString()), 1000);
  }, []);
  return <p>Relógio (efeito sem cleanup): {now}</p>;
}

function NoDepsEffect({ count }) {
  useEffect(() => {
    document.title = `React Debug Demo (${count})`;
  });
  return <p>Efeito sem deps (roda em todo render) — count: {count}</p>;
}

function UnstableDepsEffect({ count }) {
  const options = { minimo: 0 };
  useEffect(() => {
    console.log("filtrando com", options, count);
  }, [options]);
  return <p>Efeito com dependência instável (objeto inline nas deps)</p>;
}

function FetchNoAbort() {
  const [status, setStatus] = useState("carregando...");
  useEffect(() => {
    fetch("/api/inexistente")
      .then((r) => setStatus(`HTTP ${r.status}`))
      .catch(() => setStatus("falhou (esperado na demo)"));
  }, []);
  return <p>Fetch sem AbortController: {status}</p>;
}

function TodoList({ items }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function LateImage({ visible }) {
  if (!visible) return null;
  return (
    <div
      style={{
        height: 220,
        background: "linear-gradient(120deg, #7c3aed, #2563eb)",
        borderRadius: 8,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
      }}
    >
      Banner que chegou atrasado e empurrou o layout ↓
    </div>
  );
}

function SlowButton() {
  const [clicks, setClicks] = useState(0);
  const handleSlowClick = () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 300) {
    }
    setClicks((c) => c + 1);
  };
  return (
    <button onClick={handleSlowClick}>
      Handler lento (300ms bloqueado) — cliques: {clicks}
    </button>
  );
}

function TimelineTriggers() {
  const emitSynthetic = () => {
    const agent = window.__REACT_DEBUG_AGENT__;
    if (!agent) {
      alert("Agent não encontrado — a extensão está carregada?");
      return;
    }
    const samples = [
      ["render", "ProductCard", "razão: props (onBuy mudou)"],
      ["render", "App", "razão: estado (count)"],
      ["state", "App", "useState #0: count"],
      ["effect", "LeakyClock", "useEffect executou (deps: [])"],
      ["context", "ThemeProvider", "valor do contexto mudou"],
      ["memory", "heap", "+1.2 MB desde a última amostra"],
    ];
    for (let i = 0; i < 200; i++) {
      const [kind, label, detail] = samples[i % samples.length];
      agent.emit(kind, label, { detail, payload: { sintetico: true, i } });
    }
  };

  return (
    <section>
      <h2>Timeline (Etapa 1)</h2>
      <p>Gera eventos para testar filtros, busca e o ring buffer do painel.</p>
      <button onClick={() => setTimeout(() => { throw new Error("Erro de demonstração"); })}>
        Disparar erro
      </button>{" "}
      <button onClick={() => Promise.reject(new Error("Rejeição de demonstração"))}>
        Rejeitar promise
      </button>{" "}
      <button onClick={emitSynthetic}>
        Emitir 200 eventos mistos (68 render / 33 estado / 33 efeito / 33 contexto / 33 memória)
      </button>
    </section>
  );
}

const ThemeContext = createContext({ mode: "claro" });
ThemeContext.displayName = "ThemeContext";

function ThemedBadge() {
  const theme = useContext(ThemeContext);
  return <span style={{ padding: "2px 8px", border: "1px solid #ccc", borderRadius: 8 }}>tema: {theme.mode}</span>;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function InnerContent() {
  return <p>Conteúdo interno carregado (2º nível da cascata).</p>;
}
const LazyInner = lazy(() => delay(900).then(() => ({ default: InnerContent })));

function OuterContent() {
  return (
    <div>
      <p>Conteúdo externo carregado (1º nível)…</p>
      <Suspense fallback={<p>⏳ carregando conteúdo interno…</p>}>
        <LazyInner />
      </Suspense>
    </div>
  );
}
const LazyOuter = lazy(() => delay(900).then(() => ({ default: OuterContent })));

function SuspenseCascadeSection() {
  const [mounted, setMounted] = useState(false);
  return (
    <section>
      <h2>Cascata de Suspense (Etapa 9)</h2>
      <button onClick={() => setMounted(true)} disabled={mounted}>
        Carregar seção com Suspense aninhado (2 × 900ms em série)
      </button>
      {mounted && (
        <Suspense fallback={<p>⏳ carregando conteúdo externo…</p>}>
          <LazyOuter />
        </Suspense>
      )}
    </section>
  );
}

function HydrationReport() {
  return (
    <p>
      Relatório gerado às <b>{new Date().toLocaleTimeString()}</b>
    </p>
  );
}

const PRODUCTS = [
  { id: 1, name: "Teclado", price: 199 },
  { id: 2, name: "Mouse", price: 99 },
  { id: 3, name: "Monitor", price: 1299 },
];

function App() {
  const [count, setCount] = useState(0);
  const [todos, setTodos] = useState(["Estudar Fiber", "Testar extensão", "Publicar"]);
  const [showBanner, setShowBanner] = useState(false);
  const [showClock, setShowClock] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowBanner(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div>
      <h1>React Debug — Demo</h1>
      <p>
        Página com bugs plantados: re-renders desnecessários, efeito sem
        cleanup, key por índice e layout shift.
      </p>

      <TimelineTriggers />

      <ReduxSection />

      <section>
        <h2>Contador (dispara re-renders em cascata)</h2>
        <ThemeContext.Provider value={{ mode: "claro" }}>
          <ThemedBadge />
        </ThemeContext.Provider>{" "}
        <button onClick={() => setCount((c) => c + 1)}>count = {count}</button>
        {PRODUCTS.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            onBuy={() => console.log("comprar", p.id)}
            style={{ padding: 8 }}
          />
        ))}
      </section>

      <section>
        <h2>Efeitos</h2>
        <label>
          <input
            type="checkbox"
            checked={showClock}
            onChange={(e) => setShowClock(e.target.checked)}
          />
          montar/desmontar relógio (cada remount vaza um setInterval)
        </label>
        {showClock && <LeakyClock />}
        <NoDepsEffect count={count} />
        <UnstableDepsEffect count={count} />
        <FetchNoAbort />
      </section>

      <section>
        <h2>Lista com key=index</h2>
        <button onClick={() => setTodos((t) => [...t].reverse())}>
          Inverter ordem
        </button>
        <TodoList items={todos} />
      </section>

      <SuspenseCascadeSection />

      <section>
        <h2>Web Vitals (Etapa 5)</h2>
        <LateImage visible={showBanner} />
        <p>Este parágrafo é empurrado quando o banner acima aparece (~1.5s após o load).</p>
        <SlowButton />
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

const hydrateTarget = document.getElementById("hydrate-root");
if (hydrateTarget) {
  hydrateRoot(hydrateTarget, <HydrationReport />);
}
