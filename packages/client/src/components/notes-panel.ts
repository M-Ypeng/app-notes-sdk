import { SHARED_STYLES } from '../styles/shared.js';
import { TAG_LABELS, type AnchorHealth, type AnchorRect, type FlatNote } from '../types.js';
import type { NotesStore } from '../services/store.js';
import { getAnchorHealth } from '../utils/dom-anchor.js';
import { clamp, escapeAttr, escapeHtml, tagClass } from '../utils/format.js';
import { getCurrentPagePath, isCurrentPagePath } from '../utils/page-path.js';

type PanelFilter = 'current' | 'other' | 'all' | 'archived';
type TagFilter = 'all' | 'question' | 'change' | 'logic' | 'visual';

export class AppNotesPanel extends HTMLElement {
  static readonly tag = 'app-notes-panel';

  private store: NotesStore | null = null;
  private serverUrl = '';
  private pagePath = '/';
  private unsub: (() => void) | null = null;
  private hoveredListItem: HTMLElement | null = null;
  private activeFilter: PanelFilter = 'current';
  private activeTagFilter: TagFilter = 'all';

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

  open(anchorRect?: AnchorRect): void {
    this.pagePath = getCurrentPagePath();
    this.style.display = 'flex';
    this.setAttribute('open', '');
    this.refresh();
    requestAnimationFrame(() => this.positionNear(anchorRect));
  }

  close(): void {
    this.style.display = 'none';
    this.removeAttribute('open');
    this.hideDetail();
    this.hideStats();
  }

