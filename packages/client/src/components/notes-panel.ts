import { SHARED_STYLES } from '../styles/shared.js';
import { TAG_LABELS, type FlatNote } from '../types.js';
import type { NotesStore } from '../services/store.js';
import { getAnchorHealth } from '../utils/dom-anchor.js';

export class AppNotesPanel extends HTMLElement {
  static readonly tag = 'app-notes-panel';

  private store: NotesStore | null = null;
  private serverUrl = '';
  private pagePath = '/';
  private unsub: (() => void) | null = null;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.render();
    }
  }

  setStore(store: NotesStore, serverUrl: string, pagePath: string): void {
    this.store = store;
    this.serverUrl = serverUrl;
    this.pagePath = pagePath;
    this.unsub?.();
    this.unsub = store.subscribe(() => this.refresh());
    this.refresh();
  }

  open(): void {
    this.style.display = 'flex';
    this.setAttribute('open', '');
    this.refresh();
  }

  close(): void {
    this.style.display = 'none';
    this.removeAttribute('open');
    this.hideDetail();
  }

  showDetail(note: FlatNote): void {
    const detail = this.shadowRoot?.getElementById('detail');
    const list = this.shadowRoot?.getElementById('list-view');
    if (!detail || !list) return;
    list.style.display = 'none';
    detail.style.display = 'block';
    const images = note.comment.images.map((path) => {
      const url = path.startsWith('http') || path.startsWith('memory:') ? path : `${this.serverUrl}/api/assets/${path.split('/').pop()}`;
      return `<img src="${url}" alt="备注图片" />`;
    }).join('');
    const tags = note.comment.tags.map((tag) => TAG_LABELS[tag]).join(' ') || '无标签';
    const isCurrent = normalizePath(note.anchor.pagePath) === normalizePath(this.pagePath);
    detail.innerHTML = `
      <button class="an-btn an-btn-ghost back">返回列表</button>
      <div class="detail-meta">
        <span class="an-tag">${tags}</span>
        <b>${note.comment.role}</b>
        <span>${note.comment.status === 'archived' ? '已归档' : '进行中'}</span>
      </div>
      <p class="content">${escapeHtml(note.comment.content)}</p>
      ${images ? `<div class="images">${images}</div>` : ''}
      <p class="kv">锚点：<code>${escapeHtml(note.anchor.noteId)}</code></p>
      <p class="kv">页面：<code>${escapeHtml(note.anchor.pagePath)}</code></p>
      <p class="kv">健康度：<code>${getAnchorHealth(note.anchor)}</code></p>
      <p class="time">${new Date(note.comment.createdAt).toLocaleString()}</p>
      <div class="actions">
        <button class="an-btn an-btn-ghost" id="archive">${note.comment.status === 'open' ? '归档备注' : '重新打开'}</button>
        <button class="an-btn ${isCurrent ? 'an-btn-ghost' : 'an-btn-primary'}" id="locate">${isCurrent ? '定位元素' : '前往页面'}</button>
      </div>
      <p class="message" id="message" hidden></p>
    `;
    detail.querySelector('.back')!.addEventListener('click', () => this.hideDetail());
    detail.querySelector('#archive')!.addEventListener('click', () => this.emitArchive(note, note.comment.status === 'open' ? 'archived' : 'open'));
    detail.querySelector('#locate')!.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('locate-element', { bubbles: true, composed: true, detail: { note } }));
    });
  }

  showLocateMessage(message: string, tone: 'success' | 'warning' | 'info' = 'info'): void {
    const el = this.shadowRoot?.getElementById('message');
    if (!el) return;
    el.className = `message ${tone}`;
    el.textContent = message;
    el.hidden = false;
  }

  hideDetail(): void {
    const detail = this.shadowRoot?.getElementById('detail');
    const list = this.shadowRoot?.getElementById('list-view');
    if (detail) detail.style.display = 'none';
    if (list) list.style.display = 'flex';
  }

  private refresh(): void {
    if (!this.store || !this.shadowRoot) return;
    const list = this.shadowRoot.getElementById('note-list');
    if (!list) return;
    const visible = this.store.areBubblesVisible();
    this.shadowRoot.getElementById('toggle')!.textContent = visible ? '隐藏所有提示' : '显示所有提示';
    const notes = this.store.getFlatNotes();
    const health = this.store.getHealthSummary();
    this.shadowRoot.getElementById('health')!.textContent = `稳定 ${health.stable} / 中 ${health.medium} / 低 ${health.low}`;
    if (notes.length === 0) {
      list.innerHTML = '<p class="empty">暂无备注，点击“新增备注”开始标注。</p>';
      return;
    }
    list.innerHTML = notes.map((note) => {
      const current = normalizePath(note.anchor.pagePath) === normalizePath(this.pagePath);
      const tags = note.comment.tags.map((tag) => `<span class="an-tag">${TAG_LABELS[tag]}</span>`).join('');
      return `
        <button class="item ${note.comment.status}" data-id="${escapeAttr(note.comment.id)}" data-note-id="${escapeAttr(note.noteId)}">
          <span class="row"><b>${note.comment.role}</b><span class="action">${current ? '定位' : '前往'}</span></span>
          <span class="tags">${tags}</span>
          <span class="summary">${escapeHtml(note.comment.content.slice(0, 56) || '(图片备注)')}</span>
          <span class="foot"><code>${escapeHtml(note.anchor.noteId)}</code><em>${getAnchorHealth(note.anchor)}</em></span>
        </button>
      `;
    }).join('');
    list.querySelectorAll<HTMLElement>('.item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const noteId = item.dataset.noteId;
        const note = notes.find((entry) => entry.comment.id === id && entry.noteId === noteId);
        if (note) this.showDetail(note);
      });
    });
  }

  private emitArchive(note: FlatNote, status: 'open' | 'archived'): void {
    this.dispatchEvent(new CustomEvent('archive-note', { bubbles: true, composed: true, detail: { note, status } }));
  }

  private render(): void {
    const root = this.shadowRoot!;
    root.innerHTML = `
      <style>${SHARED_STYLES}
        :host {
          display: none;
          position: fixed;
          right: 24px;
          bottom: 92px;
          width: min(390px, calc(100vw - 48px));
          max-height: min(620px, calc(100vh - 120px));
          z-index: 2147483641;
          flex-direction: column;
          background: var(--an-surface);
          border: 1px solid var(--an-border);
          border-radius: var(--an-radius);
          box-shadow: var(--an-shadow);
          overflow: hidden;
          color: var(--an-text);
          backdrop-filter: blur(22px) saturate(1.35);
          -webkit-backdrop-filter: blur(22px) saturate(1.35);
        }
        .header, .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--an-border);
        }
        .header {
          background: rgba(255, 255, 255, 0.62);
        }
        .toolbar {
          background: rgba(248, 248, 250, 0.7);
        }
        h2 {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0;
        }
        #list-view { display: flex; flex-direction: column; min-height: 0; flex: 1; }
        .health {
          padding: 9px 14px;
          color: var(--an-text-muted);
          border-bottom: 1px solid var(--an-border);
          font-size: 12px;
          background: rgba(255, 255, 255, 0.48);
        }
        #note-list {
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow: auto;
        }
        .item {
          display: flex;
          flex-direction: column;
          gap: 7px;
          text-align: left;
          padding: 11px 12px;
          border: 1px solid var(--an-border);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.72);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }
        .item:hover {
          border-color: rgba(0, 122, 255, 0.28);
          background: rgba(255, 255, 255, 0.95);
        }
        .item.archived { opacity: 0.55; }
        .row, .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .action {
          border: 1px solid var(--an-border);
          border-radius: 999px;
          padding: 2px 8px;
          color: var(--an-accent);
          background: rgba(0, 122, 255, 0.08);
          font-size: 11px;
        }
        .tags { display: flex; gap: 4px; flex-wrap: wrap; }
        .summary { line-height: 1.45; }
        code { font-family: var(--an-mono); color: var(--an-text-muted); }
        em { color: var(--an-text-muted); font-style: normal; font-size: 11px; }
        .empty { color: var(--an-text-muted); text-align: center; padding: 32px 12px; }
        #detail { display: none; padding: 14px; overflow: auto; }
        .detail-meta, .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 12px 0; }
        .content { white-space: pre-wrap; line-height: 1.6; }
        .kv, .time { color: var(--an-text-muted); font-size: 12px; }
        .images { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
        .images img { max-width: 100%; max-height: 160px; border-radius: var(--an-radius-sm); border: 1px solid var(--an-border); }
        .message {
          border: 1px solid var(--an-border);
          border-radius: var(--an-radius-sm);
          padding: 9px 10px;
          color: var(--an-text-muted);
          background: rgba(255, 255, 255, 0.7);
        }
        .message.success { border-color: var(--an-success); color: var(--an-success); }
        .message.warning { border-color: var(--an-warning); color: var(--an-warning); }
      </style>
      <div class="header">
        <h2>App Notes</h2>
        <button class="an-btn an-btn-ghost" id="close">关闭</button>
      </div>
      <div class="toolbar">
        <button class="an-btn an-btn-primary" id="add">新增备注</button>
        <button class="an-btn an-btn-ghost" id="toggle">隐藏所有提示</button>
      </div>
      <div id="list-view">
        <div class="health" id="health"></div>
        <div id="note-list" class="an-scroll"></div>
      </div>
      <div id="detail" class="an-scroll"></div>
    `;
    root.getElementById('close')!.addEventListener('click', () => this.close());
    root.getElementById('add')!.addEventListener('click', () => this.dispatchEvent(new CustomEvent('start-selection', { bubbles: true, composed: true })));
    root.getElementById('toggle')!.addEventListener('click', () => {
      this.store?.toggleBubbles();
      this.dispatchEvent(new CustomEvent('bubbles-toggled', { bubbles: true, composed: true }));
    });
  }
}

function normalizePath(path: string | undefined): string {
  if (!path) return '/';
  try {
    const url = new URL(path, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

if (!customElements.get(AppNotesPanel.tag)) {
  customElements.define(AppNotesPanel.tag, AppNotesPanel);
}
