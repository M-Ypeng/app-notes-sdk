#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoutes } from './routes.js';
import { NotesStorage } from './storage.js';

interface CliOptions {
  port: number;
  projectRoot: string;
}

function parseArgs(argv: string[]): CliOptions {
  let port = 3927;
  let projectRoot = process.cwd();
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') {
      port = Number(argv[++i]) || port;
    } else if (arg === '--root' || arg === '-r') {
      projectRoot = path.resolve(argv[++i] ?? projectRoot);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
app-notes-server

Usage:
  app-notes-server [options]

Options:
  -p, --port <number>  listen port, default 3927
  -r, --root <path>    project root, default cwd
  -h, --help           show help
`);
      process.exit(0);
    }
  }
  return { port, projectRoot };
}

export async function startServer(options?: Partial<CliOptions>): Promise<{ port: number; projectRoot: string; close: () => void }> {
  const parsed = parseArgs(process.argv);
  const port = options?.port ?? parsed.port;
  const projectRoot = options?.projectRoot ?? parsed.projectRoot;
  const storage = new NotesStorage(projectRoot);
  await storage.ensureDirs();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createRoutes(storage));

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`[app-notes-server] listening on http://localhost:${port}`);
      console.log(`[app-notes-server] notes dir: ${storage.getNotesDir()}`);
      resolve({ port, projectRoot, close: () => server.close() });
    });
  });
}

function isCliEntry(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(path.resolve(process.argv[1]));
  } catch {
    return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  }
}

if (isCliEntry()) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
