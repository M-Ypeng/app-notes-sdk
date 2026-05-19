import { SHARED_STYLES } from '../styles/shared.js';
import { TAG_LABELS, type FlatNote } from '../types.js';
import { findElementByAnchor, getAnchorHealth } from '../utils/dom-anchor.js';

export class AppNotesBubble extends HTMLElement {
  static readonly tag = 'app-notes-bubble';

  private note: FlatNote | null = null;
  private target: Element | null = null;
  private raf = 0;
  private resizeObserver: ResizeObserver | null = null;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.render();
    }
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    window.visualViewport?.addEventListener('resize', this.reposition);
    this.resizeObserver ??= new ResizeObserver(this.reposition);
  }

  disconnectedCallback(): void {
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
  }

  setNote(note: FlatNote, target: Element | null): void {
    this.note = note;
    this.target = target;
    this.dataset.commentId = note.comment.id;
    this.dataset.noteId = note.noteId;
    this.updateContent();
    this.observeTarget(target);
    this.updatePosition(target);
  }

  private reposition = (): void => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.updatePosition());
  };

  private updateContent(): void {
    if (!this.note || !this.shadowRoot) return;
    const body = this.shadowRoot.querySelector('.body');
    if (!body) return;
    const { comment } = this.note;
    const tags = comment.tags.map((tag) => `<span class="an-tag">${TAG_LABELS[tag]}</span>`).join('');
    const summary = escapeHtml(comment.content.slice(0, 48) || '(图片备注)');
    body.innerHTML = `
      <div class="meta"><b>${comment.role}</b>${tags}</div>
      <p>${summary}${comment.content.length > 48 ? '...' : ''}</p>
      ${comment.images.length ? `<span class="images">${comment.images.length} 张图片</span>` : ''}
    `;
  }

  updatePosition(target?: Element | null): void {
    if (!this.note) return;
    const health = getAnchorHealth(this.note.anchor);
    if (health === 'low' || health === 'invalid' || health === 'rebind_required') {
      this.style.display = 'none';
      return;
    }
    const el = target ?? this.target ?? findElementByAnchor(this.note.anchor);
    this.target = el;
    this.observeTarget(el);
    if (!el) {
      this.style.display = 'none';
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      this.style.display = 'none';
      return;
    }
    this.style.display = 'block';
    this.style.visibility = 'hidden';
    this.style.left = '0px';
    this.style.top = '0px';
    const bubbleRect = this.getBoundingClientRect();
    const width = bubbleRect.width || 220;
    const height = bubbleRect.height || 80;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const gap = 12;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let left = rect.right + gap;
    let top = centerY - height / 2;
    if (left + width > viewportWidth - 8) left = rect.left - width - gap;
    if (left < 8) left = clamp(centerX - width / 2, 8, viewportWidth - width - 8);
    top = clamp(top, 8, viewportHeight - height - 8);
    this.style.left = `${left}px`;
    this.style.top = `${top}px`;
    this.style.visibility = 'visible';
    this.updateConnector(centerX, centerY, left, top, width, height);
  }

  private updateConnector(targetX: number, targetY: number, left: number, top: number, width: number, height: number): void {
    const pin = this.shadowRoot?.querySelector<HTMLElement>('.pin');
    const line = this.shadowRoot?.querySelector<SVGLineElement>('.line');
    if (pin) {
      pin.style.left = `${targetX}px`;
      pin.style.top = `${targetY}px`;
    }
    if (line) {
      const anchorX = targetX < left ? left : left + width;
      const anchorY = clamp(targetY, top + 12, top + height - 12);
      line.setAttribute('x1', String(targetX));
      line.setAttribute('y1', String(targetY));
      line.setAttribute('x2', String(anchorX));
      line.setAttribute('y2', String(anchorY));
    }
  }

  private observeTarget(target: Element | null): void {
    this.resizeObserver?.disconnect();
    if (target) this.resizeObserver?.observe(target);
    this.resizeObserver?.observe(document.documentElement);
  }

  private render(): void {
    const root = this.shadowRoot!;
    root.innerHTML = `
      <style>${SHARED_STYLES}
        :host {
          display: none;
          position: fixed;
          width: 220px;
          z-index: 2147483630;
          pointer-events: auto;
        }
        .connector {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: -1;
        }
        .line {
          stroke: var(--an-accent);
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-dasharray: 4 5;
          opacity: 0.72;
        }
        .pin {
          position: fixed;
          width: 20px;
          height: 20px;
          margin: -10px 0 0 -10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.72);
          border: 2px dashed var(--an-accent);
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12), 0 4px 12px rgba(0,0,0,0.12);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .card {
          border: 1px solid var(--an-border);
          border-top: 2px solid var(--an-accent);
          border-radius: 14px;
          background: var(--an-surface);
          box-shadow: var(--an-shadow);
          padding: 10px 12px;
          cursor: pointer;
          backdrop-filter: blur(18px) saturate(1.28);
          -webkit-backdrop-filter: blur(18px) saturate(1.28);
        }
        .meta {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          color: var(--an-accent);
          font-size: 11px;
        }
        p { margin: 7px 0 0; line-height: 1.45; color: var(--an-text); }
        .images { display: inline-block; margin-top: 4px; color: var(--an-text-muted); font-size: 11px; }
      </style>
      <svg class="connector" aria-hidden="true"><line class="line" x1="0" y1="0" x2="0" y2="0"></line></svg>
      <button class="pin" type="button" aria-label="打开备注"></button>
      <div class="card"><div class="body"></div></div>
    `;
    const emit = (): void => {
      if (!this.note) return;
      this.dispatchEvent(new CustomEvent('bubble-click', { bubbles: true, composed: true, detail: { note: this.note } }));
    };
    root.querySelector('.card')!.addEventListener('click', emit);
    root.querySelector('.pin')!.addEventListener('click', emit);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

if (!customElements.get(AppNotesBubble.tag)) {
  customElements.define(AppNotesBubble.tag, AppNotesBubble);
}
