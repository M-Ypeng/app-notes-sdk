/** 路由切换 / 响应式布局后 DOM 可能尚未稳定，分阶段重试回调。 */
export function scheduleAfterDomSettle(callback: () => void): () => void {
  const timers: number[] = [];
  const run = (): void => callback();

  run();
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
  timers.push(window.setTimeout(run, 100));
  timers.push(window.setTimeout(run, 320));

  return () => {
    for (const id of timers) window.clearTimeout(id);
  };
}
