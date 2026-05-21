import { AppNotesRoot } from './src/components/app-notes-root.js';
import { isDevEnvironment } from './src/utils/env.js';
import { getCurrentPagePath } from './src/utils/page-path.js';
import type { AppNotesConfig } from './src/types.js';

export type {
  AnchorHealth,
  AnchorEvidence,
  AnchorLayoutHint,
  AnchorMatchMethod,
  AppNotesConfig,
  CommentStatus,
  FlatNote,
  NoteAiContext,
  NoteAnchor,
  NoteComment,
  NoteRole,
  NoteTag,
  NotesFile,
  NotesFixRecord,
  NotesRuntimeContext
} from './src/types.js';

export { APP_NOTES_SCHEMA_VERSION } from './src/types.js';
export { AppNotesRoot } from './src/components/app-notes-root.js';
export { isDevEnvironment } from './src/utils/env.js';
export {
  getCurrentPagePath,
  isCurrentPagePath,
  isSamePagePath,
  LOCATION_CHANGE_EVENT,
  normalizePagePath,
  installPagePathSync
} from './src/utils/page-path.js';

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

/** 宿主 SPA 路由切换后调用，同步当前页备注气泡与列表上下文。 */
export function updateAppNotesPagePath(pagePath?: string): void {
  instance?.updatePagePath(pagePath);
}

void AppNotesRoot;
