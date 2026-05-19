import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppendCommentBody, ArchiveCommentBody, NoteComment, NotesFile } from './types.js';

const NOTES_DIR = '.app_notes';
const ASSETS_DIR = 'assets';

interface CacheEntry {
  mtimeMs: number;
  data: NotesFile;
}

export class NotesStorage {
  private rootDir: string;
  private notesDir: string;
  private assetsDir: string;
  private writeQueue = Promise.resolve();
  private cache = new Map<string, CacheEntry>();

  constructor(projectRoot: string) {
    this.rootDir = path.resolve(projectRoot);
    this.notesDir = path.join(this.rootDir, NOTES_DIR);
    this.assetsDir = path.join(this.notesDir, ASSETS_DIR);
  }

  async ensureDirs(): Promise<void> {
    await fs.mkdir(this.assetsDir, { recursive: true });
  }

  resolveFileName(noteId: string): string {
    const safe = noteId.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
    return `${safe}.notes.json`;
  }

  async listNoteFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.notesDir, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.notes.json')).map((entry) => entry.name);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async readNotesFile(noteId: string): Promise<NotesFile | null> {
    const fileName = this.resolveFileName(noteId);
    try {
      return await this.readByFileName(fileName);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async readAll(pagePath?: string): Promise<NotesFile[]> {
    const files = await this.listNoteFiles();
    const result: NotesFile[] = [];
    for (const fileName of files) {
      const data = await this.readByFileName(fileName);
      if (!pagePath || data.anchor.pagePath === pagePath) result.push(data);
    }
    return result;
  }

  async appendComment(body: AppendCommentBody): Promise<NoteComment> {
    const noteId = body.anchor.noteId;
    return this.enqueue(async () => {
      await this.ensureDirs();
      const now = new Date().toISOString();
      const comment: NoteComment = {
        id: body.comment.id ?? randomUUID(),
        content: body.comment.content,
        images: body.comment.images ?? [],
        tags: body.comment.tags ?? [],
        role: body.comment.role,
        status: body.comment.status ?? 'open',
        createdAt: body.comment.createdAt ?? now
      };
      let file = await this.readNotesFile(noteId);
      if (!file) {
        file = {
          schemaVersion: 1,
          anchor: body.anchor,
          comments: [],
          meta: { createdAt: now, updatedAt: now }
        };
      } else {
        file.anchor = { ...file.anchor, ...body.anchor };
        file.meta = { createdAt: file.meta?.createdAt ?? now, updatedAt: now };
      }
      file.comments.push(comment);
      await this.writeNotesFile(noteId, file);
      return comment;
    });
  }

  async archiveComment(noteId: string, commentId: string, body: ArchiveCommentBody): Promise<NoteComment | null> {
    return this.enqueue(async () => {
      const file = await this.readNotesFile(noteId);
      if (!file) return null;
      const comment = file.comments.find((item) => item.id === commentId);
      if (!comment) return null;
      const now = new Date().toISOString();
      comment.status = body.status;
      comment.updatedAt = now;
      file.meta = { createdAt: file.meta?.createdAt ?? now, updatedAt: now };
      await this.writeNotesFile(noteId, file);
      return comment;
    });
  }

  async saveAsset(buffer: Buffer, originalName: string): Promise<{ filename: string; relativePath: string }> {
    await this.ensureDirs();
    const ext = path.extname(originalName) || '.png';
    const filename = `${randomUUID()}${ext}`;
    await fs.writeFile(path.join(this.assetsDir, filename), buffer);
    return { filename, relativePath: `${NOTES_DIR}/${ASSETS_DIR}/${filename}` };
  }

  getNotesDir(): string {
    return this.notesDir;
  }

  getAssetsDir(): string {
    return this.assetsDir;
  }

  private async readByFileName(fileName: string): Promise<NotesFile> {
    const filePath = path.join(this.notesDir, fileName);
    const stat = await fs.stat(filePath);
    const cached = this.cache.get(fileName);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = normalizeNotesFile(JSON.parse(raw) as Partial<NotesFile>);
    this.cache.set(fileName, { mtimeMs: stat.mtimeMs, data: parsed });
    return parsed;
  }

  private async writeNotesFile(noteId: string, file: NotesFile): Promise<void> {
    const fileName = this.resolveFileName(noteId);
    const filePath = path.join(this.notesDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(file, null, 2), 'utf-8');
    const stat = await fs.stat(filePath);
    this.cache.set(fileName, { mtimeMs: stat.mtimeMs, data: file });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(fn, fn);
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }
}

function normalizeNotesFile(file: Partial<NotesFile>): NotesFile {
  return {
    schemaVersion: 1,
    anchor: file.anchor!,
    comments: file.comments ?? [],
    meta: file.meta
  };
}
