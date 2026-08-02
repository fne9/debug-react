import type { EventStore } from "./store";

export interface BaselineComponent {
  renders: number;
  unnecessary: number;
  avgMs: number;
}

export interface BaselineData {
  savedAt: number;
  score: number;
  cls: number;
  components: Record<string, BaselineComponent>;
}

const STORAGE_KEY = "rd:baselines";

async function loadAll(): Promise<Record<string, BaselineData>> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return (stored[STORAGE_KEY] as Record<string, BaselineData>) ?? {};
  } catch {
    return {};
  }
}

export async function loadBaseline(origin: string): Promise<BaselineData | null> {
  const all = await loadAll();
  return all[origin] ?? null;
}

export async function saveBaseline(origin: string, data: BaselineData): Promise<void> {
  const all = await loadAll();
  all[origin] = data;
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

export async function clearBaseline(origin: string): Promise<void> {
  const all = await loadAll();
  delete all[origin];
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

export function captureBaseline(store: EventStore, score: number): BaselineData {
  const components: Record<string, BaselineComponent> = {};
  for (const c of (store.profiler?.components ?? []).slice(0, 20)) {
    components[c.name] = {
      renders: c.renders,
      unnecessary: c.unnecessary,
      avgMs: c.renders > 0 ? c.totalMs / c.renders : 0,
    };
  }
  return {
    savedAt: Date.now(),
    score,
    cls: store.vitals?.cls ?? 0,
    components,
  };
}
