import { SHARED_STYLES } from '../styles/shared.js';
import { NOTE_ROLES, NOTE_TAGS, TAG_LABELS, type NoteAiContext, type NoteAnchor, type NoteRole, type NoteTag } from '../types.js';
import { clamp, escapeAttr, tagClass } from '../utils/format.js';

export interface NoteFormSubmitDetail {
  anchor: NoteAnchor;
  content: string;
  tags: NoteTag[];
  role: NoteRole;
  imageFiles: File[];
  ai?: NoteAiContext;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export class AppNotesForm extends HTMLElement {
  static readonly tag = 'app-notes-form';

  private anchor: NoteAnchor | null = null;
  private target: Element | null = null;
  private pendingImages: File[] = [];
  private screenshotOverlay: HTMLDivElement | null = null;
  private submitting = false;
  private raf = 0;

  private reposition = (): void => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.updatePosition());
  };

  connectedCallback(): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.render();
    }
  }

  open(anchor: NoteAnchor, target?: Element | null): void {
    this.anchor = anchor;
    this.target = target ?? null;
    this.pendingImages = [];
    this.setSubmitting(false);
    this.setError('');
    this.setAttribute('open', '');
    const root = this.shadowRoot!;
    (root.getElementById('content') as HTMLTextAreaElement).value = '';
    (root.getElementById('expected') as HTMLTextAreaElement).value = '';
    (root.getElementById('actual') as HTMLTextAreaElement).value = '';
    (root.getElementById('steps') as HTMLTextAreaElement).value = '';
    (root.getElementById('fix-hints') as HTMLTextAreaElement).value = '';
    (root.getElementById('role') as HTMLSelectElement).value = 'PM';
    root.querySelectorAll<HTMLInputElement>('input[name="tag"]').forEach((input) => { input.checked = false; });
    root.getElementById('preview')!.innerHTML = '';
    this.updatePosition();
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    window.visualViewport?.addEventListener('resize', this.reposition);
    this.dispatchEvent(new CustomEvent('form-open', { bubbles: true, composed: true }));
    window.setTimeout(() => (root.getElementById('content') as HTMLTextAreaElement).focus());
  }

  close(): void {
    const wasOpen = this.hasAttribute('open');
    this.removeAttribute('open');
    this.anchor = null;
    this.target = null;
    this.pendingImages = [];
    this.setSubmitting(false);
    this.setError('');
    this.cancelScreenshotSelection();
    cancelAnimationFrame(this.raf);
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    if (wasOpen) this.dispatchEvent(new CustomEvent('form-close', { bubbles: true, composed: true }));
  }

  private render(): void {
    const tags = NOTE_TAGS.map((tag) => `
      <label class="tag-chip ${tagClass(tag, 'bare')}">
        <input type="checkbox" name="tag" value="${tag}" />
        <span>${TAG_LABELS[tag]}</span>
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
          pointer-events: none;
        }
        :host([open]) { display: block; }
        :host([screenshot-mode]) .anchor-box,
        :host([screenshot-mode]) .connector,
        :host([screenshot-mode]) .pin,
        :host([screenshot-mode]) .composer {
          display: none;
        }
        .anchor-box {
          position: fixed;
          display: none;
          border: 2px solid var(--an-accent);
          background: rgba(0, 122, 255, 0.03);
          pointer-events: none;
        }
        .connector {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
        }
        .line {
          stroke: #76a4ff;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-dasharray: 6 8;
        }
        .pin {
          position: fixed;
          width: 22px;
          height: 22px;
          margin: -11px 0 0 -11px;
          border-radius: 999px;
          border: 4px solid #fff;
          background: var(--an-accent);
          box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.12), 0 8px 22px rgba(0, 122, 255, 0.18);
          pointer-events: none;
        }
        .composer {
          position: fixed;
          width: min(360px, calc(100vw - 24px));
          overflow: hidden;
          border: 1px solid var(--an-border);
          border-radius: 20px;
          background: rgba(247, 247, 249, 0.94);
          box-shadow: var(--an-shadow);
          pointer-events: auto;
          backdrop-filter: blur(24px) saturate(1.35);
          -webkit-backdrop-filter: blur(24px) saturate(1.35);
        }
        .header {
          height: 52px;
          padding: 10px 12px 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--an-border);
          background: rgba(242, 242, 245, 0.74);
        }
        .tab {
          height: 34px;
          min-width: 126px;
          padding: 0 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: rgba(60, 60, 67, 0.14);
          color: var(--an-text);
          font-size: 15px;
          font-weight: 700;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .role-select {
          width: 74px;
          height: 30px;
          padding: 0 24px 0 12px;
          border: 1px solid rgba(60, 60, 67, 0.14);
          border-radius: 999px;
          color: rgba(29, 29, 31, 0.84);
          font-size: 12px;
          font-weight: 650;
          line-height: 30px;
          background:
            linear-gradient(180deg, rgba(255,255,255,.92), rgba(246,246,248,.84));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.86), 0 1px 2px rgba(0,0,0,.05);
          outline: none;
        }
        .role-select:focus {
          border-color: rgba(0, 122, 255, 0.32);
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12), inset 0 1px 0 rgba(255,255,255,.86);
        }
        textarea {
          width: 100%;
          min-height: 92px;
          padding: 18px 20px;
          border: 0;
          border-radius: 0;
          background: rgba(255, 255, 255, 0.14);
          box-shadow: none;
          resize: none;
          font-size: 16px;
          line-height: 1.55;
        }
        textarea:focus {
          outline: 0;
          border-color: transparent;
          box-shadow: none;
        }
        .ai-details {
          border-top: 1px solid rgba(60, 60, 67, 0.08);
          background: rgba(255, 255, 255, 0.14);
        }
        .ai-details summary {
          cursor: pointer;
          padding: 10px 18px;
          color: var(--an-text-muted);
          font-size: 12px;
          font-weight: 700;
          user-select: none;
        }
        .ai-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 0 18px 12px;
        }
        .ai-field {
          min-width: 0;
        }
        .ai-field.full {
          grid-column: 1 / -1;
        }
        .ai-field label {
          display: block;
          margin: 0 0 4px;
          color: var(--an-text-muted);
          font-size: 10px;
          font-weight: 700;
        }
        .ai-field textarea {
          min-height: 52px;
          padding: 8px 10px;
          border: 1px solid rgba(60, 60, 67, 0.1);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.62);
          font-size: 12px;
          line-height: 1.45;
        }
        .ai-field.full textarea {
          min-height: 48px;
        }
        .tags {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          padding: 0 18px 12px;
          background: rgba(255, 255, 255, 0.14);
        }
        .tag-chip {
          display: inline-flex;
          align-items: center;
          cursor: pointer;
          user-select: none;
        }
        .tag-chip input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .tag-chip span {
          min-height: 26px;
          display: inline-flex;
          align-items: center;
          padding: 5px 9px;
          border: 1px solid var(--tag-border);
          border-radius: 999px;
          color: var(--tag-color);
          background: var(--tag-bg);
          font-size: 12px;
          font-weight: 650;
          transition: background 0.14s, color 0.14s, border-color 0.14s;
        }
        .tag-chip.question { --tag-color: #0a84ff; --tag-bg: rgba(10,132,255,.08); --tag-border: rgba(10,132,255,.18); --tag-active-bg: rgba(10,132,255,.16); --tag-active-border: rgba(10,132,255,.42); }
        .tag-chip.change { --tag-color: #ff9500; --tag-bg: rgba(255,149,0,.1); --tag-border: rgba(255,149,0,.2); --tag-active-bg: rgba(255,149,0,.18); --tag-active-border: rgba(255,149,0,.45); }
        .tag-chip.logic { --tag-color: #34a853; --tag-bg: rgba(52,168,83,.1); --tag-border: rgba(52,168,83,.2); --tag-active-bg: rgba(52,168,83,.18); --tag-active-border: rgba(52,168,83,.42); }
        .tag-chip.visual { --tag-color: #af52de; --tag-bg: rgba(175,82,222,.1); --tag-border: rgba(175,82,222,.2); --tag-active-bg: rgba(175,82,222,.18); --tag-active-border: rgba(175,82,222,.44); }
        .tag-chip input:checked + span {
          border-color: var(--tag-active-border);
          background: var(--tag-active-bg);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--tag-color) 12%, transparent);
        }
        .preview-wrap {
          min-height: 66px;
          padding: 12px 18px;
          border-top: 1px solid var(--an-border);
          background: rgba(255, 255, 255, 0.22);
        }
        .preview {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .thumb {
          position: relative;
          width: 64px;
          height: 64px;
        }
        .preview img {
          width: 64px;
          height: 64px;
          object-fit: cover;
          border: 1px solid var(--an-border);
          border-radius: 10px;
          background: #fff;
          cursor: pointer;
        }
        .remove-img {
          position: absolute;
          right: -6px;
          top: -6px;
          width: 20px;
          height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(29, 29, 31, 0.82);
          color: #fff;
          font-size: 14px;
          line-height: 1;
          box-shadow: 0 3px 10px rgba(0,0,0,.18);
        }
        .remove-img:hover { background: #ff3b30; }
        .footer {
          height: 64px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid var(--an-border);
          background: rgba(242, 242, 245, 0.74);
        }
        .media-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .icon-btn {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          border: 1px solid transparent;
          color: var(--icon-color);
          background: var(--icon-bg);
        }
        .icon-btn:hover {
          border-color: var(--icon-border);
          background: var(--icon-hover-bg);
        }
        .icon-btn.image { --icon-color: #0a84ff; --icon-bg: rgba(10,132,255,.09); --icon-hover-bg: rgba(10,132,255,.16); --icon-border: rgba(10,132,255,.28); }
        .icon-btn.camera { --icon-color: #af52de; --icon-bg: rgba(175,82,222,.1); --icon-hover-bg: rgba(175,82,222,.18); --icon-border: rgba(175,82,222,.3); }
        .icon-btn svg {
          width: 23px;
          height: 23px;
        }
        .submit {
          min-width: 78px;
          height: 40px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border-radius: 999px;
          background: linear-gradient(180deg, #0a84ff, #007aff);
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 10px 22px rgba(0, 122, 255, 0.26), inset 0 1px 0 rgba(255,255,255,.26);
        }
        .submit:hover { background: linear-gradient(180deg, #2291ff, #0a84ff); }
        .submit:active { transform: scale(.98); }
        .submit:disabled {
          cursor: default;
          opacity: .68;
          transform: none;
        }
        .submit svg {
          width: 17px;
          height: 17px;
        }
        .error {
          display: none;
          padding: 0 18px 12px;
          color: #d70015;
          font-size: 12px;
          line-height: 1.45;
          background: rgba(255, 255, 255, 0.14);
        }
        .error[open] {
          display: block;
        }
      </style>
      <svg class="connector" aria-hidden="true"><line class="line" x1="0" y1="0" x2="0" y2="0"></line></svg>
      <div class="anchor-box"></div>
      <div class="pin"></div>
      <div class="composer">
        <div class="header">
          <div class="tab">批注</div>
          <div class="header-actions">
            <select class="role-select" id="role" aria-label="备注人角色">${roles}</select>
            <button class="an-dismiss" id="close" type="button" aria-label="关闭"></button>
          </div>
        </div>
        <textarea id="content" placeholder="写下需要修复的问题..."></textarea>
        <details class="ai-details">
          <summary>补充给 AI 的信息</summary>
          <div class="ai-grid">
            <div class="ai-field">
              <label for="expected">期望</label>
              <textarea id="expected" placeholder="应该发生什么"></textarea>
            </div>
            <div class="ai-field">
              <label for="actual">实际</label>
              <textarea id="actual" placeholder="现在发生了什么"></textarea>
            </div>
            <div class="ai-field full">
              <label for="steps">复现步骤</label>
              <textarea id="steps" placeholder="每行一步，例如：点击新增批注"></textarea>
            </div>
            <div class="ai-field full">
              <label for="fix-hints">修复线索</label>
              <textarea id="fix-hints" placeholder="每行一条，例如：检查 note-form 的 click 绑定"></textarea>
            </div>
          </div>
        </details>
        <div class="tags">${tags}</div>
        <div class="error" id="error" role="alert"></div>
        <div class="preview-wrap" id="dropzone">
          <div class="preview" id="preview"></div>
        </div>
        <div class="footer">
          <div class="media-actions">
            <button class="icon-btn image" id="pick-image" type="button" aria-label="从文件夹选择图片" title="从文件夹选择图片">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 15l3-3 2.5 2.5L15 13l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/></svg>
            </button>
            <button class="icon-btn camera" id="screenshot" type="button" aria-label="截图" title="截图">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7.5 10 5h4l1.5 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h3.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
            </button>
          </div>
          <button class="submit" id="submit" type="button" aria-label="保存备注">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>提交</span>
          </button>
        </div>
      </div>
      <input id="file" type="file" accept="image/*" multiple hidden />
    `;
    this.bindEvents();
  }

  private bindEvents(): void {
    const root = this.shadowRoot!;
    const file = root.getElementById('file') as HTMLInputElement;
    const dropzone = root.getElementById('dropzone')!;
    root.getElementById('close')!.addEventListener('click', () => this.close());
    root.getElementById('submit')!.addEventListener('click', () => this.submit());
    root.getElementById('pick-image')!.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      file.click();
    });
    root.getElementById('screenshot')!.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.startScreenshotSelection();
    });
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
    root.addEventListener('paste', (event) => {
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
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      const img = document.createElement('img');
      img.src = url;
      img.title = `${file.name}，点击查看`;
      img.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openImagePreview(url, file.name);
      });
      img.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.removeImage(index, url);
      });
      const remove = document.createElement('button');
      remove.className = 'remove-img';
      remove.type = 'button';
      remove.setAttribute('aria-label', '删除图片');
      remove.title = '删除图片';
      remove.textContent = '×';
      remove.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.removeImage(index, url);
      });
      wrap.append(img, remove);
      preview.appendChild(wrap);
    });
    this.updatePosition();
  }

  private removeImage(index: number, url: string): void {
        URL.revokeObjectURL(url);
        this.pendingImages.splice(index, 1);
        this.renderPreviews();
  }

  private openImagePreview(url: string, title: string): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px;
      background: rgba(0,0,0,.68);
      cursor: zoom-out;
    `;
    overlay.innerHTML = `
      <img src="${escapeAttr(url)}" alt="${escapeAttr(title)}" style="
        max-width: min(100%, 1120px);
        max-height: 100%;
        object-fit: contain;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 24px 60px rgba(0,0,0,.35);
        cursor: default;
      " />
      <button type="button" aria-label="关闭预览" style="
        position: fixed;
        right: 22px;
        top: 22px;
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: 999px;
        background: rgba(255,255,255,.92);
        color: #1d1d1f;
        font: 22px/1 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        cursor: pointer;
      ">×</button>
    `;
    const close = (): void => overlay.remove();
    overlay.addEventListener('click', close);
    overlay.querySelector('img')!.addEventListener('click', (event) => event.stopPropagation());
    overlay.querySelector('button')!.addEventListener('click', close);
    document.body.appendChild(overlay);
  }

  private startScreenshotSelection(): void {
    this.cancelScreenshotSelection();
    this.setAttribute('screenshot-mode', '');

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      cursor: crosshair;
      background: rgba(0, 0, 0, 0.62);
      pointer-events: auto;
    `;
    overlay.innerHTML = `
      <div data-box style="
        position: fixed;
        display: none;
        border: 2px dashed #6f6cff;
        background: rgba(255,255,255,0.48);
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.24);
      "></div>
      <button data-attach type="button" style="
        position: fixed;
        display: none;
        height: 42px;
        padding: 0 22px;
        border: 0;
        border-radius: 9px;
        background: #5e5ce6;
        color: #fff;
        font: 600 14px/1 system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
        box-shadow: 0 14px 32px rgba(94,92,230,.32);
        cursor: pointer;
      ">附加到备注</button>
      <div data-tip style="
        position: fixed;
        left: 50%;
        top: 18px;
        transform: translateX(-50%);
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255,255,255,.92);
        color: #1d1d1f;
        font: 12px/1 system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
      ">拖拽选择截图区域，Esc 取消</div>
    `;

    let startX = 0;
    let startY = 0;
    let selection: DOMRect | null = null;
    const box = overlay.querySelector<HTMLElement>('[data-box]')!;
    const attach = overlay.querySelector<HTMLButtonElement>('[data-attach]')!;

    const draw = (x: number, y: number): void => {
      const left = Math.min(startX, x);
      const top = Math.min(startY, y);
      const width = Math.abs(x - startX);
      const height = Math.abs(y - startY);
      selection = new DOMRect(left, top, width, height);
      box.style.display = 'block';
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      attach.style.display = width > 12 && height > 12 ? 'block' : 'none';
      attach.style.left = `${left + width / 2}px`;
      attach.style.top = `${top + height + 12}px`;
      attach.style.transform = 'translateX(-50%)';
    };

    const pointerDown = (event: PointerEvent): void => {
      if ((event.target as HTMLElement).dataset.attach !== undefined) return;
      event.preventDefault();
      startX = event.clientX;
      startY = event.clientY;
      draw(startX, startY);
      overlay.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent): void => {
      if (!overlay.hasPointerCapture(event.pointerId)) return;
      event.preventDefault();
      draw(event.clientX, event.clientY);
    };
    const pointerUp = (event: PointerEvent): void => {
      if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
    };
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') this.cancelScreenshotSelection();
    };

    attach.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (selection && selection.width > 12 && selection.height > 12) {
        void this.captureScreenshot(selection);
      }
    });
    overlay.addEventListener('pointerdown', pointerDown);
    overlay.addEventListener('pointermove', pointerMove);
    overlay.addEventListener('pointerup', pointerUp);
    document.addEventListener('keydown', keyDown, true);
    overlay.addEventListener('app-notes-cleanup', () => {
      document.removeEventListener('keydown', keyDown, true);
    }, { once: true });

    document.body.appendChild(overlay);
    this.screenshotOverlay = overlay;
  }

  private cancelScreenshotSelection(): void {
    this.removeAttribute('screenshot-mode');
    if (!this.screenshotOverlay) return;
    this.screenshotOverlay.dispatchEvent(new CustomEvent('app-notes-cleanup'));
    this.screenshotOverlay.remove();
    this.screenshotOverlay = null;
  }

  private async captureScreenshot(selection: DOMRect): Promise<void> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      window.alert('当前浏览器不支持截图，请使用上传图片或粘贴截图。');
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'tab'
        } as MediaTrackConstraints,
        audio: false,
        preferCurrentTab: true
      } as DisplayMediaStreamOptions & { preferCurrentTab?: boolean });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const width = video.videoWidth || stream.getVideoTracks()[0]?.getSettings().width || window.innerWidth;
      const height = video.videoHeight || stream.getVideoTracks()[0]?.getSettings().height || window.innerHeight;
      const scaleX = width / window.innerWidth;
      const scaleY = height / window.innerHeight;
      const cropX = Math.max(0, Math.round(selection.x * scaleX));
      const cropY = Math.max(0, Math.round(selection.y * scaleY));
      const cropWidth = Math.min(width - cropX, Math.round(selection.width * scaleX));
      const cropHeight = Math.min(height - cropY, Math.round(selection.height * scaleY));
      const canvas = document.createElement('canvas');
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      canvas.getContext('2d')?.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) this.addImages([new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })]);
    } catch (error) {
      if ((error as DOMException).name !== 'NotAllowedError') {
        console.warn('[app-notes] screenshot failed', error);
        window.alert('截图失败，可以改用上传图片或粘贴截图。');
      }
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      this.cancelScreenshotSelection();
    }
  }

  private submit(): void {
    if (!this.anchor || this.submitting) return;
    const root = this.shadowRoot!;
    const content = (root.getElementById('content') as HTMLTextAreaElement).value.trim();
    const ai = readAiContext(root);
    const tags = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="tag"]:checked')).map((item) => item.value as NoteTag);
    const role = (root.getElementById('role') as HTMLSelectElement).value as NoteRole;
    if (!content && this.pendingImages.length === 0) {
      window.alert('请填写备注内容或添加图片');
      return;
    }
    this.setError('');
    this.setSubmitting(true);
    this.dispatchEvent(new CustomEvent<NoteFormSubmitDetail>('form-submit', {
      bubbles: true,
      composed: true,
      detail: {
        anchor: this.anchor,
        content,
        tags,
        role,
        imageFiles: [...this.pendingImages],
        ai,
        onSuccess: () => this.close(),
        onError: (error) => {
          this.setSubmitting(false);
          this.setError(getSubmitErrorMessage(error));
        }
      }
    }));
  }

  private setSubmitting(submitting: boolean): void {
    this.submitting = submitting;
    const button = this.shadowRoot?.getElementById('submit') as HTMLButtonElement | null;
    if (!button) return;
    button.disabled = submitting;
    const label = button.querySelector('span');
    if (label) label.textContent = submitting ? '提交中' : '提交';
  }

  private setError(message: string): void {
    const error = this.shadowRoot?.getElementById('error');
    if (!error) return;
    error.textContent = message;
    if (message) error.setAttribute('open', '');
    else error.removeAttribute('open');
  }

  private updatePosition(): void {
    if (!this.shadowRoot || !this.hasAttribute('open')) return;
    const composer = this.shadowRoot.querySelector<HTMLElement>('.composer')!;
    const anchorBox = this.shadowRoot.querySelector<HTMLElement>('.anchor-box')!;
    const pin = this.shadowRoot.querySelector<HTMLElement>('.pin')!;
    const line = this.shadowRoot.querySelector<SVGLineElement>('.line')!;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const targetRect = this.target?.getBoundingClientRect();
    const rect = targetRect && (targetRect.width > 0 || targetRect.height > 0)
      ? targetRect
      : new DOMRect(viewportWidth / 2, viewportHeight / 2, 1, 1);
    const width = Math.min(360, viewportWidth - 24);
    const composerHeight = composer.getBoundingClientRect().height || 250;
    const gap = 18;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    anchorBox.style.display = 'block';
    anchorBox.style.left = `${rect.left}px`;
    anchorBox.style.top = `${rect.top}px`;
    anchorBox.style.width = `${rect.width}px`;
    anchorBox.style.height = `${rect.height}px`;

    let left = rect.right + gap;
    if (left + width > viewportWidth - 12) left = rect.left - width - gap;
    if (left < 12) left = Math.max(12, viewportWidth - width - 12);
    const top = clamp(centerY - 48, 12, viewportHeight - composerHeight - 12);
    composer.style.width = `${width}px`;
    composer.style.left = `${left}px`;
    composer.style.top = `${top}px`;

    const pinX = centerX;
    const pinY = centerY;
    pin.style.left = `${pinX}px`;
    pin.style.top = `${pinY}px`;
    line.setAttribute('x1', String(pinX));
    line.setAttribute('y1', String(pinY));
    line.setAttribute('x2', String(left < pinX ? left + width : left));
    line.setAttribute('y2', String(pinY));
  }
}

function getSubmitErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return `提交失败：${error.message}`;
  return '提交失败：请检查本地备注服务是否启动后重试。';
}

function readAiContext(root: ShadowRoot): NoteAiContext | undefined {
  const expected = (root.getElementById('expected') as HTMLTextAreaElement).value.trim();
  const actual = (root.getElementById('actual') as HTMLTextAreaElement).value.trim();
  const stepsToReproduce = splitLines((root.getElementById('steps') as HTMLTextAreaElement).value);
  const fixHints = splitLines((root.getElementById('fix-hints') as HTMLTextAreaElement).value);
  if (!expected && !actual && stepsToReproduce.length === 0 && fixHints.length === 0) return undefined;
  return {
    ...(expected ? { expected } : {}),
    ...(actual ? { actual } : {}),
    ...(stepsToReproduce.length ? { stepsToReproduce } : {}),
    ...(fixHints.length ? { fixHints } : {})
  };
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

if (!customElements.get(AppNotesForm.tag)) {
  customElements.define(AppNotesForm.tag, AppNotesForm);
}
