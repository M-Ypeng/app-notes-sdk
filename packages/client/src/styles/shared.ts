export const SHARED_STYLES = `
  :host {
    --an-bg: #f5f5f7;
    --an-surface: rgba(255, 255, 255, 0.92);
    --an-surface-solid: #ffffff;
    --an-surface-2: rgba(246, 246, 248, 0.94);
    --an-border: rgba(60, 60, 67, 0.16);
    --an-border-strong: rgba(60, 60, 67, 0.24);
    --an-text: #1d1d1f;
    --an-text-muted: rgba(60, 60, 67, 0.64);
    --an-accent: #007aff;
    --an-accent-dim: #0066d6;
    --an-danger: #ff3b30;
    --an-success: #34c759;
    --an-info: #5ac8fa;
    --an-warning: #ff9500;
    --an-radius: 18px;
    --an-radius-sm: 12px;
    --an-radius-xs: 8px;
    --an-shadow: 0 18px 50px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.08);
    --an-font: 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', system-ui, sans-serif;
    --an-mono: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
    font-family: var(--an-font);
    font-size: 13px;
    color: var(--an-text);
    box-sizing: border-box;
  }
  *, *::before, *::after { box-sizing: border-box; }
  button, input, textarea, select { font-family: inherit; }
  button {
    border: 0;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
  input, textarea, select {
    width: 100%;
    border: 1px solid var(--an-border);
    border-radius: var(--an-radius-sm);
    background: rgba(247, 247, 249, 0.86);
    color: var(--an-text);
    padding: 10px 12px;
    font-size: 13px;
  }
  input:focus, textarea:focus, select:focus {
    outline: 3px solid rgba(0, 122, 255, 0.18);
    border-color: rgba(0, 122, 255, 0.48);
  }
  .an-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 7px 13px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 13px;
    transition: background 0.15s, border-color 0.15s, transform 0.1s, color 0.15s, box-shadow 0.15s;
  }
  .an-btn:active { transform: scale(0.98); }
  .an-btn-primary {
    background: var(--an-accent);
    color: #fff;
    box-shadow: 0 6px 18px rgba(0, 122, 255, 0.26);
  }
  .an-btn-primary:hover { background: var(--an-accent-dim); color: #fff; }
  .an-btn-ghost {
    border: 1px solid var(--an-border);
    color: var(--an-text-muted);
    background: rgba(255, 255, 255, 0.58);
  }
  .an-btn-ghost:hover {
    border-color: var(--an-border-strong);
    background: rgba(255, 255, 255, 0.9);
    color: var(--an-text);
  }
  .an-tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: rgba(0, 122, 255, 0.1);
    color: var(--an-accent);
  }
  .an-scroll {
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--an-border) transparent;
  }
  .an-dismiss {
    position: relative;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: rgba(60, 60, 67, 0.38);
    cursor: pointer;
    transition: color 0.12s ease, background 0.12s ease;
  }
  .an-dismiss::before,
  .an-dismiss::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 10px;
    height: 1px;
    background: currentColor;
    border-radius: 1px;
  }
  .an-dismiss::before {
    transform: translate(-50%, -50%) rotate(45deg);
  }
  .an-dismiss::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }
  .an-dismiss:hover {
    color: rgba(60, 60, 67, 0.72);
    background: rgba(60, 60, 67, 0.06);
  }
`;
