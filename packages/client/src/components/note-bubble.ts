import { SHARED_STYLES } from '../styles/shared.js';
import { TAG_LABELS, type FlatNote, type NoteComment, type NotesFile } from '../types.js';
import { findElementByAnchor, getAnchorHealth } from '../utils/dom-anchor.js';
import { clamp, escapeAttr, escapeHtml, tagClass } from '../utils/format.js';

const PIN_SIZE = 28;

const PIN_MARK_SVG = `
  <svg class="pin-mark" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <path
      fill="#fff"
      d="M191.825 155.411h639.133c31.777 0 60.641 12.979 81.549 33.885 20.908 20.908 33.886 49.78 33.886 81.547v386.981c0 31.773-12.978 60.642-33.886 81.55s-49.771 33.881-81.549 33.881H617.095c-51.358 65.264-86.005 97.265-115.505 96.842-34.341-0.48-51.522-33.026-64.004-96.842h-245.76c-31.77 0-60.641-12.973-81.547-33.881-20.908-20.908-33.885-49.776-33.885-81.55v-386.98c0-31.767 12.977-60.639 33.885-81.547 20.905-20.907 49.776-33.886 81.546-33.886zM321.3 397.295h4.778c26.955 0 48.999 22.043 48.999 48.999v0.006c0 26.955-22.043 49.005-48.999 49.005H321.3c-26.955 0-48.999-22.05-48.999-49.005v-0.006c0-26.955 22.044-48.999 48.999-48.999z m370.743 0h4.777c26.956 0 48.999 22.043 48.999 48.999v0.006c0 26.955-22.043 49.005-48.999 49.005h-4.777c-26.955 0-48.998-22.05-48.998-49.005v-0.006c0-26.955 22.043-48.999 48.998-48.999z m-188.393 0h4.779c26.953 0 48.997 22.043 48.997 48.999v0.006c0 26.955-22.044 49.005-48.997 49.005h-4.779c-26.953 0-48.999-22.05-48.999-49.005v-0.006c0-26.955 22.046-48.999 48.999-48.999z m327.308-190.478H191.825c-17.576 0-33.59 7.215-45.2 18.827-11.614 11.612-18.827 27.626-18.827 45.2v386.981c0 17.58 7.213 33.589 18.827 45.202 11.61 11.614 27.625 18.825 45.2 18.825H480.773l3.555 21.583c8.232 49.979 13.602 75.405 17.866 75.462 11.309 0.163 36.949-28.559 82.164-87.002l7.764-10.043h238.836c17.583 0 33.592-7.211 45.202-18.825 11.613-11.613 18.828-27.622 18.828-45.202V270.844c0-17.574-7.215-33.588-18.828-45.2-11.61-11.612-27.619-18.827-45.202-18.827z"
    />
  </svg>
`;

export class AppNotesBubble extends HTMLElement {
  static readonly tag = 'app-notes-bubble';

