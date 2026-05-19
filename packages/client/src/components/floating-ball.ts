import { SHARED_STYLES } from '../styles/shared.js';

type ToolAction = 'start-selection' | 'toggle-panel' | 'toggle-bubbles';

interface ToolItem {
  action: ToolAction;
  label: string;
  icon: string;
  primary?: boolean;
}

const TOOLS: ToolItem[] = [
  {
    action: 'start-selection',
    label: '新增标注',
    primary: true,
    icon: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14M12 5v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `
  },
  {
    action: 'toggle-panel',
    label: '备注列表',
    icon: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7h12M6 12h12M6 17h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `
  },
  {
    action: 'toggle-bubbles',
    label: '显示/隐藏全部标注',
    icon: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 12s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" fill="none" stroke="currentColor" stroke-width="1.7"/>
      </svg>
    `
  }
];

export class AppNotesFloatingBall extends HTMLElement {
  static readonly tag = 'app-notes-floating-ball';

  private dragging = false;
  private offsetX = 0;
  private offsetY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.render();
    }
  }

  private render(): void {
    const root = this.shadowRoot!;
    root.innerHTML = `
      <style>${SHARED_STYLES}
        :host {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 2147483640;
          display: block;
        }
        .dock {
          width: 48px;
          padding: 8px 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(60, 60, 67, 0.11);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.88);
          color: rgba(60, 60, 67, 0.62);
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14), 0 2px 8px rgba(15, 23, 42, 0.06);
          backdrop-filter: blur(18px) saturate(160%);
          -webkit-backdrop-filter: blur(18px) saturate(160%);
        }
        .tool {
          position: relative;
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          color: rgba(60, 60, 67, 0.62);
          transition: color 0.16s, background 0.16s, transform 0.16s, box-shadow 0.16s;
        }
        .tool svg {
          width: 22px;
          height: 22px;
          display: block;
        }
        .tool:hover {
          color: #1d1d1f;
          background: rgba(0, 0, 0, 0.045);
          transform: translateY(-1px);
        }
        .tool.primary {
          background: var(--an-accent);
          color: #fff;
          box-shadow: 0 6px 16px rgba(0, 122, 255, 0.24);
        }
        .tool.primary:hover {
          background: #147ce5;
          color: #fff;
        }
        .tool::after {
          content: attr(aria-label);
          position: absolute;
          right: calc(100% + 12px);
          top: 50%;
          transform: translateY(-50%);
          max-width: 120px;
          padding: 6px 8px;
          border-radius: 999px;
          background: rgba(29, 29, 31, 0.88);
          color: #fff;
          font-size: 12px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.12s, transform 0.12s;
        }
        .tool:hover::after {
          opacity: 1;
          transform: translate(-2px, -50%);
        }
      </style>
      <div class="dock" part="dock">
        ${TOOLS.map((tool) => `
          <button
            class="tool ${tool.primary ? 'primary' : ''}"
            data-action="${tool.action}"
            aria-label="${tool.label}"
            title="${tool.label}"
            type="button"
          >${tool.icon}</button>
        `).join('')}
      </div>
    `;

    root.querySelector('.dock')!.addEventListener('pointerdown', (event) => this.startDrag(event as PointerEvent));
    root.querySelectorAll<HTMLButtonElement>('.tool').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
      button.addEventListener('click', () => {
        if (this.dragging) return;
        this.emitAction(button.dataset.action as ToolAction);
      });
    });
  }

  private emitAction(action: ToolAction): void {
    if (action === 'toggle-bubbles') {
      this.dispatchEvent(new CustomEvent('toolbar-toggle-bubbles', { bubbles: true, composed: true }));
      return;
    }
    this.dispatchEvent(new CustomEvent(action, { bubbles: true, composed: true }));
  }

  private startDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.dragging = false;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    const rect = this.getBoundingClientRect();
    this.offsetX = event.clientX - rect.left;
    this.offsetY = event.clientY - rect.top;

    const move = (moveEvent: PointerEvent): void => {
      const moved = Math.hypot(moveEvent.clientX - this.pointerDownX, moveEvent.clientY - this.pointerDownY);
      if (moved < 4) return;
      this.dragging = true;
      this.style.left = `${moveEvent.clientX - this.offsetX}px`;
      this.style.top = `${moveEvent.clientY - this.offsetY}px`;
      this.style.right = 'auto';
      this.style.bottom = 'auto';
    };
    const up = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      window.setTimeout(() => { this.dragging = false; }, 0);
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }
}

if (!customElements.get(AppNotesFloatingBall.tag)) {
  customElements.define(AppNotesFloatingBall.tag, AppNotesFloatingBall);
}
