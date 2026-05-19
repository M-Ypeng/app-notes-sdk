import { SHARED_STYLES } from '../styles/shared.js';
import { NOTE_ROLES, NOTE_TAGS, TAG_LABELS, type NoteAnchor, type NoteRole, type NoteTag } from '../types.js';

export interface NoteFormSubmitDetail {
  anchor: NoteAnchor;
  content: string;
  tags: NoteTag[];
  role: NoteRole;
  imageFiles: File[];
}

export class AppNotesForm extends HTMLElement {
  static readonly tag = 'app-notes-form';

  private anchor: NoteAnchor | null = null;
  private pendingImages: File[] = [];

  connectedCallback(): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.render();
    }
  }

  open(anchor: NoteAnchor): void {
    this.anchor = anchor;
    this.pendingImages = [];
    this.setAttribute('open', '');
    const root = this.shadowRoot!;
    (root.getElementById('content') as HTMLTextAreaElement).value = '';
    root.querySelectorAll<HTMLInputElement>('input[name="tag"]').forEach((input) => { input.checked = false; });
    root.getElementById('preview')!.innerHTML = '';
    root.getElementById('anchor-info')!.textContent = `锚点: ${anchor.noteId}${anchor.selectorHint ? ` (${anchor.selectorHint})` : ''}`;
    window.setTimeout(() => (root.getElementById('content') as HTMLTextAreaElement).focus());
  }

  close(): void {
    this.removeAttribute('open');
    this.anchor = null;
    this.pendingImages = [];
  }

  private render(): void {
    const tags = NOTE_TAGS.map((tag) => `
      <label class="tag-opt">
        <input type="checkbox" name="tag" value="${tag}" />
        ${TAG_LABELS[tag]}
      </label>
    `).join('');
    const roles = NOTE_ROLES.map((role) => `<option value="${role}">${role}</option>`).join('');
    const root = this.shadowRoot!;
    root.innerHTML = `
      <style>${SHARED_STYLES}
        :host {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 2147483642;
          align-items: center;
          justify-content: center;
          background: rgba(246, 246, 248, 0.54);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        :host([open]) { display: flex; }
        .modal {
          width: min(500px, calc(100vw - 32px));
          max-height: min(680px, calc(100vh - 32px));
          display: flex;
          flex-direction: column;
          background: var(--an-surface);
          border: 1px solid var(--an-border);
          border-radius: var(--an-radius);
          box-shadow: var(--an-shadow);
          overflow: hidden;
          backdrop-filter: blur(22px) saturate(1.35);
          -webkit-backdrop-filter: blur(22px) saturate(1.35);
        }
        .header, .footer {
          padding: 13px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--an-border);
          background: rgba(255, 255, 255, 0.58);
        }
        .footer {
          justify-content: flex-end;
          gap: 8px;
          border-top: 1px solid var(--an-border);
          border-bottom: 0;
        }
        h3 { margin: 0; font-size: 15px; font-weight: 700; }
        .body {
          padding: 15px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
          overflow: auto;
        }
        .anchor-info {
          font-family: var(--an-mono);
          font-size: 11px;
          color: var(--an-text-muted);
          word-break: break-all;
          padding: 8px 10px;
          background: rgba(247, 247, 249, 0.8);
          border: 1px solid var(--an-border);
          border-radius: var(--an-radius-xs);
        }
        textarea { min-height: 92px; resize: vertical; }
        .tags { display: flex; flex-wrap: wrap; gap: 8px; }
        .tag-opt {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: 1px solid var(--an-border);
          border-radius: 999px;
          padding: 6px 9px;
          color: var(--an-text-muted);
          background: rgba(255, 255, 255, 0.55);
          cursor: pointer;
        }
        .tag-opt:has(input:checked) {
          border-color: rgba(0, 122, 255, 0.3);
          color: var(--an-accent);
          background: rgba(0, 122, 255, 0.1);
        }
        .dropzone {
          border: 1px dashed var(--an-border);
          border-radius: 14px;
          padding: 18px;
          color: var(--an-text-muted);
          text-align: center;
          background: rgba(247, 247, 249, 0.64);
        }
        .dropzone.dragover {
          border-color: var(--an-accent);
          background: rgba(0, 122, 255, 0.08);
        }
        .preview { display: flex; gap: 8px; flex-wrap: wrap; }
        .preview img {
          width: 64px;
          height: 64px;
          object-fit: cover;
          border: 1px solid var(--an-border);
          border-radius: 12px;
        }
      </style>
      <div class="modal">
        <div class="header">
          <h3>新增备注</h3>
          <button class="an-btn an-btn-ghost" id="close">关闭</button>
        </div>
        <div class="body an-scroll">
          <div class="anchor-info" id="anchor-info"></div>
          <textarea id="content" placeholder="描述希望 AI 或开发者修复的问题..."></textarea>
          <div class="tags">${tags}</div>
          <label>备注人角色
            <select id="role">${roles}</select>
          </label>
          <div class="dropzone" id="dropzone">
            拖拽图片到这里，或在文本框中粘贴截图
            <input id="file" type="file" accept="image/*" multiple hidden />
          </div>
          <div class="preview" id="preview"></div>
        </div>
        <div class="footer">
          <button class="an-btn an-btn-ghost" id="cancel">取消</button>
          <button class="an-btn an-btn-primary" id="submit">保存备注</button>
        </div>
      </div>
    `;
    this.bindEvents();
  }

  private bindEvents(): void {
    const root = this.shadowRoot!;
    root.getElementById('close')!.addEventListener('click', () => this.close());
    root.getElementById('cancel')!.addEventListener('click', () => this.close());
    root.getElementById('submit')!.addEventListener('click', () => this.submit());
    const dropzone = root.getElementById('dropzone')!;
    const file = root.getElementById('file') as HTMLInputElement;
    dropzone.addEventListener('click', () => file.click());
    dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
      this.addImages(Array.from(event.dataTransfer?.files ?? []).filter((item) => item.type.startsWith('image/')));
    });
    file.addEventListener('change', () => {
      this.addImages(Array.from(file.files ?? []));
      file.value = '';
    });
    root.getElementById('content')!.addEventListener('paste', (event) => {
      const items = (event as ClipboardEvent).clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const pasted = item.getAsFile();
          if (pasted) files.push(pasted);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        this.addImages(files);
      }
    });
  }

  private addImages(files: File[]): void {
    this.pendingImages.push(...files);
    this.renderPreviews();
  }

  private renderPreviews(): void {
    const preview = this.shadowRoot!.getElementById('preview')!;
    preview.innerHTML = '';
    this.pendingImages.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      const img = document.createElement('img');
      img.src = url;
      img.title = `${file.name}，点击移除`;
      img.addEventListener('click', () => {
        URL.revokeObjectURL(url);
        this.pendingImages.splice(index, 1);
        this.renderPreviews();
      });
      preview.appendChild(img);
    });
  }

  private submit(): void {
    if (!this.anchor) return;
    const root = this.shadowRoot!;
    const content = (root.getElementById('content') as HTMLTextAreaElement).value.trim();
    const tags = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="tag"]:checked')).map((item) => item.value as NoteTag);
    const role = (root.getElementById('role') as HTMLSelectElement).value as NoteRole;
    if (!content && this.pendingImages.length === 0) {
      window.alert('请填写备注内容或添加图片');
      return;
    }
    this.dispatchEvent(new CustomEvent<NoteFormSubmitDetail>('form-submit', {
      bubbles: true,
      composed: true,
      detail: {
        anchor: this.anchor,
        content,
        tags,
        role,
        imageFiles: [...this.pendingImages]
      }
    }));
    this.close();
  }
}

if (!customElements.get(AppNotesForm.tag)) {
  customElements.define(AppNotesForm.tag, AppNotesForm);
}
