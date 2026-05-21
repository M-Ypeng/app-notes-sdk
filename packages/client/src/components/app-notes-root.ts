import { APP_NOTES_SCHEMA_VERSION } from '../types.js';
import type { AnchorRect, AppNotesConfig, FlatNote, NoteAnchor, NotesFile, NotesFixRecord, NotesRuntimeContext } from '../types.js';
import { resolveAnchorFromElement, resolveElementByAnchor, inferAnchorHealth } from '../utils/dom-anchor.js';
import { scheduleAfterDomSettle } from '../utils/dom-settle.js';
import {
  getCurrentPagePath,
  installPagePathSync,
  isCurrentPagePath,
  isSamePagePath,
  LOCATION_CHANGE_EVENT,
  normalizePagePath
} from '../utils/page-path.js';
import { MemoryNotesClient, NotesApiClient, type NotesDataSource } from '../services/api.js';
import { NotesStore } from '../services/store.js';
import type { NoteFormSubmitDetail } from './note-form.js';
import './selection-overlay.js';
import './note-form.js';
import './note-bubble.js';
import './notes-panel.js';
import './floating-ball.js';
import { AppNotesSelectionOverlay } from './selection-overlay.js';
import { AppNotesForm } from './note-form.js';
import { AppNotesPanel } from './notes-panel.js';
import { AppNotesBubble } from './note-bubble.js';
import { AppNotesFloatingBall } from './floating-ball.js';

const PENDING_LOCATE_KEY = 'app-notes:pending-locate';

interface ResolvedConfig {
  serverUrl: string;
  pagePath: string;
  mode: 'memory' | 'server';
  onNavigateToPage?: (pagePath: string) => void | Promise<void>;
}

interface PendingLocate {
  noteId: string;
  commentId: string;
  pagePath: string;
}

export class AppNotesRoot extends HTMLElement {
  static readonly tag = 'app-notes-root';

  private store = new NotesStore();
  private api: NotesDataSource = new MemoryNotesClient();
  private config!: ResolvedConfig;
  private panelOpen = false;
  private eventsWired = false;
  private shortcutWired = false;
  private routeSyncWired = false;
  private viewportSyncWired = false;
  private cancelDomSettle: (() => void) | null = null;
  private viewportResizeTimer = 0;
  private unsub: (() => void) | null = null;
  private bubbles = new Map<string, AppNotesBubble>();
  private hoverHighlight: HTMLDivElement | null = null;
  private hoverHideTimer = 0;
  private hoveredBubble: AppNotesBubble | null = null;
  private formOpen = false;
  private pendingRebindNote: FlatNote | null = null;

  private get overlay(): AppNotesSelectionOverlay {
    return this.querySelector(AppNotesSelectionOverlay.tag) as AppNotesSelectionOverlay;
  }

  private get form(): AppNotesForm {
    return this.querySelector(AppNotesForm.tag) as AppNotesForm;
  }

  private get panel(): AppNotesPanel {
    return this.querySelector(AppNotesPanel.tag) as AppNotesPanel;
  }

