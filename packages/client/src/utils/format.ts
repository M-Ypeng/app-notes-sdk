import type { NoteTag } from '../types.js';

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

export function tagClass(tag: NoteTag | string, prefix: 'bare' | 'tag' = 'tag'): string {
  const suffix = getTagClassSuffix(tag);
  return prefix === 'bare' ? suffix : `tag-${suffix}`;
}

function getTagClassSuffix(tag: NoteTag | string): string {
  switch (tag) {
    case '疑问':
      return 'question';
    case '变更建议':
      return 'change';
    case '逻辑补充':
      return 'logic';
    case '视觉规范':
      return 'visual';
    default:
      return 'neutral';
  }
}
