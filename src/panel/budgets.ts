import { useEffect, useRef, useState } from "react";
import type { EventStore } from "./store";

export const PAGE_BUDGET = "@page";

export interface PerfBudget {
  component: string;
  maxRendersPer10s?: number;
  maxAvgMs?: number;
  maxCls?: number;
}

export interface BudgetViolation {
  component: string;
  detail: string;
}

const STORAGE_KEY = "rd:budgets";
const RATE_WINDOW_MS = 11000;

async function loadAll(): Promise<Record<string, PerfBudget[]>> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return (stored[STORAGE_KEY] as Record<string, PerfBudget[]>) ?? {};
  } catch {
    return {};
  }
}

export interface UseBudgets {
  origin: string;
  budgets: PerfBudget[];
  violations: BudgetViolation[];
  addBudget: (budget: PerfBudget) => void;
  removeBudget: (component: string) => void;
}

export function useBudgets(store: EventStore): UseBudgets {
  const origin = store.pageOrigin;
  const [budgets, setBudgets] = useState<PerfBudget[]>([]);
  const [violations, setViolations] = useState<BudgetViolation[]>([]);

  const samplesRef = useRef<{ ts: number; renders: Map<string, number> }[]>([]);

  useEffect(() => {
    if (!origin) return;
    void loadAll().then((all) => setBudgets(all[origin] ?? []));
  }, [origin]);

  const persist = (next: PerfBudget[]) => {
    setBudgets(next);
    if (!origin) return;
    void loadAll().then((all) => {
      all[origin] = next;
      void chrome.storage.local.set({ [STORAGE_KEY]: all });
    });
  };

  useEffect(() => {
    const profiler = store.profiler;
    if (!profiler) return;

    const samples = samplesRef.current;
    samples.push({
      ts: profiler.ts,
      renders: new Map(profiler.components.map((c) => [c.name, c.renders])),
    });
    while (samples.length > 0 && profiler.ts - samples[0].ts > RATE_WINDOW_MS) {
      samples.shift();
    }

    const found: BudgetViolation[] = [];
    for (const budget of budgets) {
      if (budget.component === PAGE_BUDGET) {
        const cls = store.vitals?.cls ?? 0;
        if (budget.maxCls !== undefined && cls > budget.maxCls) {
          found.push({
            component: "página",
            detail: `CLS ${cls.toFixed(3)} estourou o budget de ${budget.maxCls}`,
          });
        }
        continue;
      }

      if (budget.maxRendersPer10s !== undefined && samples.length >= 2) {
        const oldest = samples[0];
        const latest = samples[samples.length - 1];
        const rate =
          (latest.renders.get(budget.component) ?? 0) -
          (oldest.renders.get(budget.component) ?? 0);
        if (rate > budget.maxRendersPer10s) {
          const windowSec = Math.max(1, Math.round((latest.ts - oldest.ts) / 1000));
          found.push({
            component: budget.component,
            detail: `${rate} renders nos últimos ${windowSec}s — budget: ${budget.maxRendersPer10s}/10s`,
          });
        }
      }

      if (budget.maxAvgMs !== undefined) {
        const stat = profiler.components.find((c) => c.name === budget.component);
        if (stat && stat.renders > 0 && stat.totalMs > 0) {
          const avg = stat.totalMs / stat.renders;
          if (avg > budget.maxAvgMs) {
            found.push({
              component: budget.component,
              detail: `${avg.toFixed(1)}ms médio por render — budget: ${budget.maxAvgMs}ms`,
            });
          }
        }
      }
    }
    setViolations(found);
  }, [store.profiler, store.vitals, budgets]);

  return {
    origin,
    budgets,
    violations,
    addBudget: (budget) =>
      persist([...budgets.filter((b) => b.component !== budget.component), budget]),
    removeBudget: (component) => persist(budgets.filter((b) => b.component !== component)),
  };
}
