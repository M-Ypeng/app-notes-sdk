import type { AppNotesConfig, FlatNote, NoteComment } from '../types.js';
import { resolveAnchorFromElement, findElementByAnchor } from '../utils/dom-anchor.js';
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
  private unsub: (() => void) | null = null;
  private bubbles = new Map<string, AppNotesBubble>();

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
      pagePath: config.pagePath ?? window.location.pathname,
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
    this.unsub?.();
    this.unsub = this.store.subscribe(() => this.syncBubbles());
    void this.loadNotes();
  }

  destroy(): void {
    this.unsub?.();
    this.bubbles.forEach((bubble) => bubble.remove());
    this.bubbles.clear();
    this.remove();
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

    this.addEventListener('toggle-panel', () => this.togglePanel());
    this.addEventListener('toolbar-toggle-bubbles', () => {
      this.store.toggleBubbles();
      this.syncBubbles();
    });
    this.addEventListener('start-selection', () => {
      this.panel.close();
      this.panelOpen = false;
      this.overlay.start();
    });
    this.addEventListener('element-selected', ((event: CustomEvent<{ element: Element }>) => {
      const anchor = resolveAnchorFromElement(event.detail.element, this.config.pagePath);
      this.form.open(anchor);
    }) as EventListener);
    this.addEventListener('form-submit', ((event: CustomEvent<NoteFormSubmitDetail>) => {
      void this.handleFormSubmit(event.detail);
    }) as EventListener);
    this.addEventListener('bubble-click', ((event: CustomEvent<{ note: FlatNote }>) => {
      this.panel.open();
      this.panelOpen = true;
      this.panel.showDetail(event.detail.note);
    }) as EventListener);
    this.addEventListener('bubbles-toggled', () => this.syncBubbles());
    this.addEventListener('archive-note', ((event: CustomEvent<{ note: FlatNote; status: 'open' | 'archived' }>) => {
      void this.handleArchive(event.detail.note, event.detail.status);
    }) as EventListener);
    this.addEventListener('locate-element', ((event: CustomEvent<{ note: FlatNote }>) => {
      void this.handleLocate(event.detail.note);
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

  private togglePanel(): void {
    if (this.panelOpen) {
      this.panel.close();
      this.panelOpen = false;
    } else {
      this.panel.open();
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
    const comment = await this.api.appendComment(detail.anchor, {
      content: detail.content,
      images,
      tags: detail.tags,
      role: detail.role
    });
    this.store.addFile({
      schemaVersion: 1,
      anchor: detail.anchor,
      comments: [comment],
      meta: { createdAt: comment.createdAt, updatedAt: comment.updatedAt ?? comment.createdAt }
    });
    await this.loadNotes();
  }

  private async handleArchive(note: FlatNote, status: 'open' | 'archived'): Promise<void> {
    const updated = await this.api.archiveComment(note.noteId, note.comment.id, status);
    this.store.updateCommentStatus(note.noteId, note.comment.id, updated.status);
    this.panel.showDetail({ ...note, comment: updated });
  }

  private async handleLocate(note: FlatNote): Promise<void> {
    if (!this.isCurrentPage(note.anchor.pagePath)) {
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
    const found = this.locateNote(note);
    this.panel.showLocateMessage(found ? '已定位到元素。' : '未找到可信元素，可能需要重新绑定。', found ? 'success' : 'warning');
  }

  private locateNote(note: FlatNote): boolean {
    const el = findElementByAnchor(note.anchor);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate(
      [
        { outline: '2px solid #f0a500', outlineOffset: '2px' },
        { outline: '2px solid transparent', outlineOffset: '6px' }
      ],
      { duration: 1200, iterations: 2 }
    );
    return true;
  }

  private syncBubbles(): void {
    const visible = this.store.areBubblesVisible();
    const notes = this.store.getOpenNotes(this.config.pagePath);
    if (!visible) {
      this.bubbles.forEach((bubble) => bubble.remove());
      this.bubbles.clear();
      return;
    }
    for (const [key, bubble] of this.bubbles) {
      if (!notes.some((note) => `${note.noteId}:${note.comment.id}` === key)) {
        bubble.remove();
        this.bubbles.delete(key);
      }
    }
    for (const note of notes) {
      const key = `${note.noteId}:${note.comment.id}`;
      let bubble = this.bubbles.get(key);
      if (!bubble) {
        bubble = document.createElement(AppNotesBubble.tag) as AppNotesBubble;
        document.body.appendChild(bubble);
        this.bubbles.set(key, bubble);
      }
      bubble.setNote(note, findElementByAnchor(note.anchor));
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
    const found = this.locateNote(note);
    this.panel.showLocateMessage(found ? '已从其他页面跳转并定位到元素。' : '已到达目标页面，但未找到可信元素。', found ? 'success' : 'warning');
  }

  private isCurrentPage(pagePath: string | undefined): boolean {
    return normalizePath(pagePath) === normalizePath(this.config.pagePath);
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

function normalizePath(path: string | undefined): string {
  if (!path) return '/';
  try {
    const url = new URL(path, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path;
  }
}

if (!customElements.get(AppNotesRoot.tag)) {
  customElements.define(AppNotesRoot.tag, AppNotesRoot);
}
