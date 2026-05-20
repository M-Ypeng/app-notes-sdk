import { SHARED_STYLES } from '../styles/shared.js';

export class AppNotesSelectionOverlay extends HTMLElement {
  static readonly tag = 'app-notes-selection-overlay';

  private highlightEl: HTMLDivElement | null = null;
  private labelEl: HTMLDivElement | null = null;
  private hoveredTarget: Element | null = null;
  private active = false;

  private onMouseMove = (event: MouseEvent): void => this.handleHover(event);
  private onClick = (event: MouseEvent): void => this.handleClick(event);
  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.cancel();
  };

  connectedCallback(): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.render();
    }
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.style.display = 'block';
    document.addEventListener('mousemove', this.onMouseMove, true);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('keydown', this.onKeyDown, true);
    document.body.style.cursor = 'crosshair';
  }

  cancel(): void {
    if (!this.active) return;
    this.active = false;
    this.style.display = 'none';
    this.clearHighlight();
    document.removeEventListener('mousemove', this.onMouseMove, true);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.body.style.cursor = '';
    this.dispatchEvent(new CustomEvent('selection-cancel', { bubbles: true, composed: true }));
  }

  private render(): void {
    const root = this.shadowRoot!;
    root.innerHTML = `
      <style>${SHARED_STYLES}
        :host {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 2147483638;
          pointer-events: none;
        }
        .banner {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--an-surface);
          border: 1px solid var(--an-border);
          border-radius: 999px;
          padding: 10px 14px;
          box-shadow: var(--an-shadow);
          pointer-events: auto;
          backdrop-filter: blur(18px) saturate(1.25);
          -webkit-backdrop-filter: blur(18px) saturate(1.25);
        }
        kbd {
          padding: 3px 7px;
          border-radius: 6px;
          background: var(--an-surface-2);
          border: 1px solid var(--an-border);
          font-family: var(--an-mono);
          font-size: 11px;
        }
      </style>
      <div class="banner">
        <span>点击目标元素添加备注</span>
        <kbd>Esc</kbd>
        <button class="an-btn an-btn-ghost" id="cancel">取消</button>
      </div>
    `;
    const cancel = root.getElementById('cancel')!;
    cancel.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    cancel.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    });
    this.ensureFloatingHints();
  }

  private ensureFloatingHints(): void {
    if (!this.highlightEl) {
      this.highlightEl = document.createElement('div');
      this.highlightEl.style.cssText = `
        position: fixed;
        display: none;
        pointer-events: none;
        z-index: 2147483637;
        border: 2px solid #007aff;
        background: rgba(0, 122, 255, 0.08);
        border-radius: 10px;
        box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.08);
        transition: top 0.05s, left 0.05s, width 0.05s, height 0.05s;
      `;
      document.body.appendChild(this.highlightEl);
    }
    if (!this.labelEl) {
      this.labelEl = document.createElement('div');
      this.labelEl.style.cssText = `
        position: fixed;
        display: none;
        pointer-events: none;
        z-index: 2147483638;
        max-width: 320px;
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(60, 60, 67, 0.16);
        color: #1d1d1f;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        font: 12px/1.4 'SF Pro Text', 'PingFang SC', system-ui, sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        backdrop-filter: blur(12px);
      `;
      document.body.appendChild(this.labelEl);
    }
  }

  private handleHover(event: MouseEvent): void {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || this.isSdkElement(target)) {
      this.clearHighlight();
      return;
    }
    const el = this.findAnnotatable(target);
    if (!el) {
      this.clearHighlight();
      return;
    }
    this.hoveredTarget = el;
    this.renderHighlight(el);
  }

  private renderHighlight(el: Element): void {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this.clearHighlight();
      return;
    }
    this.highlightEl!.style.display = 'block';
    this.highlightEl!.style.top = `${rect.top}px`;
    this.highlightEl!.style.left = `${rect.left}px`;
    this.highlightEl!.style.width = `${rect.width}px`;
    this.highlightEl!.style.height = `${rect.height}px`;

    this.labelEl!.style.display = 'block';
    this.labelEl!.textContent = this.describeElement(el);
    this.labelEl!.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 328))}px`;
    this.labelEl!.style.top = `${Math.max(8, rect.top - 34)}px`;
  }

  private handleClick(event: MouseEvent): void {
    if (!this.active) return;
    if (this.isSdkEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = this.hoveredTarget ?? document.elementFromPoint(event.clientX, event.clientY);
    if (!target || this.isSdkElement(target)) return;
    const element = this.findAnnotatable(target);
    this.cancel();
    this.dispatchEvent(new CustomEvent('element-selected', {
      bubbles: true,
      composed: true,
      detail: { element }
    }));
  }

  private findAnnotatable(el: Element): Element {
    const dataNoteEl = el.closest('[data-note-id]');
    if (dataNoteEl && !this.isSdkElement(dataNoteEl)) return dataNoteEl;
    let current: Element | null = el;
    while (current && current !== document.body && current !== document.documentElement) {
      if (this.isSdkElement(current)) break;
      if (current.children.length === 0) return current;
      current = current.parentElement;
    }
    return el;
  }

  private describeElement(el: Element): string {
    const noteId = el.getAttribute('data-note-id');
    if (noteId) return `${el.tagName.toLowerCase()}  data-note-id="${noteId}"`;
    const id = el.id ? `#${el.id}` : '';
    const classes = typeof el.className === 'string'
      ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).map((name) => `.${name}`).join('')
      : '';
    return `${el.tagName.toLowerCase()}${id}${classes}`;
  }

  private clearHighlight(): void {
    this.hoveredTarget = null;
    if (this.highlightEl) this.highlightEl.style.display = 'none';
    if (this.labelEl) this.labelEl.style.display = 'none';
  }

  private isSdkElement(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    return tag.startsWith('app-notes-') || !!el.closest('app-notes-root');
  }

  private isSdkEvent(event: Event): boolean {
    return event.composedPath().some((item) => item instanceof Element && this.isSdkElement(item));
  }

  disconnectedCallback(): void {
    this.cancel();
    this.highlightEl?.remove();
    this.labelEl?.remove();
  }
}

if (!customElements.get(AppNotesSelectionOverlay.tag)) {
  customElements.define(AppNotesSelectionOverlay.tag, AppNotesSelectionOverlay);
}