  showDetail(note: FlatNote): void {
    const detail = this.shadowRoot?.getElementById('detail');
    const list = this.shadowRoot?.getElementById('list-view');
    const stats = this.shadowRoot?.getElementById('stats-view');
    if (!detail || !list || !stats) return;
    list.style.display = 'none';
    stats.style.display = 'none';
    detail.style.display = 'block';
    const images = note.comment.images
      .map((path) => {
        const url = resolveAssetUrl(path, this.serverUrl);
        return `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer"><img src="${escapeAttr(url)}" alt="备注图片" /></a>`;
      })
      .join('');
    const tags =
      note.comment.tags.map((tag) => `<span class="tag ${tagClass(tag)}">${TAG_LABELS[tag]}</span>`).join('') ||
      '<span class="tag neutral">无标签</span>';
    const isCurrent = isCurrentPagePath(note.anchor.pagePath);
    const health = getAnchorHealth(note.anchor);
    detail.innerHTML = `
      <div class="detail-top">
        <button type="button" class="back-link" data-action="back">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          返回列表
        </button>
        <span class="health-pill health-${health}">${healthLabel(health)}</span>
      </div>
      <div class="detail-card">
        <div class="detail-meta">
          <span class="role-pill">${escapeHtml(note.comment.role)}</span>
          ${tags}
          <span class="status-pill ${note.comment.status}">${note.comment.status === 'archived' ? '已归档' : '进行中'}</span>
        </div>
        <p class="content">${escapeHtml(note.comment.content) || '(图片备注)'}</p>
        ${images ? `<div class="images">${images}</div>` : ''}
        <dl class="meta-grid">
          <div><dt>页面</dt><dd title="${escapeAttr(note.anchor.pagePath)}">${escapeHtml(formatPageLabel(note.anchor.pagePath))}</dd></div>
          <div><dt>锚点</dt><dd><code>${escapeHtml(note.anchor.noteId)}</code></dd></div>
          <div><dt>时间</dt><dd>${formatTime(note.comment.createdAt)}</dd></div>
        </dl>
        <div class="actions">
          <button type="button" class="an-btn an-btn-ghost" id="archive">${note.comment.status === 'open' ? '归档' : '重新打开'}</button>
          <button type="button" class="an-btn an-btn-ghost" id="rebind">重新绑定</button>
          <button type="button" class="an-btn ${isCurrent ? 'an-btn-ghost' : 'an-btn-primary'}" id="locate">${isCurrent ? '定位元素' : '前往页面'}</button>
        </div>
      </div>
      <p class="message" id="message" hidden></p>
    `;
    detail.querySelector('[data-action="back"]')!.addEventListener('click', () => this.hideDetail());
    detail.querySelector('#archive')!.addEventListener('click', () => this.emitArchive(note, note.comment.status === 'open' ? 'archived' : 'open'));
    detail.querySelector('#rebind')!.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('rebind-note', { bubbles: true, composed: true, detail: { note } }));
    });
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
    const stats = this.shadowRoot?.getElementById('stats-view');
    if (detail) detail.style.display = 'none';
    if (stats) stats.style.display = 'none';
    if (list) list.style.display = 'flex';
  }

  showStats(): void {
    if (!this.store || !this.shadowRoot) return;
    const detail = this.shadowRoot.getElementById('detail');
    const list = this.shadowRoot.getElementById('list-view');
    const stats = this.shadowRoot.getElementById('stats-view');
    if (!detail || !list || !stats) return;
    detail.style.display = 'none';
    list.style.display = 'none';
    stats.style.display = 'block';
    const summary = this.store.getHealthSummary();
    const files = this.store.getFiles();
    const total = files.length;
    const rows: Array<[AnchorHealth, string]> = [
      ['stable', '稳定'],
      ['medium', '中等'],
      ['low', '低可信'],
      ['invalid', '无效'],
      ['rebind_required', '需重绑']
    ];
    stats.innerHTML = `
      <div class="stats-top">
        <button type="button" class="back-link" data-action="back">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          返回列表
        </button>
      </div>
      <div class="stats-card">
        <div class="stats-total"><strong>${total}</strong><span> 个锚点</span></div>
        <div class="stats-grid">
          ${rows.map(([health, label]) => `
            <div class="stats-item health-${health}">
              <strong>${summary[health]}</strong>
              <span>${label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    stats.querySelector('[data-action="back"]')!.addEventListener('click', () => this.hideDetail());
  }

  private hideStats(): void {
    const stats = this.shadowRoot?.getElementById('stats-view');
    if (stats) stats.style.display = 'none';
  }

  refresh(): void {
    if (!this.store || !this.shadowRoot) return;
    const filterEl = this.shadowRoot.getElementById('category-filter');
    const list = this.shadowRoot.getElementById('note-list');
    if (!list || !filterEl) return;

    const notes = this.store.getFlatNotes();
    const filteredNotes = filterNotes(notes, this.activeFilter, this.activeTagFilter);

    filterEl.innerHTML = renderFilterControls(notes, this.activeFilter, this.activeTagFilter);
    if (this.shadowRoot.getElementById('stats-view')?.style.display === 'block') this.showStats();

    if (filteredNotes.length === 0) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="40" height="40"><path d="M14 14h20a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H22l-8 6v-6h0a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M18 24h12M18 28h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
          <p>${notes.length === 0 ? '暂无备注' : '暂无匹配备注'}</p>
          <span>${notes.length === 0 ? '使用右下角工具栏添加页面标注' : '切换分类查看其他备注'}</span>
        </div>
      `;
      return;
    }

    list.innerHTML = filteredNotes
      .map((note) => {
        const current = isCurrentPagePath(note.anchor.pagePath);
        const primaryTag = note.comment.tags[0];
        const tags = note.comment.tags
          .map((tag) => `<span class="tag ${tagClass(tag)}">${TAG_LABELS[tag]}</span>`)
          .join('');
        const summary = escapeHtml(note.comment.content.slice(0, 72) || '(图片备注)');
        const pageLabel = formatPageLabel(note.anchor.pagePath);
        return `
          <button
            type="button"
            class="item ${note.comment.status} ${current ? 'is-current' : ''}"
            data-id="${escapeAttr(note.comment.id)}"
            data-note-id="${escapeAttr(note.noteId)}"
            data-tag="${escapeAttr(primaryTag ?? '')}"
          >
            <span class="item-accent" aria-hidden="true"></span>
            <span class="item-main">
              <span class="item-head">
                <span class="role-pill">${escapeHtml(note.comment.role)}</span>
                ${tags ? `<span class="tags">${tags}</span>` : ''}
                ${note.comment.images.length ? '<span class="media-badge" title="含图片">图</span>' : ''}
                <span class="item-go">${current ? '定位' : '前往'}</span>
              </span>
              <span class="summary">${summary}${note.comment.content.length > 72 ? '…' : ''}</span>
              <span class="item-foot">
                <span class="page" title="${escapeAttr(note.anchor.pagePath)}">${escapeHtml(pageLabel)}</span>
              </span>
            </span>
          </button>
        `;
      })
      .join('');

  }

  private emitArchive(note: FlatNote, status: 'open' | 'archived'): void {
    this.dispatchEvent(new CustomEvent('archive-note', { bubbles: true, composed: true, detail: { note, status } }));
  }

  private positionNear(anchorRect?: AnchorRect): void {
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const rect = this.getBoundingClientRect();
    const width = rect.width || Math.min(390, viewportWidth - 48);
    const height = rect.height || Math.min(620, viewportHeight - 120);
    const edge = 12;
    const gap = 12;
    let left = viewportWidth - width - 24;
    let top = Math.max(edge, viewportHeight - height - 92);

    if (anchorRect) {
      left = anchorRect.right + gap;
      if (left + width > viewportWidth - edge) left = anchorRect.left - width - gap;
      if (left < edge) left = clamp(anchorRect.left, edge, viewportWidth - width - edge);
      top = clamp(anchorRect.top - 8, edge, viewportHeight - height - edge);
    }

    this.style.left = `${left}px`;
    this.style.top = `${top}px`;
    this.style.right = 'auto';
    this.style.bottom = 'auto';
  }

  private render(): void {
    const root = this.shadowRoot!;
    root.innerHTML = `
      <style>${SHARED_STYLES}
        ${PANEL_STYLES}
      </style>
      <div class="header">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true"></span>
          <h2>App Notes</h2>
        </div>
        <div class="header-actions">
          <button type="button" class="stats-button" id="stats-toggle">统计</button>
          <button type="button" class="an-dismiss" id="close" aria-label="关闭"></button>
        </div>
      </div>
      <div id="list-view">
        <div class="category-filter" id="category-filter"></div>
        <div id="note-list" class="an-scroll"></div>
      </div>
      <div id="detail" class="an-scroll"></div>
      <div id="stats-view" class="an-scroll"></div>
    `;
    root.getElementById('close')!.addEventListener('click', () => this.close());
    root.getElementById('stats-toggle')!.addEventListener('click', () => this.showStats());
    root.getElementById('category-filter')!.addEventListener('change', (event) => {
      const scope = (event.target as Element | null)?.closest<HTMLSelectElement>('[data-scope-filter]');
      if (scope) {
        this.activeFilter = scope.value as PanelFilter;
        this.refresh();
        return;
      }
      const select = (event.target as Element | null)?.closest<HTMLSelectElement>('[data-tag-filter]');
      if (!select) return;
      this.activeTagFilter = select.value as TagFilter;
      this.refresh();
    });
    const list = root.getElementById('note-list')!;
    list.addEventListener('click', (event) => {
      const note = this.getNoteFromListEvent(event);
      if (note) this.showDetail(note);
    });
    list.addEventListener('mouseover', (event) => {
      const item = (event.target as Element | null)?.closest<HTMLElement>('.item');
      if (!item || item === this.hoveredListItem) return;
      this.hoveredListItem = item;
      const note = this.getNoteFromItem(item);
      if (note && isCurrentPagePath(note.anchor.pagePath)) {
        this.dispatchEvent(new CustomEvent('bubble-hover', { bubbles: true, composed: true, detail: { note } }));
      }
    });
    list.addEventListener('mouseout', (event) => {
      const item = (event.target as Element | null)?.closest<HTMLElement>('.item');
      if (!item || item !== this.hoveredListItem) return;
      const related = event.relatedTarget;
      if (related instanceof Node && item.contains(related)) return;
      this.hoveredListItem = null;
      this.dispatchEvent(new CustomEvent('bubble-hover-end', { bubbles: true, composed: true }));
    });
  }

  private getNoteFromListEvent(event: Event): FlatNote | undefined {
    const item = (event.target as Element | null)?.closest<HTMLElement>('.item');
    return item ? this.getNoteFromItem(item) : undefined;
  }

  private getNoteFromItem(item: HTMLElement): FlatNote | undefined {
    const id = item.dataset.id;
    const noteId = item.dataset.noteId;
    return this.store?.getFlatNotes().find((entry) => entry.comment.id === id && entry.noteId === noteId);
  }
}

const PANEL_STYLES = `
  :host {
    display: none;
    position: fixed;
    right: 24px;
    bottom: 92px;
    width: min(400px, calc(100vw - 48px));
    height: min(640px, calc(100vh - 120px));
    max-height: calc(100vh - 120px);
    z-index: 2147483641;
    flex-direction: column;
    background: linear-gradient(165deg, rgba(255, 255, 255, 0.97) 0%, rgba(248, 249, 252, 0.94) 100%);
    border: 1px solid rgba(60, 60, 67, 0.1);
    border-radius: 20px;
    box-shadow:
      0 24px 64px rgba(15, 23, 42, 0.14),
      0 2px 0 rgba(255, 255, 255, 0.85) inset;
    overflow: hidden;
    color: var(--an-text);
    backdrop-filter: blur(24px) saturate(1.4);
    -webkit-backdrop-filter: blur(24px) saturate(1.4);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid rgba(60, 60, 67, 0.08);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }
  .brand-mark {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--an-accent);
    box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.14);
    flex-shrink: 0;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .stats-button {
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid rgba(60, 60, 67, 0.1);
    border-radius: 999px;
    color: var(--an-text-muted);
    background: rgba(255, 255, 255, 0.72);
    font-size: 12px;
    font-weight: 650;
  }
  .stats-button:hover {
    color: var(--an-accent);
    border-color: rgba(0, 122, 255, 0.2);
    background: rgba(0, 122, 255, 0.08);
  }

  #list-view {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }

  .category-filter {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 9px;
    border-bottom: 1px solid rgba(60, 60, 67, 0.06);
    overflow: visible;
    background: rgba(247, 247, 249, 0.48);
  }
  .filter-count {
    flex: 0 0 auto;
    min-width: 42px;
    color: var(--an-text);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
  .filter-count span {
    color: var(--an-text-muted);
    font-weight: 500;
  }
  .select-filter-wrap {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
  }
  .filter-select {
    width: 100%;
    height: 30px;
    padding: 0 28px 0 11px;
    border: 1px solid rgba(60, 60, 67, 0.1);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.78);
    color: var(--an-text);
    font-size: 11px;
    font-weight: 650;
    line-height: 30px;
    outline: none;
    appearance: none;
  }
  .select-filter-wrap::after {
    content: '';
    position: absolute;
    right: 11px;
    top: 50%;
    width: 7px;
    height: 7px;
    border-right: 1.5px solid rgba(60, 60, 67, 0.58);
    border-bottom: 1.5px solid rgba(60, 60, 67, 0.58);
    transform: translateY(-65%) rotate(45deg);
    pointer-events: none;
  }
  .filter-select:focus {
    border-color: rgba(0, 122, 255, 0.32);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
  }

  #note-list {
    padding: 10px 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: auto;
    overscroll-behavior: contain;
    flex: 1;
    min-height: 0;
  }

  .item {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    width: 100%;
    text-align: left;
    padding: 0;
    border: 1px solid rgba(60, 60, 67, 0.09);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.72);
    overflow: hidden;
    transition: border-color 0.14s ease, background 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
  }
  .item:hover {
    border-color: rgba(0, 122, 255, 0.22);
    background: #fff;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
    transform: translateY(-1px);
  }
  .item.archived {
    opacity: 0.52;
  }
  .item.is-current {
    background: rgba(0, 122, 255, 0.04);
  }

  .item-accent {
    width: 3px;
    flex-shrink: 0;
    background: var(--an-accent);
    opacity: 0.85;
  }
  .item[data-tag="疑问"] .item-accent { background: #0a84ff; }
  .item[data-tag="变更建议"] .item-accent { background: #ff9500; }
  .item[data-tag="逻辑补充"] .item-accent { background: #34a853; }
  .item[data-tag="视觉规范"] .item-accent { background: #af52de; }
  .item:not([data-tag]) .item-accent,
  .item[data-tag=""] .item-accent { background: rgba(60, 60, 67, 0.22); }

  .item-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 11px 10px 10px;
  }

  .item-head {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  .role-pill {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 7px;
    border-radius: 6px;
    background: rgba(29, 29, 31, 0.06);
    color: var(--an-text);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .tags {
    display: inline-flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 6px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.01em;
  }
  .tag-question { color: #0a84ff; background: rgba(10, 132, 255, 0.1); }
  .tag-change { color: #c93400; background: rgba(255, 149, 0, 0.12); }
  .tag-logic { color: #248a3d; background: rgba(52, 168, 83, 0.12); }
  .tag-visual { color: #8944ab; background: rgba(175, 82, 222, 0.12); }
  .tag.neutral { color: var(--an-text-muted); background: rgba(60, 60, 67, 0.08); }

  .media-badge {
    font-size: 10px;
    font-weight: 700;
    color: var(--an-text-muted);
    padding: 0 5px;
    border-radius: 4px;
    background: rgba(60, 60, 67, 0.07);
  }

  .item-go {
    margin-left: auto;
    font-size: 11px;
    font-weight: 600;
    color: var(--an-accent);
    opacity: 0.9;
  }
  .item:hover .item-go {
    opacity: 1;
  }

  .summary {
    font-size: 13px;
    line-height: 1.5;
    color: var(--an-text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }

  .item-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
  }
  .page {
    color: var(--an-text-muted);
    font-family: var(--an-mono);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 68%;
  }
  .item.is-current .page::after {
    content: ' · 当前';
    color: var(--an-accent);
    font-family: var(--an-font);
    font-weight: 600;
  }

  .health-pill {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 650;
    padding: 2px 6px;
    border-radius: 5px;
  }
  .health-stable { color: #248a3d; background: rgba(52, 168, 83, 0.1); }
  .health-medium { color: #9a6700; background: rgba(255, 149, 0, 0.12); }
  .health-low { color: #c93400; background: rgba(255, 59, 48, 0.1); }
  .health-invalid,
  .health-rebind_required { color: var(--an-text-muted); background: rgba(60, 60, 67, 0.08); }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 48px 20px;
    text-align: center;
    color: var(--an-text-muted);
  }
  .empty-icon {
    color: rgba(60, 60, 67, 0.28);
    margin-bottom: 4px;
  }
  .empty p {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--an-text);
  }
  .empty span {
    font-size: 12px;
    line-height: 1.45;
  }

  #detail {
    display: none;
    padding: 12px 14px 16px;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  #stats-view {
    display: none;
    padding: 12px 14px 16px;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }

  .detail-top,
  .stats-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 2px;
    font-size: 12px;
    font-weight: 600;
    color: var(--an-accent);
    border-radius: 6px;
  }
  .back-link:hover {
    background: rgba(0, 122, 255, 0.08);
  }

  .detail-card {
    border: 1px solid rgba(60, 60, 67, 0.09);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.78);
    padding: 14px;
  }
  .stats-card {
    border: 1px solid rgba(60, 60, 67, 0.09);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.78);
    padding: 14px;
  }
  .stats-total {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 12px;
  }
  .stats-total strong {
    font-size: 28px;
    line-height: 1;
    letter-spacing: -0.03em;
  }
  .stats-total span {
    color: var(--an-text-muted);
    font-size: 12px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .stats-item {
    min-height: 72px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border-radius: 12px;
    background: rgba(60, 60, 67, 0.06);
  }
  .stats-item strong {
    font-size: 22px;
    line-height: 1;
  }
  .stats-item span {
    color: var(--an-text-muted);
    font-size: 12px;
    font-weight: 650;
  }
  .stats-item.health-stable { color: #248a3d; background: rgba(52, 168, 83, 0.12); }
  .stats-item.health-medium { color: #9a6700; background: rgba(255, 149, 0, 0.14); }
  .stats-item.health-low { color: #c93400; background: rgba(255, 59, 48, 0.1); }
  .stats-item.health-invalid,
  .stats-item.health-rebind_required { color: #6e6e73; background: rgba(60, 60, 67, 0.08); }

  .detail-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
  }

  .status-pill {
    font-size: 10px;
    font-weight: 650;
    padding: 2px 7px;
    border-radius: 6px;
    color: var(--an-text-muted);
    background: rgba(60, 60, 67, 0.08);
  }
  .status-pill.open {
    color: #0a5cab;
    background: rgba(0, 122, 255, 0.1);
  }

  .content {
    margin: 0 0 12px;
    white-space: pre-wrap;
    line-height: 1.6;
    font-size: 13px;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
    margin: 0 0 14px;
    padding: 0;
  }
  .meta-grid > div {
    min-width: 0;
  }
  .meta-grid dt {
    margin: 0 0 2px;
    font-size: 10px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--an-text-muted);
  }
  .meta-grid dd {
    margin: 0;
    font-size: 12px;
    color: var(--an-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta-grid code {
    font-family: var(--an-mono);
    font-size: 11px;
    color: var(--an-text-muted);
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .actions .an-btn {
    min-height: 30px;
    padding: 6px 12px;
    font-size: 12px;
  }

  .images {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0 0 12px;
  }
  .images a {
    display: inline-flex;
    border-radius: var(--an-radius-sm);
    outline: none;
  }
  .images img {
    max-width: 100%;
    max-height: 200px;
    object-fit: contain;
    border-radius: 10px;
    border: 1px solid var(--an-border);
    background: #fff;
    cursor: zoom-in;
  }

  .message {
    margin-top: 10px;
    border: 1px solid var(--an-border);
    border-radius: 10px;
    padding: 9px 10px;
    font-size: 12px;
    color: var(--an-text-muted);
    background: rgba(255, 255, 255, 0.7);
  }
  .message.success { border-color: var(--an-success); color: var(--an-success); }
  .message.warning { border-color: var(--an-warning, #ff9500); color: var(--an-warning, #ff9500); }
`;

function healthLabel(health: AnchorHealth): string {
  switch (health) {
    case 'stable':
      return '稳定';
    case 'medium':
      return '中';
    case 'low':
      return '低';
    case 'invalid':
      return '无效';
    case 'rebind_required':
      return '需重绑';
    default:
      return health;
  }
}

function filterNotes(notes: FlatNote[], filter: PanelFilter, tagFilter: TagFilter): FlatNote[] {
  const byScope = (() => {
    switch (filter) {
    case 'current':
      return notes.filter((note) => isCurrentPagePath(note.anchor.pagePath));
    case 'other':
      return notes.filter((note) => !isCurrentPagePath(note.anchor.pagePath));
    case 'archived':
      return notes.filter((note) => note.comment.status === 'archived');
    case 'all':
      return notes;
    }
  })();
  if (tagFilter === 'all') return byScope;
  return byScope.filter((note) => note.comment.tags.includes(tagFilterToNoteTag(tagFilter)));
}

function renderFilterControls(notes: FlatNote[], active: PanelFilter, activeTag: TagFilter): string {
  const scopeOptions: Array<{ id: PanelFilter; label: string; count: number }> = [
    { id: 'current', label: '当前', count: notes.filter((note) => isCurrentPagePath(note.anchor.pagePath)).length },
    { id: 'other', label: '其他页面', count: notes.filter((note) => !isCurrentPagePath(note.anchor.pagePath)).length },
    { id: 'all', label: '全部', count: notes.length },
    { id: 'archived', label: '归档', count: notes.filter((note) => note.comment.status === 'archived').length }
  ];

  const tagOptions: Array<{ id: TagFilter; label: string; count: number }> = [
    { id: 'all', label: '全部标签', count: notes.length },
    { id: 'question', label: '疑问', count: notes.filter((note) => note.comment.tags.includes('疑问')).length },
    { id: 'change', label: '变更建议', count: notes.filter((note) => note.comment.tags.includes('变更建议')).length },
    { id: 'logic', label: '逻辑补充', count: notes.filter((note) => note.comment.tags.includes('逻辑补充')).length },
    { id: 'visual', label: '视觉规范', count: notes.filter((note) => note.comment.tags.includes('视觉规范')).length }
  ];

  const activeCount = filterNotes(notes, active, activeTag).length;
  return `
    <span class="filter-count">${activeCount}<span> 条</span></span>
    <label class="select-filter-wrap">
      <select class="filter-select" data-scope-filter aria-label="按范围筛选">
        ${scopeOptions.map((option) => `
          <option value="${option.id}" ${option.id === active ? 'selected' : ''}>${option.label} ${option.count}</option>
        `).join('')}
      </select>
    </label>
    <label class="select-filter-wrap">
      <select class="filter-select" data-tag-filter aria-label="按标签筛选">
        ${tagOptions.map((option) => `
          <option value="${option.id}" ${option.id === activeTag ? 'selected' : ''}>${option.label} ${option.count}</option>
        `).join('')}
      </select>
    </label>
  `;
}

function tagFilterToNoteTag(filter: Exclude<TagFilter, 'all'>): '疑问' | '变更建议' | '逻辑补充' | '视觉规范' {
  switch (filter) {
    case 'question':
      return '疑问';
    case 'change':
      return '变更建议';
    case 'logic':
      return '逻辑补充';
    case 'visual':
      return '视觉规范';
  }
}

function formatPageLabel(pagePath: string): string {
  try {
    const url = new URL(pagePath, window.location.origin);
    const path = `${url.pathname || '/'}${url.hash || ''}`;
    return path.length > 28 ? `${path.slice(0, 26)}…` : path;
  } catch {
    return pagePath.length > 28 ? `${pagePath.slice(0, 26)}…` : pagePath;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function resolveAssetUrl(path: string, serverUrl: string): string {
  if (/^(https?:|blob:|data:)/.test(path)) return path;
  if (path.startsWith('memory:')) return path;
  const base = serverUrl.replace(/\/$/, '');
  if (path.startsWith('assets/')) return `${base}/api/${path}`;
  return `${base}/api/assets/${path.split('/').pop()}`;
}

if (!customElements.get(AppNotesPanel.tag)) {
  customElements.define(AppNotesPanel.tag, AppNotesPanel);
}
