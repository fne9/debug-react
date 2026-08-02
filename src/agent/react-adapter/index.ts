import type {
  AgentIssuesMessage,
  AgentProfilerMessage,
  DetectedIssue,
  DetectorId,
  EventKind,
  ProfilerComponentStat,
  ReactEnvInfo,
} from "../../shared/protocol";
import { AGENT_SOURCE } from "../../shared/protocol";
import { installHook } from "./hook";
import {
  computeReason,
  findHostElement,
  findNearestComponentName,
  getFiberName,
  getFiberSource,
  getProviderName,
  hasIndexKeyedChildren,
  isProviderFiber,
  isSuspenseFiber,
  looksRecreated,
  visitCommittedComponents,
  type FiberLike,
  type RenderReason,
} from "./fiber";
import {
  cleanupPattern,
  collectEffects,
  effectSource,
  fetchWithoutAbort,
  getEffectDestroy,
  type EffectLike,
} from "./effects";
import { flash, isHeatmapEnabled, isOverlayEnabled, recordHeatmap, resetFlashBudget } from "../overlay";
import { getRecentAction } from "../redux";

export interface AdapterIO {
  emit: (kind: EventKind, label: string, opts?: { detail?: string; payload?: unknown }) => void;
  track: <T>(fn: () => T) => T;
  sendEnv: (env: ReactEnvInfo) => void;
  sendProfiler: (msg: AgentProfilerMessage) => void;
  sendIssues: (msg: AgentIssuesMessage) => void;
}

const SLOW_RENDER_MS = 16;
const MAX_EVENTS_PER_COMMIT = 100;
const SUMMARY_INTERVAL_MS = 1000;
const MAX_COMPONENTS_IN_SUMMARY = 100;
const CLEANUP_CHECK_DELAY_MS = 250;
const LOOP_WINDOW_MS = 2000;
const LOOP_RUNS_THRESHOLD = 5;
const UNSTABLE_DEPS_THRESHOLD = 3;
const NO_DEPS_RENDERS_THRESHOLD = 3;
const CONTEXT_CASCADE_THRESHOLD = 3;
const SUSPENSE_CASCADE_WINDOW_MS = 3000;
const INLINE_HANDLER_THRESHOLD = 10;

interface ComponentStats {
  renders: number;
  mounts: number;
  unnecessary: number;
  totalMs: number;
  lastReason: string;
  source?: string;
}

interface EffectHistory {
  unstableStreak: number;
  depslessRuns: number;
  runTimestamps: number[];
}

export function reasonText(reason: RenderReason): string {
  switch (reason.type) {
    case "mount":
      return "montagem";
    case "props":
      return `props: ${(reason.keys ?? []).slice(0, 5).join(", ")}`;
    case "state":
      return reason.hookIndex !== undefined ? `estado (hook #${reason.hookIndex})` : "estado";
    case "parent":
      return "pai re-renderizou";
  }
}

