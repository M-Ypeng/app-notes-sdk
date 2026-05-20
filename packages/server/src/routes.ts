import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import type { AppendCommentBody, ArchiveCommentBody, UpdateAnchorBody } from './types.js';
import { NotesStorage } from './storage.js';

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('INVALID_IMAGE_TYPE'));
  }
});

export function createRoutes(storage: NotesStorage): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, notesDir: storage.getNotesDir() });
  });

  router.get('/notes', async (req, res, next) => {
    try {
      const pagePath = typeof req.query.pagePath === 'string' ? req.query.pagePath : undefined;
      const files = await storage.readAll(pagePath);
      res.json({ pagePath, files });
    } catch (error) {
      next(error);
    }
  });

  router.get('/notes/:noteId', async (req, res, next) => {
    try {
      const file = await storage.readNotesFile(req.params.noteId);
      if (!file) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.json(file);
    } catch (error) {
      next(error);
    }
  });

  router.post('/notes', async (req, res, next) => {
    try {
      const body = req.body as AppendCommentBody;
      if (!body?.anchor?.noteId) {
        res.status(400).json({ error: 'anchor.noteId is required' });
        return;
      }
      if (!body.comment?.content?.trim() && !body.comment?.images?.length) {
        res.status(400).json({ error: 'comment content or images required' });
        return;
      }
      const comment = await storage.appendComment(body);
      res.status(201).json({ comment, fileName: storage.resolveFileName(body.anchor.noteId) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/notes/:noteId/comments/:commentId', async (req, res, next) => {
    try {
      const body = req.body as ArchiveCommentBody;
      if (!body?.status || !['open', 'archived'].includes(body.status)) {
        res.status(400).json({ error: 'invalid status' });
        return;
      }
      const comment = await storage.archiveComment(req.params.noteId, req.params.commentId, body);
      if (!comment) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.json({ comment });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/notes/:noteId/anchor', async (req, res, next) => {
    try {
      const body = req.body as UpdateAnchorBody;
      if (!body?.anchor?.noteId) {
        res.status(400).json({ error: 'anchor.noteId is required' });
        return;
      }
      const file = await storage.updateAnchor(req.params.noteId, body.anchor);
      if (!file) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.json({ file });
    } catch (error) {
      next(error);
    }
  });

  router.post('/upload', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'file required' });
        return;
      }
      res.status(201).json(await storage.saveAsset(req.file.buffer, req.file.originalname));
    } catch (error) {
      next(error);
    }
  });

  router.use('/assets', (req, res, next) => {
    const file = path.basename(req.path);
    if (!file || file.includes('..')) {
      res.status(400).end();
      return;
    }
    res.sendFile(path.join(storage.getAssetsDir(), file), (error) => {
      if (error) next();
    });
  });

  router.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (error.message === 'INVALID_IMAGE_TYPE') {
      res.status(400).json({ error: 'only image uploads are allowed' });
      return;
    }
    console.error('[app-notes-server]', error);
    res.status(500).json({ error: error.message || 'INTERNAL_ERROR' });
  });

  return router;
}
