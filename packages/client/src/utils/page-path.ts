/** 当前页面路由（pathname + search + hash），用于备注锚点与跨页定位。 */
export const LOCATION_CHANGE_EVENT = 'app-notes:locationchange';

let historyPatched = false;

export function getCurrentPagePath(): string {
  if (typeof window === 'undefined' || !window.location) return '/';
  const { pathname, search, hash } = window.location;
  return `${pathname || '/'}${search || ''}${hash || ''}`;
}

export function normalizePagePath(path: string | undefined): string {
  if (!path) return '/';
  try {
    const url = new URL(path, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

export function isSamePagePath(a: string | undefined, b: string | undefined): boolean {
  return normalizePagePath(a) === normalizePagePath(b);
}

/** 与浏览器地址栏实时对比，避免 SPA 路由切换后仍用 init 时缓存的 pagePath。 */
export function isCurrentPagePath(pagePath: string | undefined): boolean {
  return isSamePagePath(pagePath, getCurrentPagePath());
}

/**
 * 监听 Vue Router / React Router 的 pushState、replaceState。
 * popstate 仅在浏览器前进/后退时触发，普通 programmatic 导航不会触发。
 */
export function installPagePathSync(): void {
  if (historyPatched || typeof window === 'undefined') return;
  historyPatched = true;

  const emit = (): void => {
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
  };

  const wrap =
    (original: History['pushState']) =>
    function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      emit();
      return result;
    };

  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
}