  init(config: AppNotesConfig = {}): void {
    this.config = {
      serverUrl: config.serverUrl ?? 'http://localhost:3927',
      pagePath: config.pagePath ?? getCurrentPagePath(),
      mode: config.mode ?? 'server',
      onNavigateToPage: config.onNavigateToPage
    };
    this.api = this.config.mode === 'memory' ? new MemoryNotesClient() : new NotesApiClient(this.config.serverUrl);
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<slot></slot>';
    }
    this.ensureChildren();
    this.panel.setStore(this.store, this.config.serverUrl, this.config.pagePath);
    this.wireEvents();
    this.setupShortcut();
    this.setupRouteSync();
    this.unsub?.();
    this.unsub = this.store.subscribe(() => this.syncBubbles());
    void this.loadNotes();
  }

  destroy(): void {
    this.unsub?.();
    this.cancelDomSettle?.();
    this.cancelDomSettle = null;
    window.clearTimeout(this.viewportResizeTimer);
    window.clearTimeout(this.hoverHideTimer);
    this.hoverHideTimer = 0;
    if (this.viewportSyncWired) {
      window.removeEventListener('resize', this.onViewportChange);
      window.visualViewport?.removeEventListener('resize', this.onViewportChange);
      this.viewportSyncWired = false;
    }
    if (this.routeSyncWired) {
      window.removeEventListener('popstate', this.onRouteChange);
      window.removeEventListener('hashchange', this.onRouteChange);
      window.removeEventListener(LOCATION_CHANGE_EVENT, this.onRouteChange);
      this.routeSyncWired = false;
    }
    this.bubbles.forEach((bubble) => bubble.remove());
    this.bubbles.clear();
    this.remove();
  }

  /** 宿主路由变化时可主动调用（如 Vue Router / React Router afterEach）。 */
  updatePagePath(pagePath?: string): void {
    if (!this.config) return;
    if (pagePath) this.config.pagePath = pagePath;
    this.syncCurrentPagePath();
    this.scheduleBubbleAnchorResync();
    if (this.panelOpen) this.panel.refresh();
  }

  private ensureChildren(): void {
    const tags = [
      AppNotesFloatingBall.tag,
      AppNotesPanel.tag,
      AppNotesForm.tag,
      AppNotesSelectionOverlay.tag
    ];
    for (const tag of tags) {
      if (!this.querySelector(tag)) this.appendChild(document.createElement(tag));
    }
  }

  private wireEvents(): void {
    if (this.eventsWired) return;
    this.eventsWired = true;

    this.addEventListener('toggle-panel', ((event: CustomEvent<{ rect?: AnchorRect }>) => this.togglePanel(event.detail?.rect)) as EventListener);
    this.addEventListener('toolbar-drag-start', () => this.closePanelIfOpen());
    this.addEventListener('toolbar-toggle-bubbles', () => {
      this.store.toggleBubbles();
      this.syncBubbles();
    });
    this.addEventListener('start-selection', () => {
      this.pendingRebindNote = null;
      this.closePanelIfOpen();
      this.overlay.start();
    });
    this.addEventListener('element-selected', ((event: CustomEvent<{ element: Element }>) => {
      const anchor = resolveAnchorFromElement(event.detail.element, getCurrentPagePath());
      if (this.pendingRebindNote) {
      void this.handleRebindSelected(this.pendingRebindNote, anchor);
      this.pendingRebindNote = null;
      return;
      }
      this.form.open(anchor, event.detail.element);
    }) as EventListener);
    this.addEventListener('selection-cancel', () => {
      this.pendingRebindNote = null;
    });
    this.addEventListener('form-submit', ((event: CustomEvent<NoteFormSubmitDetail>) => {
      void this.handleFormSubmit(event.detail).then(event.detail.onSuccess, event.detail.onError);
    }) as EventListener);
    this.addEventListener('form-open', () => {
      this.formOpen = true;
      this.hideHoverHighlight();
      this.syncBubbles();
    });
    this.addEventListener('form-close', () => {
      this.formOpen = false;
      this.syncBubbles();
    });
    this.addEventListener('mouseover', this.onBubbleMouseOver);
    this.addEventListener('mouseout', this.onBubbleMouseOut);
    this.addEventListener('bubble-hover', ((event: CustomEvent<{ note: FlatNote }>) => {
      if (!this.isCurrentPage(event.detail.note.anchor.pagePath)) return;
      this.showHoverHighlight(event.detail.note);
    }) as EventListener);
    this.addEventListener('bubble-hover-end', () => this.hideHoverHighlight());
    this.addEventListener('bubbles-toggled', () => this.syncBubbles());
    this.addEventListener('archive-note', ((event: CustomEvent<{ note: FlatNote; status: 'open' | 'archived' }>) => {
      void this.handleArchive(event.detail.note, event.detail.status);
    }) as EventListener);
    this.addEventListener('locate-element', ((event: CustomEvent<{ note: FlatNote; fromHover?: boolean }>) => {
      void this.handleLocate(event.detail.note, event.detail.fromHover);
    }) as EventListener);
    this.addEventListener('rebind-note', ((event: CustomEvent<{ note: FlatNote }>) => {
      this.store.updateAnchorHealth(event.detail.note.noteId, 'rebind_required');
      this.pendingRebindNote = event.detail.note;
      this.closePanelIfOpen();
      this.overlay.start();
    }) as EventListener);
    this.addEventListener('update-fix-record', ((event: CustomEvent<{ note: FlatNote; fix: NotesFixRecord }>) => {
      void this.handleUpdateFix(event.detail.note, event.detail.fix);
    }) as EventListener);
  }

  private setupShortcut(): void {
    if (this.shortcutWired) return;
    this.shortcutWired = true;
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        this.togglePanel();
      }
    });
  }

  private closePanelIfOpen(): void {
    if (!this.panelOpen) return;
    this.panel.close();
    this.panelOpen = false;
    this.hideHoverHighlight();
  }

  private togglePanel(anchorRect?: AnchorRect): void {
    if (this.panelOpen) {
      this.closePanelIfOpen();
    } else {
      this.syncCurrentPagePath();
      this.panel.open(anchorRect);
      this.panelOpen = true;
    }
  }

  private async loadNotes(): Promise<void> {
    try {
      const ok = await this.api.health();
      if (!ok) {
        console.warn('[app-notes] local server is not reachable. Use mode: "memory" or start app-notes-server.');
        return;
      }
      const data = await this.api.fetchNotes();
      this.store.setFiles(data.files);
      this.scheduleBubbleAnchorResync();
      this.tryPendingLocate();
    } catch (error) {
      console.warn('[app-notes] failed to load notes', error);
    }
  }

  private async handleFormSubmit(detail: NoteFormSubmitDetail): Promise<void> {
    const images: string[] = [];
    for (const file of detail.imageFiles) {
      images.push(await this.api.uploadImage(file));
    }
    const anchor = { ...detail.anchor, pagePath: getCurrentPagePath() };
    const context = captureRuntimeContext(anchor.pagePath);
    const comment = await this.api.appendComment(anchor, {
      content: detail.content,
      images,
      tags: detail.tags,
      role: detail.role,
      ai: detail.ai
    }, context);
    this.store.addFile({
      schemaVersion: APP_NOTES_SCHEMA_VERSION,
      anchor,
      comments: [comment],
      context,
      meta: { createdAt: comment.createdAt, updatedAt: comment.updatedAt ?? comment.createdAt }
    });
    await this.loadNotes();
  }

  private async handleArchive(note: FlatNote, status: 'open' | 'archived'): Promise<void> {
    const updated = await this.api.archiveComment(note.noteId, note.comment.id, status);
    this.store.updateCommentStatus(note.noteId, note.comment.id, updated.status);
    this.panel.showDetail({ ...note, comment: updated });
  }

  private async handleUpdateFix(note: FlatNote, fix: NotesFixRecord): Promise<void> {
    try {
      const file = await this.api.updateFix(note.noteId, fix);
      const updatedFile = this.store.updateFix(note.noteId, file.fix ?? fix) ?? file;
      const updatedComment = updatedFile.comments.find((comment) => comment.id === note.comment.id) ?? note.comment;
      this.panel.showDetail({
        noteId: updatedFile.anchor.noteId,
        anchor: updatedFile.anchor,
        comment: updatedComment,
        fix: updatedFile.fix
      });
      this.panel.showLocateMessage('修复记录已保存。', 'success');
    } catch (error) {
      console.warn('[app-notes] failed to update fix record', error);
      this.panel.showLocateMessage('修复记录保存失败。', 'warning');
    }
  }

  private async handleRebindSelected(note: FlatNote, anchor: FlatNote['anchor']): Promise<void> {
    const nextAnchor = { ...anchor, noteId: note.noteId, health: inferAnchorHealth(anchor) };
    const updatedFile = this.store.updateAnchor(note.noteId, nextAnchor);
    if (!updatedFile) return;
    this.syncBubbles();
    let persisted = false;
    try {
      await this.api.updateAnchor(note.noteId, nextAnchor);
      persisted = true;
    } catch (error) {
      console.warn('[app-notes] failed to persist rebound anchor', error);
    }
    const updatedComment = updatedFile.comments.find((comment) => comment.id === note.comment.id) ?? note.comment;
    const updatedNote = { noteId: updatedFile.anchor.noteId, anchor: updatedFile.anchor, comment: updatedComment };
    this.panel.open();
    this.panelOpen = true;
    this.panel.showDetail(updatedNote);
    this.panel.showLocateMessage(
      persisted ? '已重新绑定并保存到本地备注文件。' : '已重新绑定当前会话，但保存到本地备注文件失败。',
      persisted ? 'success' : 'warning'
    );
  }

  private async handleLocate(note: FlatNote, fromHover = false): Promise<void> {
    if (!this.isCurrentPage(note.anchor.pagePath)) {
      if (fromHover) return;
      this.savePendingLocate(note);
      if (this.config.onNavigateToPage) {
        await this.config.onNavigateToPage(note.anchor.pagePath);
        this.config.pagePath = note.anchor.pagePath;
        await this.loadNotes();
        return;
      }
      window.location.href = note.anchor.pagePath || '/';
      return;
    }
    if (fromHover) {
      this.showHoverHighlight(note);
      return;
    }
    const found = this.locateNote(note);
    this.panel.showLocateMessage(found ? '已定位到元素。' : '未找到可信元素，可能需要重新绑定。', found ? 'success' : 'warning');
  }

  private locateNote(note: FlatNote): boolean {
    const result = resolveElementByAnchor(note.anchor);
    const el = result.element;
    if (!el) {
      this.updateAnchorValidation(note.anchor, 'invalid', result.evidence);
      return false;
    }
    const updated = this.updateAnchorValidation(note.anchor, inferAnchorHealth(note.anchor), result.evidence);
    const locatedNote = updated?.file ? { ...note, anchor: updated.file.anchor } : note;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.pulseHighlight(locatedNote);
    return true;
  }

  private pulseHighlight(note: FlatNote): void {
    this.showHoverHighlight(note);
    if (!this.hoverHighlight) return;
    this.hoverHighlight.getAnimations().forEach((anim) => anim.cancel());
    this.hoverHighlight.animate(
      [
        { boxShadow: '0 0 0 5px rgba(0, 122, 255, 0.14), 0 10px 28px rgba(0, 122, 255, 0.18)' },
        { boxShadow: '0 0 0 10px rgba(0, 122, 255, 0.22), 0 10px 28px rgba(0, 122, 255, 0.24)' },
        { boxShadow: '0 0 0 5px rgba(0, 122, 255, 0.14), 0 10px 28px rgba(0, 122, 255, 0.18)' }
      ],
      { duration: 700, iterations: 2 }
    );
    window.setTimeout(() => this.hideHoverHighlight(), 1600);
  }

  private showHoverHighlight(note: FlatNote): void {
    window.clearTimeout(this.hoverHideTimer);
    this.hoverHideTimer = 0;
    if (!this.isCurrentPage(note.anchor.pagePath)) {
      this.hideHoverHighlight();
      return;
    }
    const result = resolveElementByAnchor(note.anchor);
    if (!result.element) {
      this.hideHoverHighlight();
      return;
    }
    const rect = result.element.getBoundingClientRect();
    if (!this.hoverHighlight) {
      this.hoverHighlight = document.createElement('div');
      this.hoverHighlight.setAttribute('data-app-notes-hover-highlight', '');
      Object.assign(this.hoverHighlight.style, {
        position: 'fixed',
        zIndex: '2147483628',
        pointerEvents: 'none',
        border: '2px solid #007aff',
        borderRadius: '10px',
        boxShadow: '0 0 0 5px rgba(0, 122, 255, 0.14), 0 10px 28px rgba(0, 122, 255, 0.18)',
        background: 'rgba(0, 122, 255, 0.045)',
        transition: 'left 0.12s, top 0.12s, width 0.12s, height 0.12s, opacity 0.12s',
        opacity: '1'
      });
      document.body.appendChild(this.hoverHighlight);
    }
    Object.assign(this.hoverHighlight.style, {
      left: `${rect.left - 4}px`,
      top: `${rect.top - 4}px`,
      width: `${rect.width + 8}px`,
      height: `${rect.height + 8}px`,
      display: 'block',
      opacity: '1'
    });
  }

  private hideHoverHighlight(): void {
    window.clearTimeout(this.hoverHideTimer);
    this.hoverHideTimer = 0;
    if (!this.hoverHighlight) return;
    this.hoverHighlight.getAnimations().forEach((anim) => anim.cancel());
    this.hoverHighlight.style.opacity = '0';
    this.hoverHideTimer = window.setTimeout(() => {
      this.hoverHideTimer = 0;
      if (this.hoverHighlight) this.hoverHighlight.style.display = 'none';
    }, 80);
  }

  private onBubbleMouseOver = (event: MouseEvent): void => {
    const bubble = findBubbleInPath(event);
    if (!bubble || bubble === this.hoveredBubble) return;
    this.hoveredBubble = bubble;
    const note = bubble.getNote();
    if (note && this.isCurrentPage(note.anchor.pagePath)) this.showHoverHighlight(note);
  };

  private onBubbleMouseOut = (event: MouseEvent): void => {
    const bubble = findBubbleInPath(event);
    if (!bubble || bubble !== this.hoveredBubble) return;
    const related = event.relatedTarget;
    if (related instanceof Node && bubble.contains(related)) return;
    this.hoveredBubble = null;
    this.hideHoverHighlight();
  };

  private syncBubbles(): void {
    const visible = this.store.areBubblesVisible();
    const pagePath = getCurrentPagePath();
    const files = this.store.getFiles().filter(
      (file) => isSamePagePath(file.anchor.pagePath, pagePath) && file.comments.some((comment) => comment.status !== 'archived')
    );
    if (!visible || this.formOpen) {
      this.bubbles.forEach((bubble) => bubble.remove());
      this.bubbles.clear();
      return;
    }
    for (const [key, bubble] of this.bubbles) {
      if (!files.some((file) => getBubbleKey(file.anchor.pagePath, file.anchor.noteId) === key)) {
        bubble.remove();
        this.bubbles.delete(key);
      }
    }
    for (const file of files) {
      const key = getBubbleKey(file.anchor.pagePath, file.anchor.noteId);
      let bubble = this.bubbles.get(key);
      if (!bubble) {
        bubble = document.createElement(AppNotesBubble.tag) as AppNotesBubble;
        this.bubbles.set(key, bubble);
      }
      if (bubble.parentElement !== this) this.appendChild(bubble);
      const result = resolveElementByAnchor(file.anchor);
      if (file.anchor.health !== 'rebind_required') {
        this.updateAnchorValidation(file.anchor, result.element ? inferAnchorHealth(file.anchor) : 'invalid', result.evidence);
      }
      bubble.setContext(this.config.serverUrl, this.config.pagePath);
      bubble.setFile(file, result.element);
    }
  }

  private updateAnchorValidation(anchor: NoteAnchor, health: NoteAnchor['health'], evidence: NoteAnchor['evidence']): { changed: boolean; file: NotesFile | null } | null {
    if (!health || !evidence) return null;
    const updated = this.store.updateAnchorValidation(anchor.noteId, health, evidence);
    if (updated?.changed && updated.file) void this.persistAnchor(updated.file.anchor);
    return updated;
  }

  private async persistAnchor(anchor: NoteAnchor): Promise<void> {
    try {
      await this.api.updateAnchor(anchor.noteId, anchor);
    } catch (error) {
      console.warn('[app-notes] failed to persist anchor validation', error);
    }
  }

  private savePendingLocate(note: FlatNote): void {
    const pending: PendingLocate = {
      noteId: note.noteId,
      commentId: note.comment.id,
      pagePath: note.anchor.pagePath
    };
    window.sessionStorage.setItem(PENDING_LOCATE_KEY, JSON.stringify(pending));
  }

  private tryPendingLocate(): void {
    const pending = readPendingLocate();
    if (!pending || !this.isCurrentPage(pending.pagePath)) return;
    const note = this.store.getFlatNotes().find((item) => item.noteId === pending.noteId && item.comment.id === pending.commentId);
    if (!note) return;
    window.sessionStorage.removeItem(PENDING_LOCATE_KEY);
    this.panel.open();
    this.panelOpen = true;
    this.panel.showDetail(note);
    const runLocate = (): void => {
      const found = this.locateNote(note);
      this.panel.showLocateMessage(
        found ? '已从其他页面跳转并定位到元素。' : '已到达目标页面，但未找到可信元素。',
        found ? 'success' : 'warning'
      );
    };
    runLocate();
    scheduleAfterDomSettle(runLocate);
  }

  private isCurrentPage(pagePath: string | undefined): boolean {
    return isCurrentPagePath(pagePath);
  }

  private syncCurrentPagePath(): void {
    if (!this.config) return;
    const next = getCurrentPagePath();
    if (isSamePagePath(next, this.config.pagePath)) return;
    this.config.pagePath = next;
    this.panel.setStore(this.store, this.config.serverUrl, this.config.pagePath);
  }

  private onRouteChange = (): void => {
    this.syncCurrentPagePath();
    this.scheduleBubbleAnchorResync();
    if (this.panelOpen) this.panel.refresh();
  };

  private onViewportChange = (): void => {
    window.clearTimeout(this.viewportResizeTimer);
    this.viewportResizeTimer = window.setTimeout(() => this.scheduleBubbleAnchorResync(), 140);
  };

  /** SPA 切页或窄屏布局变化后，等待 DOM 稳定再重新解析锚点。 */
  private scheduleBubbleAnchorResync(): void {
    this.cancelDomSettle?.();
    this.cancelDomSettle = scheduleAfterDomSettle(() => {
      if (!this.config) return;
      this.syncBubbles();
    });
  }

  private setupRouteSync(): void {
    if (this.routeSyncWired) return;
    this.routeSyncWired = true;
    installPagePathSync();
    window.addEventListener('popstate', this.onRouteChange);
    window.addEventListener('hashchange', this.onRouteChange);
    window.addEventListener(LOCATION_CHANGE_EVENT, this.onRouteChange);
    if (!this.viewportSyncWired) {
      this.viewportSyncWired = true;
      window.addEventListener('resize', this.onViewportChange);
      window.visualViewport?.addEventListener('resize', this.onViewportChange);
    }
  }
}

function readPendingLocate(): PendingLocate | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_LOCATE_KEY);
    return raw ? (JSON.parse(raw) as PendingLocate) : null;
  } catch {
    return null;
  }
}

function findBubbleInPath(event: Event): AppNotesBubble | null {
  return event.composedPath().find((item): item is AppNotesBubble => item instanceof AppNotesBubble) ?? null;
}

function getBubbleKey(pagePath: string, noteId: string): string {
  return `${normalizePagePath(pagePath)}:${noteId}`;
}

function captureRuntimeContext(pagePath: string): NotesRuntimeContext {
  return {
    url: window.location.href,
    pagePath,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    },
    userAgent: window.navigator.userAgent,
    capturedAt: new Date().toISOString()
  };
}

if (!customElements.get(AppNotesRoot.tag)) {
  customElements.define(AppNotesRoot.tag, AppNotesRoot);
}
