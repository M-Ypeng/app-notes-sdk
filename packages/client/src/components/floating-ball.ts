import { SHARED_STYLES } from '../styles/shared.js';
import type { AnchorRect } from '../types.js';
import { clamp } from '../utils/format.js';

type ToolAction = 'start-selection' | 'toggle-panel' | 'toggle-bubbles';

interface ToolItem {
  action: ToolAction;
  label: string;
  icon: string;
  primary?: boolean;
}

interface FloatingPositionCache {
  version: 1;
  left: number;
  top: number;
  viewportWidth: number;
  viewportHeight: number;
  relX: number;
  relY: number;
}

const POSITION_CACHE_KEY = 'app-notes:floating-ball-position';
const EDGE_GAP = 8;

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
  private suppressNextClick = false;
  private lastLeft: number | null = null;
  private lastTop: number | null = null;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.render();
    }
    requestAnimationFrame(() => this.restorePosition());
    window.addEventListener('resize', this.clampCachedPosition);
    window.visualViewport?.addEventListener('resize', this.clampCachedPosition);
  }

  disconnectedCallback(): void {
    window.removeEventListener('resize', this.clampCachedPosition);
    window.visualViewport?.removeEventListener('resize', this.clampCachedPosition);
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
          cursor: grab;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
        }
        .dock.dragging {
          cursor: grabbing;
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
      button.addEventListener('click', (event) => {
        if (this.dragging || this.suppressNextClick) {
          event.preventDefault();
          event.stopPropagation();
          this.suppressNextClick = false;
          return;
        }
        this.emitAction(button.dataset.action as ToolAction, toPlainRect(button.getBoundingClientRect()));
      });
    });
  }

  private emitAction(action: ToolAction, rect: AnchorRect): void {
    if (action === 'toggle-bubbles') {
      this.dispatchEvent(new CustomEvent('toolbar-toggle-bubbles', { bubbles: true, composed: true }));
      return;
    }
    this.dispatchEvent(new CustomEvent(action, { bubbles: true, composed: true, detail: { rect } }));
  }

  private startDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.dragging = false;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    const rect = this.getBoundingClientRect();
    this.offsetX = event.clientX - rect.left;
    this.offsetY = event.clientY - rect.top;
    const dock = this.shadowRoot?.querySelector<HTMLElement>('.dock');

    let dragStarted = false;
    const move = (moveEvent: PointerEvent): void => {
      const moved = Math.hypot(moveEvent.clientX - this.pointerDownX, moveEvent.clientY - this.pointerDownY);
      if (moved < 4) return;
      if (!dragStarted) {
        dragStarted = true;
        this.dispatchEvent(new CustomEvent('toolbar-drag-start', { bubbles: true, composed: true }));
      }
      this.dragging = true;
      this.suppressNextClick = true;
      dock?.classList.add('dragging');
      const width = rect.width;
      const height = rect.height;
      this.applyPosition(moveEvent.clientX - this.offsetX, moveEvent.clientY - this.offsetY, width, height);
    };
    const up = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      dock?.classList.remove('dragging');
      this.savePosition();
      window.setTimeout(() => { this.dragging = false; }, 60);
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  private restorePosition(): void {
    const cached = readPositionCache();
    if (!cached) return;
    const rect = this.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const left = Number.isFinite(cached.relX) ? cached.relX * viewportWidth : cached.left;
    const top = Number.isFinite(cached.relY) ? cached.relY * viewportHeight : cached.top;
    this.applyPosition(left, top, rect.width, rect.height);
  }

  private clampCachedPosition = (): void => {
    if (this.lastLeft === null || this.lastTop === null) return;
    const rect = this.getBoundingClientRect();
    this.applyPosition(this.lastLeft, this.lastTop, rect.width, rect.height);
    this.savePosition();
  };

  private applyPosition(left: number, top: number, width: number, height: number): void {
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const nextLeft = clamp(left, EDGE_GAP, viewportWidth - width - EDGE_GAP);
    const nextTop = clamp(top, EDGE_GAP, viewportHeight - height - EDGE_GAP);
    this.lastLeft = nextLeft;
    this.lastTop = nextTop;
    this.style.left = `${nextLeft}px`;
    this.style.top = `${nextTop}px`;
    this.style.right = 'auto';
    this.style.bottom = 'auto';
  }

  private savePosition(): void {
    if (this.lastLeft === null || this.lastTop === null) return;
    try {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const cache: FloatingPositionCache = {
        version: 1,
        left: this.lastLeft,
        top: this.lastTop,
        viewportWidth,
        viewportHeight,
        relX: viewportWidth > 0 ? this.lastLeft / viewportWidth : 0,
        relY: viewportHeight > 0 ? this.lastTop / viewportHeight : 0
      };
      window.localStorage.setItem(POSITION_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Ignore storage failures in private mode or restricted host pages.
    }
  }
}

function toPlainRect(rect: DOMRect): AnchorRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function readPositionCache(): FloatingPositionCache | null {
  try {
    const raw = window.localStorage.getItem(POSITION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FloatingPositionCache>;
    if (parsed.version !== 1 || typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null;
    return {
      version: 1,
      left: parsed.left,
      top: parsed.top,
      viewportWidth: typeof parsed.viewportWidth === 'number' ? parsed.viewportWidth : window.innerWidth,
      viewportHeight: typeof parsed.viewportHeight === 'number' ? parsed.viewportHeight : window.innerHeight,
      relX: typeof parsed.relX === 'number' ? parsed.relX : parsed.left / (parsed.viewportWidth || window.innerWidth || 1),
      relY: typeof parsed.relY === 'number' ? parsed.relY : parsed.top / (parsed.viewportHeight || window.innerHeight || 1)
    };
  } catch {
    return null;
  }
}

if (!customElements.get(AppNotesFloatingBall.tag)) {
  customElements.define(AppNotesFloatingBall.tag, AppNotesFloatingBall);
}