function fixFor(detector: DetectorId, component: string, extra?: string): string {
  switch (detector) {
    case "effect-no-cleanup":
      return [
        `// ${component}: todo recurso criado no efeito precisa ser desfeito no cleanup.`,
        `useEffect(() => {`,
        `  const id = setInterval(tick, 1000);          // ou addEventListener/subscribe`,
        `  return () => clearInterval(id);              // <- cleanup obrigatório`,
        `}, []);`,
        ``,
        `// listener:  window.addEventListener("resize", fn);`,
        `//            return () => window.removeEventListener("resize", fn);`,
      ].join("\n");
    case "effect-no-deps":
      return [
        `// ${component}: sem o array de deps o efeito executa em TODO render.`,
        `useEffect(() => {`,
        `  // ...`,
        `}, [/* liste aqui as dependências reais */]);`,
      ].join("\n");
    case "effect-unstable-deps":
      return [
        `// ${component}: a dependência é recriada a cada render, então o efeito re-executa sempre.`,
        `const options = useMemo(() => ({ /* ... */ }), []);   // objeto estável`,
        `const handler = useCallback(() => { /* ... */ }, []); // função estável`,
        `useEffect(() => { /* ... */ }, [options, handler]);`,
      ].join("\n");
    case "effect-fetch-no-abort":
      return [
        `// ${component}: aborte o fetch no cleanup para não atualizar estado após desmontar.`,
        `useEffect(() => {`,
        `  const controller = new AbortController();`,
        `  fetch(url, { signal: controller.signal })`,
        `    .then(handle)`,
        `    .catch((e) => { if (e.name !== "AbortError") throw e; });`,
        `  return () => controller.abort();`,
        `}, [url]);`,
      ].join("\n");
    case "effect-loop":
      return [
        `// ${component}: o efeito dispara setState que re-dispara o próprio efeito.`,
        `// Adicione uma condição de parada ou corrija as dependências:`,
        `useEffect(() => {`,
        `  if (jaProcessado) return;`,
        `  // ...`,
        `}, [entradaReal]); // nunca dependa do estado que o próprio efeito atualiza sem guarda`,
      ].join("\n");
    case "key-index":
      return [
        `// ${component}: key={index} quebra estado e animações quando a lista reordena.`,
        `// Use um id estável do dado:`,
        `items.map((item) => <Item key={item.id} {...item} />)`,
        extra ? `// (detectado: ${extra})` : ``,
      ].join("\n");
    case "context-cascade":
      return [
        `// ${component}: o value do Provider é recriado a cada render do pai —`,
        `// TODOS os consumidores re-renderizam mesmo sem mudança real.`,
        `const value = useMemo(() => ({ user, theme }), [user, theme]); // referência estável`,
        `return <MeuContexto.Provider value={value}>{children}</MeuContexto.Provider>;`,
      ].join("\n");
    case "suspense-cascade":
      return [
        `// ${component}: boundaries de Suspense aninhados resolvendo em série (cascata) —`,
        `// cada nível espera o anterior terminar; o usuário vê fallbacks em sequência.`,
        `// 1. Inicie os carregamentos em paralelo (preload fora do render):`,
        `const outerPromise = loadOuter(); const innerPromise = loadInner();`,
        `// 2. Ou use UM boundary para o grupo que deve aparecer junto:`,
        `<Suspense fallback={<Skeleton />}>`,
        `  <Outer />`,
        `  <Inner />`,
        `</Suspense>`,
      ].join("\n");
    case "hydration-mismatch":
      return [
        `// O HTML do servidor não bate com o primeiro render do cliente.`,
        `// Causas clássicas: Date/Math.random no render, typeof window, dados diferentes.`,
        `// 1. Mova valores que variam para efeito/estado:`,
        `const [now, setNow] = useState(null);`,
        `useEffect(() => setNow(new Date().toLocaleTimeString()), []);`,
        `// 2. Último recurso, para variação intencional:`,
        `<span suppressHydrationWarning>{new Date().getFullYear()}</span>`,
      ].join("\n");
    case "inline-handler":
      return [
        `// ${component}: recebe handler inline novo a cada render do pai —`,
        `// memoização do filho nunca funciona e ele re-renderiza sempre.`,
        `// No pai:`,
        `const handleAction = useCallback(() => { /* ... */ }, []);`,
        `<${component} onAction={handleAction} />`,
        `// No filho (para o memo valer):`,
        `export default React.memo(${component});`,
      ].join("\n");
  }
}

