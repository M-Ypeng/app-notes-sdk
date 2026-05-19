import { AppNotesRoot } from './src/components/app-notes-root.js';
import { isDevEnvironment } from './src/utils/env.js';
import type { AppNotesConfig } from './src/types.js';

export type {
  AnchorHealth,
  AppNotesConfig,
  CommentStatus,
  FlatNote,
  NoteAnchor,
  NoteComment,
  NoteRole,
  NoteTag,
  NotesFile
} from './src/types.js';

export { AppNotesRoot } from './src/components/app-notes-root.js';
export { isDevEnvironment } from './src/utils/env.js';

let instance: AppNotesRoot | null = null;

export function initAppNotes(config: AppNotesConfig = {}): AppNotesRoot | null {
  if (config.enabled === false) return null;
  if (config.enabled !== true && !isDevEnvironment()) return null;
  if (instance) {
    instance.init(config);
    return instance;
  }
  instance = document.createElement(AppNotesRoot.tag) as AppNotesRoot;
  document.body.appendChild(instance);
  instance.init(config);
  return instance;
}

export function destroyAppNotes(): void {
  instance?.destroy();
  instance = null;
}

export function registerAppNotesElements(): void {
  void AppNotesRoot;
}

registerAppNotesElements();
