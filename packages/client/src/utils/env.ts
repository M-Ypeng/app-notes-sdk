export function isDevEnvironment(): boolean {
  const host = globalThis.location?.hostname;
  if (!host) return true;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
}