export function initReactAdapter(io: AdapterIO): void {
  const stats = new Map<string, ComponentStats>();
  const effectHistory = new Map<string, EffectHistory>();
  const issues = new Map<string, DetectedIssue>();

  const providerStreaks = new Map<string, number>();
  const handlerStreaks = new Map<string, number>();
  const suspenseResolveTs = new WeakMap<FiberLike, number>();
  let totalRenders = 0;
  let slowRenders = 0;
  let summaryDirty = false;
  let issuesDirty = false;

  function report(
    detector: DetectorId,
    component: string,
    opts: {
      severity: "error" | "warn";
      title: string;
      detail: string;
      evidence?: string;
      hookIndex?: number;
    },
  ): void {
    const id = `${detector}:${component}${opts.hookIndex !== undefined ? `#${opts.hookIndex}` : ""}`;
    const now = Date.now();
    const existing = issues.get(id);
    if (existing) {
      existing.count++;
      existing.lastTs = now;
    } else {
      issues.set(id, {
        id,
        detector,
        severity: opts.severity,
        component,
        title: opts.title,
        detail: opts.detail,
        evidence: opts.evidence,
        fix: fixFor(detector, component),
        count: 1,
        firstTs: now,
        lastTs: now,
      });

      io.emit(detector.startsWith("effect") ? "effect" : "render", component, {
        detail: `🔴 ${opts.title}`,
        payload: { detector, detalhe: opts.detail },
      });
    }
    issuesDirty = true;
  }

  function getEffectHistory(key: string): EffectHistory {
    let h = effectHistory.get(key);
    if (!h) {
      h = { unstableStreak: 0, depslessRuns: 0, runTimestamps: [] };
      effectHistory.set(key, h);
    }
    return h;
  }

  let pendingCleanupChecks: {
    effect: EffectLike;
    component: string;
    hookIndex: number;
    pattern: string;
    evidence: string;
  }[] = [];
  let cleanupTimerScheduled = false;

  function scheduleCleanupChecks(): void {
    if (cleanupTimerScheduled || pendingCleanupChecks.length === 0) return;
    cleanupTimerScheduled = true;
    setTimeout(() => {
      cleanupTimerScheduled = false;
      const checks = pendingCleanupChecks;
      pendingCleanupChecks = [];
      io.track(() => {
        for (const check of checks) {
          if (getEffectDestroy(check.effect) == null) {
            report("effect-no-cleanup", check.component, {
              severity: "error",
              title: `useEffect cria ${check.pattern} sem cleanup`,
              detail:
                `O efeito (hook #${check.hookIndex}) usa ${check.pattern} e não retorna função de limpeza — ` +
                `o recurso vaza a cada remontagem do componente.`,
              evidence: check.evidence,
              hookIndex: check.hookIndex,
            });
          }
        }
      });
    }, CLEANUP_CHECK_DELAY_MS);
  }

  function analyzeEffects(fiber: FiberLike, name: string): void {
    for (const info of collectEffects(fiber)) {
      const key = `${name}#${info.hookIndex}`;
      const history = getEffectHistory(key);
      const src = effectSource(info.effect);

      if (info.deps === null) {
        history.depslessRuns++;
        if (history.depslessRuns === NO_DEPS_RENDERS_THRESHOLD) {
          report("effect-no-deps", name, {
            severity: "warn",
            title: "useEffect sem array de dependências",
            detail: `O efeito (hook #${info.hookIndex}) executa em TODO render do componente (${history.depslessRuns}x até agora).`,
            evidence: src,
            hookIndex: info.hookIndex,
          });
        } else if (history.depslessRuns > NO_DEPS_RENDERS_THRESHOLD) {
          const id = `effect-no-deps:${name}#${info.hookIndex}`;
          const issue = issues.get(id);
          if (issue) {
            issue.count++;
            issue.lastTs = Date.now();
            issuesDirty = true;
          }
        }
      }

      if (!info.ran) continue;

      if (info.unstableChange) {
        history.unstableStreak++;
        if (history.unstableStreak >= UNSTABLE_DEPS_THRESHOLD) {
          report("effect-unstable-deps", name, {
            severity: "warn",
            title: "Dependência de useEffect instável",
            detail:
              `As deps do efeito (hook #${info.hookIndex}) mudam de referência a cada render ` +
              `(função/objeto recriado) — o efeito re-executa sem necessidade.`,
            evidence: src,
            hookIndex: info.hookIndex,
          });
        }
      } else if (info.prevDeps !== undefined) {
        history.unstableStreak = 0;
      }

      const now = Date.now();
      history.runTimestamps.push(now);
      if (history.runTimestamps.length > 10) history.runTimestamps.shift();
      const inWindow = history.runTimestamps.filter((t) => now - t <= LOOP_WINDOW_MS).length;
      if (info.deps !== null && inWindow >= LOOP_RUNS_THRESHOLD) {
        report("effect-loop", name, {
          severity: "error",
          title: "useEffect re-executando em rajada",
          detail: `O efeito (hook #${info.hookIndex}) executou ${inWindow}x em ${LOOP_WINDOW_MS / 1000}s — possível loop efeito→setState→efeito.`,
          evidence: src,
          hookIndex: info.hookIndex,
        });
      }

      const pattern = cleanupPattern(src);
      if (pattern && !issues.has(`effect-no-cleanup:${name}#${info.hookIndex}`)) {
        pendingCleanupChecks.push({
          effect: info.effect,
          component: name,
          hookIndex: info.hookIndex,
          pattern,
          evidence: src,
        });
      }

      if (fetchWithoutAbort(src)) {
        report("effect-fetch-no-abort", name, {
          severity: "warn",
          title: "fetch em useEffect sem AbortController",
          detail: `O efeito (hook #${info.hookIndex}) dispara fetch sem signal — risco de setState após desmontar e de corrida entre respostas.`,
          evidence: src,
          hookIndex: info.hookIndex,
        });
      }
    }
  }

  const HYDRATION_RE =
    /hydrat|did not match|server rendered html|server-rendered html|minified react error #(418|423|425)/i;
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    try {
      const text = args
        .map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : ""))
        .join(" ");
      if (HYDRATION_RE.test(text)) {
        io.track(() => {
          report("hydration-mismatch", "(hidratação)", {
            severity: "error",
            title: "Hydration mismatch (HTML do servidor ≠ cliente)",
            detail:
              "O HTML renderizado no servidor não bate com o primeiro render do cliente — o React descartou o HTML e re-renderizou tudo no cliente (mais lento e propenso a flicker). " +
              `Mensagem original: ${text.slice(0, 300)}`,
          });
        });
      }
    } catch {

    }
    originalConsoleError(...args);
  };

  function visitSpecialFiber(fiber: FiberLike): void {
    if (isProviderFiber(fiber)) {
      const alt = fiber.alternate;
      if (!alt) return;
      const prev = alt.memoizedProps?.value;
      const next = fiber.memoizedProps?.value;
      if (Object.is(prev, next)) return;

      const providerName = getProviderName(fiber);
      const ownerName = findNearestComponentName(fiber) ?? "App";
      const key = `${providerName}@${ownerName}`;

      io.emit("context", providerName, {
        detail: `valor do contexto mudou (Provider em ${ownerName})`,
      });

      if (looksRecreated(prev, next)) {
        const streak = (providerStreaks.get(key) ?? 0) + 1;
        providerStreaks.set(key, streak);
        if (streak >= CONTEXT_CASCADE_THRESHOLD) {
          report("context-cascade", ownerName, {
            severity: "warn",
            title: `Cascata de contexto: value de <${providerName}.Provider> recriado`,
            detail:
              `O value do Provider (${providerName}) muda de referência a cada render de ${ownerName} ` +
              `sem mudança real de conteúdo (${streak}x seguidas) — todos os consumidores re-renderizam à toa.`,
          });
        }
      } else {
        providerStreaks.set(key, 0);
      }
      return;
    }

    if (isSuspenseFiber(fiber)) {
      const alt = fiber.alternate;
      const wasSuspended = alt ? alt.memoizedState != null : false;
      const isSuspended = fiber.memoizedState != null;
      if (!(wasSuspended && !isSuspended)) return;

      const now = Date.now();
      suspenseResolveTs.set(fiber, now);
      if (alt) suspenseResolveTs.set(alt, now);

      let node: FiberLike | null = fiber.return;
      let hops = 0;
      while (node && hops++ < 60) {
        if (isSuspenseFiber(node)) {
          const ancestorTs =
            suspenseResolveTs.get(node) ??
            (node.alternate ? suspenseResolveTs.get(node.alternate) : undefined);
          if (ancestorTs !== undefined && now - ancestorTs <= SUSPENSE_CASCADE_WINDOW_MS) {
            const ownerName = findNearestComponentName(fiber) ?? "Suspense";
            report("suspense-cascade", ownerName, {
              severity: "warn",
              title: "Cascata de Suspense (carregamento em série)",
              detail:
                `Um boundary de Suspense aninhado em ${ownerName} resolveu ${((now - ancestorTs) / 1000).toFixed(1)}s ` +
                `depois do boundary pai — os carregamentos estão em série (waterfall) em vez de paralelos.`,
            });
            break;
          }
        }
        node = node.return;
      }
    }
  }

  function handleCommit(root: unknown): void {
    let eventsThisCommit = 0;
    let suppressed = 0;
    const overlayOn = isOverlayEnabled();
    const heatOn = isHeatmapEnabled();
    resetFlashBudget();

    const recentAction = getRecentAction();
    const actionSuffix = recentAction ? ` · após ${recentAction.type}` : "";

    visitCommittedComponents(root, (fiber: FiberLike) => {
      const name = getFiberName(fiber);
      const reason = computeReason(fiber);
      const duration = typeof fiber.actualDuration === "number" ? fiber.actualDuration : 0;

      if (overlayOn || heatOn) {
        const el = findHostElement(fiber);
        if (el) {
          if (overlayOn) flash(el, { name, unnecessary: reason.unnecessary ?? false });
          if (heatOn) recordHeatmap(el, name, reason.unnecessary ?? false);
        }
      }

      analyzeEffects(fiber, name);
      if (!issues.has(`key-index:${name}`) && hasIndexKeyedChildren(fiber)) {
        report("key-index", name, {
          severity: "warn",
          title: "Lista com key={index}",
          detail:
            "Os filhos usam o índice do array como key — reordenar/inserir itens embaralha estado, foco e animações.",
        });
      }

      if (
        reason.type === "props" &&
        reason.unnecessary &&
        (reason.keys ?? []).some((k) => /^on[A-Z]/.test(k))
      ) {
        const streak = (handlerStreaks.get(name) ?? 0) + 1;
        handlerStreaks.set(name, streak);
        if (streak >= INLINE_HANDLER_THRESHOLD) {
          const handlerKeys = (reason.keys ?? []).filter((k) => /^on[A-Z]/.test(k));
          report("inline-handler", name, {
            severity: "warn",
            title: `Handler inline caro: ${handlerKeys.join(", ")}`,
            detail:
              `${name} re-renderizou ${streak}x porque o pai recria ${handlerKeys.join(", ")} ` +
              `a cada render — extraia o handler com useCallback e memoize o filho.`,
          });
        }
      }

      let s = stats.get(name);
      if (!s) {
        s = { renders: 0, mounts: 0, unnecessary: 0, totalMs: 0, lastReason: "" };
        stats.set(name, s);
      }
      if (!s.source) s.source = getFiberSource(fiber);
      s.renders++;
      if (reason.type === "mount") s.mounts++;
      if (reason.unnecessary) s.unnecessary++;
      s.totalMs += duration;
      s.lastReason = reasonText(reason);
      totalRenders++;
      if (duration > SLOW_RENDER_MS) slowRenders++;
      summaryDirty = true;

      if (eventsThisCommit < MAX_EVENTS_PER_COMMIT) {
        eventsThisCommit++;
        const prefix = reason.unnecessary ? "⚠ desnecessário — " : "";
        io.emit("render", name, {
          detail: `${prefix}${reasonText(reason)}${duration ? ` — ${duration.toFixed(1)}ms` : ""}${actionSuffix}`,
          payload: {
            razao: reason.type,
            props: reason.keys,
            hook: reason.hookIndex,
            desnecessario: reason.unnecessary ?? false,
            duracaoMs: duration ? Number(duration.toFixed(2)) : undefined,
          },
        });
      } else {
        suppressed++;
      }
    }, visitSpecialFiber);

    scheduleCleanupChecks();

    if (suppressed > 0) {
      io.emit("render", `+${suppressed} renders neste commit`, {
        detail: "agrupados para não inundar a timeline",
      });
    }
  }

  installHook({
    onInject(renderer) {
      const env: ReactEnvInfo = {
        detected: true,
        version: renderer.version,
        buildType:
          renderer.bundleType === 1
            ? "development"
            : renderer.bundleType === 0
              ? "production"
              : "unknown",
      };
      io.sendEnv(env);
      io.emit("system", "React detectado", {
        detail: `v${renderer.version ?? "?"} (${env.buildType})`,
      });
    },
    onCommit(root) {
      io.track(() => handleCommit(root));
    },
  });

  setInterval(() => {
    if (summaryDirty) {
      summaryDirty = false;
      const components: ProfilerComponentStat[] = [...stats.entries()]
        .map(([name, s]) => ({
          name,
          renders: s.renders,
          mounts: s.mounts,
          unnecessary: s.unnecessary,
          totalMs: Number(s.totalMs.toFixed(2)),
          lastReason: s.lastReason,
          source: s.source,
        }))
        .sort((a, b) => b.renders - a.renders)
        .slice(0, MAX_COMPONENTS_IN_SUMMARY);

      io.sendProfiler({
        source: AGENT_SOURCE,
        type: "profiler",
        ts: Date.now(),
        totalComponents: stats.size,
        totalRenders,
        slowRenders,
        components,
      });
    }

    if (issuesDirty) {
      issuesDirty = false;
      const list = [...issues.values()].sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
        return b.lastTs - a.lastTs;
      });
      io.sendIssues({ source: AGENT_SOURCE, type: "issues", ts: Date.now(), issues: list });
    }
  }, SUMMARY_INTERVAL_MS);
}
