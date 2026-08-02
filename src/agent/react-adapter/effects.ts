import type { FiberLike } from "./fiber";

interface HookLike {
  memoizedState: unknown;
  queue: unknown;
  next: HookLike | null;
}

export interface EffectLike {
  create: (...args: unknown[]) => unknown;
  deps: unknown[] | null | undefined;
  destroy?: unknown;
  inst?: { destroy?: unknown };
  tag?: number;
}

export interface EffectInfo {
  hookIndex: number;
  effect: EffectLike;

  deps: unknown[] | null;

  prevDeps: unknown[] | null | undefined;

  ran: boolean;

  unstableChange: boolean;
}

function isEffectObject(value: unknown): value is EffectLike {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as EffectLike).create === "function" &&
    "deps" in (value as object)
  );
}

function depsArrayEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

function isPlainObjectOrArray(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

function looksRecreated(prev: unknown, next: unknown): boolean {
  if (typeof prev === "function" && typeof next === "function") return true;
  if (isPlainObjectOrArray(prev) && isPlainObjectOrArray(next)) return shallowEqual(prev, next);
  return false;
}

export function collectEffects(fiber: FiberLike): EffectInfo[] {
  const out: EffectInfo[] = [];
  let hook = fiber.memoizedState as HookLike | null;
  let prevHook = (fiber.alternate?.memoizedState as HookLike | null) ?? null;
  let index = 0;

  while (hook && index < 64) {
    const effect = hook.memoizedState;
    if (isEffectObject(effect)) {
      const deps = effect.deps ?? null;
      const prevEffect =
        prevHook && isEffectObject(prevHook.memoizedState)
          ? (prevHook.memoizedState as EffectLike)
          : null;
      const prevDeps = prevEffect ? (prevEffect.deps ?? null) : undefined;

      let ran: boolean;
      let unstableChange = false;

      if (prevDeps === undefined) {
        ran = true;
      } else if (deps === null || prevDeps === null) {
        ran = true;
      } else {
        ran = !depsArrayEqual(prevDeps, deps);
        if (ran) {
          unstableChange = deps.every(
            (d, i) => Object.is(prevDeps[i], d) || looksRecreated(prevDeps[i], d),
          );
        }
      }

      out.push({ hookIndex: index, effect, deps, prevDeps, ran, unstableChange });
    }
    hook = hook.next;
    prevHook = prevHook?.next ?? null;
    index++;
  }
  return out;
}

export function getEffectDestroy(effect: EffectLike): unknown {
  return effect.inst ? effect.inst.destroy : effect.destroy;
}

const SOURCE_LIMIT = 280;

export function effectSource(effect: EffectLike): string {
  try {
    const src = String(effect.create);
    return src.length > SOURCE_LIMIT ? `${src.slice(0, SOURCE_LIMIT)}…` : src;
  } catch {
    return "";
  }
}

export function cleanupPattern(src: string): string | null {
  if (/\bsetInterval\s*\(/.test(src)) return "setInterval";
  if (/\baddEventListener\s*\(/.test(src)) return "addEventListener";
  if (/\.subscribe\s*\(/.test(src)) return "subscribe";
  if (/\bnew\s+(?:Intersection|Resize|Mutation)Observer\b/.test(src)) return "Observer";
  return null;
}

export function fetchWithoutAbort(src: string): boolean {
  return /\bfetch\s*\(/.test(src) && !/AbortController|\.signal\b|signal\s*[:,]/.test(src);
}
