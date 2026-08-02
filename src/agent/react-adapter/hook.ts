export interface RendererInfo {
  id: number;
  version?: string;

  bundleType?: number;
}

interface DevtoolsHook {
  renderers: Map<number, unknown>;
  supportsFiber: boolean;
  isDisabled: boolean;
  checkDCE: (...args: unknown[]) => void;
  inject: (renderer: unknown) => number;
  onScheduleFiberRoot: (...args: unknown[]) => void;
  onCommitFiberRoot: (rendererId: number, root: unknown, ...rest: unknown[]) => void;
  onCommitFiberUnmount: (...args: unknown[]) => void;
  onPostCommitFiberRoot: (...args: unknown[]) => void;
  setStrictMode: (...args: unknown[]) => void;
}

export interface HookCallbacks {
  onInject: (renderer: RendererInfo) => void;
  onCommit: (root: unknown) => void;
}

export function installHook(callbacks: HookCallbacks): void {
  const win = window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook };
  const existing = win.__REACT_DEVTOOLS_GLOBAL_HOOK__;

  if (existing) {

    const prevInject = existing.inject?.bind(existing);
    existing.inject = (renderer: unknown) => {
      const id = prevInject ? prevInject(renderer) : 0;
      try {
        const r = renderer as { version?: string; bundleType?: number };
        callbacks.onInject({ id, version: r?.version, bundleType: r?.bundleType });
      } catch {

      }
      return id;
    };

    const prevCommit = existing.onCommitFiberRoot?.bind(existing);
    existing.onCommitFiberRoot = (rendererId, root, ...rest) => {
      try {
        callbacks.onCommit(root);
      } catch {

      }
      prevCommit?.(rendererId, root, ...rest);
    };
    return;
  }

  let counter = 0;
  const hook: DevtoolsHook = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    checkDCE() {},
    inject(renderer: unknown) {
      const id = ++counter;
      hook.renderers.set(id, renderer);
      try {
        const r = renderer as { version?: string; bundleType?: number };
        callbacks.onInject({ id, version: r?.version, bundleType: r?.bundleType });
      } catch {

      }
      return id;
    },
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_rendererId, root) {
      try {
        callbacks.onCommit(root);
      } catch {

      }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    setStrictMode() {},
  };

  Object.defineProperty(win, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
    value: hook,
    enumerable: false,
    configurable: true,
  });
}
