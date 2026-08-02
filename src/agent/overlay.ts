const CONTAINER_ID = "__react_debug_overlay__";
const MAX_FLASHES_PER_COMMIT = 40;
const FADE_MS = 400;

const COLOR_NORMAL = "#3b82f6";
const COLOR_UNNECESSARY = "#f59e0b";

let enabled = false;
let container: HTMLDivElement | null = null;
let flashBudget = MAX_FLASHES_PER_COMMIT;

function getContainer(): HTMLDivElement | null {
  if (!document.body) return null;
  if (container?.isConnected) return container;
  container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden;";
  document.body.appendChild(container);
  return container;
}

export function setOverlayEnabled(on: boolean): void {
  enabled = on;
  if (!on && container) {
    container.remove();
    container = null;
  }
}

export function isOverlayEnabled(): boolean {
  return enabled;
}

export function resetFlashBudget(): void {
  flashBudget = MAX_FLASHES_PER_COMMIT;
}

import type { HeatmapControl } from "../shared/protocol";

const HEAT_LAYER_ID = "__react_debug_heatmap__";
const HEAT_MAX_SAMPLES = 4000;
const HEAT_RETENTION_MS = 90_000;
const HEAT_DRAW_INTERVAL_MS = 400;
const HEAT_MAX_BOXES = 60;

const HEAT_COLD = "#3b82f6";
const HEAT_WARM = "#f59e0b";
const HEAT_HOT = "#ef4444";

interface HeatSample {
  ts: number;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  unnecessary: boolean;
}

let heatCfg: HeatmapControl = { enabled: false, offsetSec: 0, windowSec: 5 };
let heatSamples: HeatSample[] = [];
let heatTimer: ReturnType<typeof setInterval> | null = null;

export function isHeatmapEnabled(): boolean {
  return heatCfg.enabled;
}

export function recordHeatmap(el: Element, name: string, unnecessary: boolean): void {
  if (!heatCfg.enabled) return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  heatSamples.push({
    ts: Date.now(),
    x: rect.left,
    y: rect.top,
    w: rect.width,
    h: rect.height,
    name,
    unnecessary,
  });
  if (heatSamples.length > HEAT_MAX_SAMPLES) {
    heatSamples.splice(0, heatSamples.length - HEAT_MAX_SAMPLES);
  }
}

export function setHeatmap(cfg: HeatmapControl): void {
  heatCfg = cfg;
  if (cfg.enabled && heatTimer === null) {
    heatTimer = setInterval(drawHeatmap, HEAT_DRAW_INTERVAL_MS);
    drawHeatmap();
  } else if (!cfg.enabled && heatTimer !== null) {
    clearInterval(heatTimer);
    heatTimer = null;
    heatSamples = [];
    document.getElementById(HEAT_LAYER_ID)?.remove();
  } else if (cfg.enabled) {
    drawHeatmap();
  }
}

function heatColor(count: number, hasUnnecessary: boolean): string {
  if (count >= 8) return HEAT_HOT;
  if (count >= 3 || hasUnnecessary) return HEAT_WARM;
  return HEAT_COLD;
}

function drawHeatmap(): void {
  const now = Date.now();
  heatSamples = heatSamples.filter((s) => now - s.ts <= HEAT_RETENTION_MS);

  const to = now - heatCfg.offsetSec * 1000;
  const from = to - heatCfg.windowSec * 1000;

  interface HeatGroup {
    x: number;
    y: number;
    w: number;
    h: number;
    name: string;
    count: number;
    unnecessary: number;
  }
  const groups = new Map<string, HeatGroup>();
  for (const s of heatSamples) {
    if (s.ts < from || s.ts > to) continue;
    const key = `${Math.round(s.x / 8)}:${Math.round(s.y / 8)}:${Math.round(s.w / 8)}:${Math.round(s.h / 8)}:${s.name}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (s.unnecessary) g.unnecessary++;
      g.x = s.x;
      g.y = s.y;
      g.w = s.w;
      g.h = s.h;
    } else {
      groups.set(key, {
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        name: s.name,
        count: 1,
        unnecessary: s.unnecessary ? 1 : 0,
      });
    }
  }

  let layer = document.getElementById(HEAT_LAYER_ID) as HTMLDivElement | null;
  if (!layer) {
    if (!document.body) return;
    layer = document.createElement("div");
    layer.id = HEAT_LAYER_ID;
    layer.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:hidden;";
    document.body.appendChild(layer);
  }
  layer.textContent = "";

  const sorted = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, HEAT_MAX_BOXES);
  for (const g of sorted) {
    if (g.y + g.h < 0 || g.y > innerHeight || g.x + g.w < 0 || g.x > innerWidth) continue;
    const color = heatColor(g.count, g.unnecessary > 0);
    const fillAlpha = Math.min(0.35, 0.06 + g.count * 0.03);

    const box = document.createElement("div");
    box.style.cssText =
      `position:fixed;left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px;` +
      `border:1.5px solid ${color};border-radius:3px;box-sizing:border-box;` +
      `background:${color}${Math.round(fillAlpha * 255)
        .toString(16)
        .padStart(2, "0")};`;

    const label = document.createElement("span");
    label.textContent = `${g.name} ×${g.count}${g.unnecessary > 0 ? " ⚠" : ""}`;
    label.style.cssText =
      `position:absolute;top:-15px;left:-1.5px;font:10px/14px Consolas,monospace;` +
      `color:#fff;background:${color};padding:0 4px;border-radius:2px 2px 0 0;` +
      `max-width:200px;overflow:hidden;white-space:nowrap;`;
    box.appendChild(label);
    layer.appendChild(box);
  }
}

export function flash(
  el: Element,
  opts: { name: string; unnecessary?: boolean; color?: string },
): void {
  if (!enabled || flashBudget <= 0) return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
    return;
  }
  const host = getContainer();
  if (!host) return;
  flashBudget--;

  const color = opts.color ?? (opts.unnecessary ? COLOR_UNNECESSARY : COLOR_NORMAL);

  const box = document.createElement("div");
  box.style.cssText =
    `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
    `width:${rect.width}px;height:${rect.height}px;` +
    `border:1.5px solid ${color};border-radius:3px;box-sizing:border-box;` +
    `opacity:1;transition:opacity ${FADE_MS - 50}ms ease-out;`;

  const label = document.createElement("span");
  label.textContent = opts.unnecessary ? `⚠ ${opts.name}` : opts.name;
  label.style.cssText =
    `position:absolute;top:-15px;left:-1.5px;font:10px/14px Consolas,monospace;` +
    `color:#fff;background:${color};padding:0 4px;border-radius:2px 2px 0 0;` +
    `max-width:180px;overflow:hidden;white-space:nowrap;`;
  box.appendChild(label);

  host.appendChild(box);
  requestAnimationFrame(() => {
    box.style.opacity = "0";
  });
  setTimeout(() => box.remove(), FADE_MS);
}