  private file: NotesFile | null = null;
  private note: FlatNote | null = null;
  private target: Element | null = null;
  private serverUrl = '';
  private pagePath = '/';
  private expanded = false;
  private raf = 0;
  private resizeObserver: ResizeObserver | null = null;
  private observedTarget: Element | null = null;

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
    this.observedTarget = null;
  }

  setContext(serverUrl: string, pagePath: string): void {
    const pathChanged = this.pagePath !== pagePath;
    this.serverUrl = serverUrl;
    this.pagePath = pagePath;
    if (pathChanged) this.target = null;
    if (this.note) this.syncView();
  }

  setFile(file: NotesFile, target: Element | null): void {
    const comments = getOpenComments(file);
    const primary = comments[0];
    if (!primary) {
      this.style.display = 'none';
      return;
    }
    this.file = file;
    this.setNote({ noteId: file.anchor.noteId, anchor: file.anchor, comment: primary }, target);
  }

  setNote(note: FlatNote, target: Element | null): void {
    const same =
      this.note?.noteId === note.noteId && this.note?.comment.id === note.comment.id;
    this.note = note;
    this.target = target;
    if (!same) this.expanded = false;
    this.dataset.commentId = note.comment.id;
    this.dataset.noteId = note.noteId;
    this.syncView();
    this.observeTarget(target);
    this.updatePosition(target);
  }

  getNote(): FlatNote | null {
    return this.note;
  }

  private reposition = (): void => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.updatePosition());
  };

  private getShellEl(): HTMLElement | null {
    return this.shadowRoot?.querySelector('.shell') ?? null;
  }

  private getBodyEl(): HTMLElement | null {
    return this.shadowRoot?.querySelector('.body') ?? null;
  }

  private getPinEl(): HTMLButtonElement | null {
    return this.shadowRoot?.querySelector<HTMLButtonElement>('.pin') ?? null;
  }

  private syncView(): void {
    if (!this.note) return;
    const count = this.file ? getOpenComments(this.file).length : 1;
    this.toggleAttribute('expanded', this.expanded);
    this.dataset.tag = this.note.comment.tags[0] ?? '';
    const shell = this.getShellEl();
    const pin = this.getPinEl();
    const body = this.getBodyEl();
    if (!shell || !pin || !body) return;
    shell.classList.toggle('expanded', this.expanded);
    pin.toggleAttribute('hidden', this.expanded);
    pin.style.display = this.expanded ? 'none' : '';
    body.toggleAttribute('hidden', !this.expanded);
    body.style.display = this.expanded ? 'block' : 'none';
    const label = count > 1 ? `查看 ${count} 条备注` : (this.note.comment.content.slice(0, 24) || '查看备注');
    pin.setAttribute('aria-label', label);
    pin.title = label;
    const badge = pin.querySelector<HTMLElement>('.count-badge');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count < 2;
    }
    if (this.expanded) {
      body.innerHTML = this.renderExpanded();
      this.wireExpandedActions();
    }
  }

  private renderExpanded(): string {
    const note = this.note!;
    const comments = this.file ? getOpenComments(this.file) : [note.comment];
    const { anchor } = note;
    const items = comments.map((comment) => this.renderComment(comment)).join('');
    return `
      <div class="detail-head">
        <span class="detail-title">备注详情${comments.length > 1 ? ` · ${comments.length} 条` : ''}</span>
        <button type="button" class="an-dismiss" data-action="collapse" aria-label="收起"></button>
      </div>
      <div class="thread">${items}</div>
      <p class="kv">锚点：<code>${escapeHtml(anchor.noteId)}</code></p>
      <p class="kv">页面：<code>${escapeHtml(anchor.pagePath)}</code></p>
      <p class="kv">健康度：<code>${getAnchorHealth(anchor)}</code></p>
    `;
  }

  private renderComment(comment: NoteComment): string {
    const tags =
      comment.tags.map((tag) => `<span class="tag ${tagClass(tag)}">${TAG_LABELS[tag]}</span>`).join('') ||
      '<span class="tag neutral">无标签</span>';
    const images = comment.images
      .map((path) => {
        const url = resolveAssetUrl(path, this.serverUrl);
        return `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer"><img src="${escapeAttr(url)}" alt="备注图片" /></a>`;
      })
      .join('');
    return `
      <article class="thread-item">
        <div class="detail-meta">
          ${tags}
          <b>${comment.role}</b>
          <span class="status">${comment.status === 'archived' ? '已归档' : '进行中'}</span>
        </div>
        <p class="content">${escapeHtml(comment.content) || '(图片备注)'}</p>
        ${images ? `<div class="images">${images}</div>` : ''}
        <p class="time">${new Date(comment.createdAt).toLocaleString()}</p>
        <div class="actions">
          <button type="button" class="an-btn an-btn-ghost" data-action="archive" data-comment-id="${escapeAttr(comment.id)}">归档</button>
        </div>
      </article>
    `;
  }

  private wireExpandedActions(): void {
    const root = this.shadowRoot;
    if (!root || !this.note) return;
    root.querySelector('[data-action="collapse"]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.collapse();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-action="archive"]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      const comment = this.findComment(button.dataset.commentId) ?? this.note!.comment;
      this.dispatchEvent(
        new CustomEvent('archive-note', {
          bubbles: true,
          composed: true,
          detail: {
            note: { noteId: this.note!.noteId, anchor: this.note!.anchor, comment },
            status: 'archived'
          }
        })
      );
    }));
  }

  private findComment(commentId: string | undefined): NoteComment | undefined {
    if (!commentId) return undefined;
    return this.file?.comments.find((comment) => comment.id === commentId);
  }

  private expand(): void {
    if (this.expanded) return;
    this.endHover();
    this.expanded = true;
    this.syncView();
    this.reposition();
  }

  private collapse(): void {
    if (!this.expanded) return;
    this.endHover();
    this.expanded = false;
    this.syncView();
    this.reposition();
  }

  private endHover(): void {
    this.dispatchEvent(new CustomEvent('bubble-hover-end', { bubbles: true, composed: true }));
  }

  updatePosition(target?: Element | null): void {
    if (!this.note) return;
    const health = getAnchorHealth(this.note.anchor);
    if (health === 'low' || health === 'invalid' || health === 'rebind_required') {
      this.style.display = 'none';
      return;
    }
    const resolved = findElementByAnchor(this.note.anchor);
    const el = target ?? resolved;
    this.target = resolved ?? el;
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

    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

    const pinLeft = clamp(rect.right - PIN_SIZE * 0.45, 8, viewportWidth - PIN_SIZE - 8);
    const pinTop = clamp(rect.top - PIN_SIZE * 0.45, 8, viewportHeight - PIN_SIZE - 8);

    if (!this.expanded) {
      this.style.left = `${pinLeft}px`;
      this.style.top = `${pinTop}px`;
    } else {
      const bubbleRect = this.getBoundingClientRect();
      const width = bubbleRect.width || Math.min(300, viewportWidth - 24);
      const height = bubbleRect.height || 200;
      const gap = 10;
      const pinCenterY = pinTop + PIN_SIZE / 2;
      let left = pinLeft + PIN_SIZE + gap;
      let top = pinCenterY - height / 2;
      if (left + width > viewportWidth - 8) left = pinLeft - width - gap;
      if (left < 8) left = clamp(pinLeft + PIN_SIZE - width, 8, viewportWidth - width - 8);
      top = clamp(top, 8, viewportHeight - height - 8);
      this.style.left = `${left}px`;
      this.style.top = `${top}px`;
    }

    this.style.visibility = 'visible';
  }

  private observeTarget(target: Element | null): void {
    if (target === this.observedTarget) return;
    this.resizeObserver?.disconnect();
    this.observedTarget = target;
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
          z-index: 2147483630;
          pointer-events: auto;
          width: ${PIN_SIZE}px;
          height: ${PIN_SIZE}px;
        }
        :host([expanded]) {
          width: min(300px, calc(100vw - 24px));
          height: auto;
        }
        .shell {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .shell.expanded .pin {
          display: none !important;
          visibility: hidden;
          pointer-events: none;
        }
        .pin {
          position: relative;
          --pin-color: #007aff;
          width: ${PIN_SIZE}px;
          height: ${PIN_SIZE}px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1.5px solid rgba(255, 255, 255, 0.92);
          border-radius: 999px;
          background: var(--pin-color);
          color: var(--pin-color);
          cursor: pointer;
          padding: 0;
          box-shadow: 0 2px 10px rgba(15, 23, 42, 0.16);
          transition: transform 0.14s ease, box-shadow 0.14s ease;
        }
        .pin:hover {
          transform: scale(1.06);
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.2);
        }
        .pin:active {
          transform: scale(0.98);
        }
        .pin-mark {
          width: 16px;
          height: 16px;
          display: block;
        }
        .count-badge {
          position: absolute;
          right: -7px;
          top: -7px;
          min-width: 17px;
          height: 17px;
          padding: 0 5px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #fff;
          border-radius: 999px;
          background: #ff3b30;
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          line-height: 1;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
        }
        .count-badge[hidden] { display: none; }
        :host([data-tag="疑问"]) .pin { --pin-color: #0a84ff; }
        :host([data-tag="变更建议"]) .pin { --pin-color: #ff9500; }
        :host([data-tag="逻辑补充"]) .pin { --pin-color: #34a853; }
        :host([data-tag="视觉规范"]) .pin { --pin-color: #af52de; }
        .body {
          border: 1px solid var(--an-border);
          border-top: 2px solid var(--an-accent);
          border-radius: 14px;
          background: var(--an-surface);
          box-shadow: var(--an-shadow);
          padding: 12px 14px;
          backdrop-filter: blur(18px) saturate(1.28);
          -webkit-backdrop-filter: blur(18px) saturate(1.28);
        }
        :host([data-tag="疑问"]) .body { border-top-color: #0a84ff; }
        :host([data-tag="变更建议"]) .body { border-top-color: #ff9500; }
        :host([data-tag="逻辑补充"]) .body { border-top-color: #34a853; }
        :host([data-tag="视觉规范"]) .body { border-top-color: #af52de; }
        .detail-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .detail-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--an-text-muted);
        }
        .detail-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          color: var(--an-accent);
          font-size: 11px;
          margin-bottom: 2px;
        }
        .status { color: var(--an-text-muted); font-weight: 500; }
        .content {
          margin: 7px 0 0;
          line-height: 1.5;
          color: var(--an-text);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .thread {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: min(390px, calc(100vh - 220px));
          overflow: auto;
          padding-right: 2px;
        }
        .thread-item {
          padding: 0 0 10px;
          border-bottom: 1px solid var(--an-border);
        }
        .thread-item:last-child {
          padding-bottom: 0;
          border-bottom: 0;
        }
        .tag {
          display: inline-flex;
          align-items: center;
          min-height: 20px;
          padding: 2px 7px;
          border-radius: 999px;
          border: 1px solid transparent;
          font-size: 11px;
          font-weight: 650;
        }
        .tag-question { color: #0a84ff; background: rgba(10, 132, 255, 0.1); border-color: rgba(10, 132, 255, 0.22); }
        .tag-change { color: #ff9500; background: rgba(255, 149, 0, 0.12); border-color: rgba(255, 149, 0, 0.24); }
        .tag-logic { color: #34a853; background: rgba(52, 168, 83, 0.12); border-color: rgba(52, 168, 83, 0.24); }
        .tag-visual { color: #af52de; background: rgba(175, 82, 222, 0.12); border-color: rgba(175, 82, 222, 0.24); }
        .tag.neutral { color: var(--an-text-muted); background: rgba(60,60,67,.08); border-color: var(--an-border); }
        .kv, .time {
          margin: 4px 0 0;
          color: var(--an-text-muted);
          font-size: 11px;
          line-height: 1.4;
        }
        code { font-family: var(--an-mono); }
        .images {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin: 8px 0 4px;
        }
        .images img {
          max-width: 100%;
          max-height: 120px;
          object-fit: contain;
          border-radius: 8px;
          border: 1px solid var(--an-border);
          background: #fff;
        }
        .actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 10px;
        }
        .actions .an-btn {
          min-height: 28px;
          padding: 4px 10px;
          font-size: 12px;
        }
      </style>
      <div class="shell">
        <button type="button" class="pin" aria-label="查看备注">${PIN_MARK_SVG}<span class="count-badge" hidden></span></button>
        <div class="body" hidden></div>
      </div>
    `;

    const pin = root.querySelector('.pin')!;
    pin.addEventListener('click', (event) => {
      event.stopPropagation();
      this.expand();
    });
  }
}

function resolveAssetUrl(path: string, serverUrl: string): string {
  if (/^(https?:|blob:|data:)/.test(path)) return path;
  if (path.startsWith('memory:')) return path;
  const base = serverUrl.replace(/\/$/, '');
  if (path.startsWith('assets/')) return `${base}/api/${path}`;
  return `${base}/api/assets/${path.split('/').pop()}`;
}

function getOpenComments(file: NotesFile): NoteComment[] {
  return file.comments
    .filter((comment) => comment.status !== 'archived')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

if (!customElements.get(AppNotesBubble.tag)) {
  customElements.define(AppNotesBubble.tag, AppNotesBubble);
}
