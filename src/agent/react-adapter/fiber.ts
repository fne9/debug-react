export interface FiberLike {
  tag: number;
  type: unknown;
  key: string | null;
  flags?: number;
  effectTag?: number;
  alternate: FiberLike | null;
  child: FiberLike | null;
  sibling: FiberLike | null;
  return: FiberLike | null;
  memoizedProps: Record<string, unknown> | null;
  memoizedState: unknown;
  stateNode?: unknown;
  actualDuration?: number;

  _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number } | null;
}

const FunctionComponent = 0;
const ClassComponent = 1;
const HostRoot = 3;
const HostComponent = 5;
const ContextProvider = 10;
const ForwardRef = 11;
const SuspenseComponent = 13;
const MemoComponent = 14;
const SimpleMemoComponent = 15;

const PerformedWork = 0b1;

const COMPONENT_TAGS = new Set([
  FunctionComponent,
  ClassComponent,
  ForwardRef,
  MemoComponent,
  SimpleMemoComponent,
]);

export function isComponentFiber(fiber: FiberLike): boolean {
  return COMPONENT_TAGS.has(fiber.tag);
}

export function didPerformWork(fiber: FiberLike): boolean {
  const flags = fiber.flags ?? fiber.effectTag ?? 0;
  return (flags & PerformedWork) !== 0;
}

function typeName(type: unknown): string | null {
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || null;
  }
  return null;
}

export function getFiberName(fiber: FiberLike): string {
  const type = fiber.type as {
    displayName?: string;
    render?: unknown;
    type?: unknown;
    _context?: { displayName?: string };
  } | null;

  switch (fiber.tag) {
    case FunctionComponent:
    case ClassComponent:
      return typeName(fiber.type) ?? "Anonymous";
    case ForwardRef:
      return type?.displayName || typeName(type?.render) || "ForwardRef";
    case MemoComponent:
    case SimpleMemoComponent:
      return type?.displayName || typeName(type?.type ?? fiber.type) || "Memo";
    default:
      return typeName(fiber.type) ?? "Anonymous";
  }
}

export interface RenderReason {
  type: "mount" | "props" | "state" | "parent";

  keys?: string[];

  hookIndex?: number;

  unnecessary?: boolean;
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

export function looksRecreated(prev: unknown, next: unknown): boolean {
  if (typeof prev === "function" && typeof next === "function") {
    return true;
  }
  if (isPlainObjectOrArray(prev) && isPlainObjectOrArray(next)) {
    return shallowEqual(prev, next);
  }
  return false;
}

interface HookLike {
  memoizedState: unknown;
  queue: unknown;
  next: HookLike | null;
}

function changedHookIndex(prev: unknown, next: unknown): number {
  let prevHook = prev as HookLike | null;
  let nextHook = next as HookLike | null;
  let index = 0;
  while (prevHook && nextHook && index < 64) {
    if (nextHook.queue != null && !Object.is(prevHook.memoizedState, nextHook.memoizedState)) {
      return index;
    }
    prevHook = prevHook.next;
    nextHook = nextHook.next;
    index++;
  }
  return -1;
}

export function computeReason(fiber: FiberLike): RenderReason {
  const alt = fiber.alternate;
  if (!alt) return { type: "mount" };

  const prevProps = alt.memoizedProps;
  const nextProps = fiber.memoizedProps;
  if (prevProps !== nextProps && prevProps && nextProps) {
    const keys: string[] = [];
    for (const key of new Set([...Object.keys(prevProps), ...Object.keys(nextProps)])) {
      if (!Object.is(prevProps[key], nextProps[key])) keys.push(key);
    }
    if (keys.length > 0) {
      const unnecessary = keys.every((k) => looksRecreated(prevProps[k], nextProps[k]));
      return { type: "props", keys, unnecessary };
    }
  }

  if (fiber.tag === ClassComponent) {
    if (!Object.is(alt.memoizedState, fiber.memoizedState)) return { type: "state" };
  } else {
    const hookIndex = changedHookIndex(alt.memoizedState, fiber.memoizedState);
    if (hookIndex >= 0) return { type: "state", hookIndex };
  }

  return { type: "parent" };
}

export function hasIndexKeyedChildren(fiber: FiberLike): boolean {
  const starts: (FiberLike | null)[] = [fiber.child];

  if (fiber.child && !fiber.child.sibling && fiber.child.child) {
    starts.push(fiber.child.child);
  }

  for (const start of starts) {
    let node = start;
    let index = 0;
    while (node && index < 30) {
      if (node.key !== String(index)) break;
      index++;
      node = node.sibling;
    }
    if (index >= 3 && (node === null || node === undefined)) return true;
    if (index >= 3 && node !== start) return true;
  }
  return false;
}

export function isProviderFiber(fiber: FiberLike): boolean {
  return fiber.tag === ContextProvider;
}

export function isSuspenseFiber(fiber: FiberLike): boolean {
  return fiber.tag === SuspenseComponent;
}

export function getProviderName(fiber: FiberLike): string {
  const type = fiber.type as {
    displayName?: string;
    _context?: { displayName?: string };
  } | null;
  return type?._context?.displayName || type?.displayName || "Context";
}

export function findNearestComponentName(fiber: FiberLike): string | null {
  let node: FiberLike | null = fiber.return;
  let hops = 0;
  while (node && hops++ < 50) {
    if (isComponentFiber(node)) {
      const name = getFiberName(node);
      if (name !== "Anonymous") return name;
    }
    node = node.return;
  }
  return null;
}

export function getFiberSource(fiber: FiberLike): string | undefined {
  const src = fiber._debugSource;
  if (!src || !src.fileName) return undefined;
  const line = src.lineNumber ?? 1;
  const col = src.columnNumber ?? 1;
  return `${src.fileName}:${line}:${col}`;
}

export function findHostElement(fiber: FiberLike): Element | null {
  let node: FiberLike | null = fiber.child;
  let visited = 0;
  while (node && visited++ < 50) {
    if (node.tag === HostComponent && node.stateNode instanceof Element) {
      return node.stateNode;
    }
    if (node.child) {
      node = node.child;
      continue;
    }
    while (node && node !== fiber && !node.sibling) {
      node = node.return;
    }
    if (!node || node === fiber) return null;
    node = node.sibling;
  }
  return null;
}

interface RootLike {
  current: FiberLike & { tag: typeof HostRoot };
}

const MAX_COMMIT_VISITS = 10_000;

export function visitCommittedComponents(
  rootUnknown: unknown,
  visit: (fiber: FiberLike) => void,
  visitSpecial?: (fiber: FiberLike) => void,
): void {
  const root = rootUnknown as RootLike | null;
  const rootFiber = root?.current;
  if (!rootFiber) return;

  const stack: FiberLike[] = [];
  for (let child = rootFiber.child, n = 0; child && n < MAX_COMMIT_VISITS; child = child.sibling, n++) {
    stack.push(child);
  }

  let visited = 0;
  while (stack.length > 0 && visited++ < MAX_COMMIT_VISITS) {
    const fiber = stack.pop()!;

    if (isComponentFiber(fiber) && didPerformWork(fiber)) {
      visit(fiber);
    }

    if (visitSpecial && (fiber.tag === ContextProvider || fiber.tag === SuspenseComponent)) {
      visitSpecial(fiber);
    }

    const prev = fiber.alternate;
    if (!prev || fiber.child !== prev.child) {
      for (let child = fiber.child, n = 0; child && n < MAX_COMMIT_VISITS; child = child.sibling, n++) {
        stack.push(child);
      }
    }
  }
}
