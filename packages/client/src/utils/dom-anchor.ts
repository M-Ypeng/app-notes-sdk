import type { AnchorHealth, NoteAnchor } from '../types.js';
import { findElementByXPath, getElementXPath } from './xpath.js';

export function resolveAnchorFromElement(el: Element, pagePath: string): NoteAnchor {
  const anchorEl = findNearestDataNoteElement(el) ?? el;
  const dataId = anchorEl.getAttribute('data-note-id');
  const tagName = anchorEl.tagName.toLowerCase();
  const xpath = getElementXPath(anchorEl);
  const cssSelector = getCssSelector(anchorEl);
  const textHint = getTextHint(anchorEl);
  const selectorHint = getSelectorHint(anchorEl);
  const selectors = unique([
    dataId ? `[data-note-id="${cssEscape(dataId)}"]` : undefined,
    anchorEl.id ? `#${cssEscape(anchorEl.id)}` : undefined,
    cssSelector
  ]);
  const noteId = dataId ?? `xpath_${simpleHash(xpath)}`;
  const health: AnchorHealth = dataId || anchorEl.id ? 'stable' : textHint ? 'medium' : 'low';

  return {
    noteId,
    pagePath,
    xpath,
    cssSelector,
    selectors,
    selectorHint,
    textHint,
    tagName,
    health
  };
}

export function findElementByAnchor(anchor: NoteAnchor): Element | null {
  if (anchor.noteId && !anchor.noteId.startsWith('xpath_')) {
    const byDataId = safeQuerySelector(`[data-note-id="${cssEscape(anchor.noteId)}"]`);
    if (byDataId) return byDataId;
  }

  for (const selector of anchor.selectors ?? []) {
    const el = safeQuerySelector(selector);
    if (isLikelyAnchorMatch(el, anchor, selector)) return el;
  }

  if (anchor.cssSelector) {
    const el = safeQuerySelector(anchor.cssSelector);
    if (isLikelyAnchorMatch(el, anchor, anchor.cssSelector)) return el;
  }

  if (anchor.xpath) {
    const el = findElementByXPath(anchor.xpath);
    if (isLikelyAnchorMatch(el, anchor)) return el;
  }

  return null;
}

export function getAnchorHealth(anchor: NoteAnchor): AnchorHealth {
  if (anchor.health) return anchor.health;
  if (anchor.noteId && !anchor.noteId.startsWith('xpath_')) return 'stable';
  if (hasStableSelector(anchor)) return 'stable';
  if (anchor.textHint && anchor.tagName) return 'medium';
  return 'low';
}

function findNearestDataNoteElement(el: Element): Element | null {
  const found = el.closest('[data-note-id]');
  return found && !isSdkElement(found) ? found : null;
}

function getCssSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    const dataId = current.getAttribute('data-note-id');
    if (dataId) {
      parts.unshift(`[data-note-id="${cssEscape(dataId)}"]`);
      break;
    }
    if (current.id) {
      parts.unshift(`#${cssEscape(current.id)}`);
      break;
    }
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function getSelectorHint(el: Element): string {
  const classes = typeof el.className === 'string'
    ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).map((name) => `.${name}`).join('')
    : '';
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : classes}`;
}

function getTextHint(el: Element): string | undefined {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 120) : undefined;
}

function isLikelyAnchorMatch(el: Element | null, anchor: NoteAnchor, selector?: string): el is Element {
  if (!el || isSdkElement(el)) return false;
  if (anchor.tagName && el.tagName.toLowerCase() !== anchor.tagName) return false;
  if (selector && isStableSelector(selector)) return true;
  if (!anchor.textHint) return false;
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.includes(anchor.textHint) || anchor.textHint.includes(text.slice(0, 80));
}

function safeQuerySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function hasStableSelector(anchor: NoteAnchor): boolean {
  return [anchor.cssSelector, ...(anchor.selectors ?? [])].some((selector) => selector && isStableSelector(selector));
}

function isStableSelector(selector: string): boolean {
  return selector.includes('[data-note-id=') || selector.startsWith('#');
}

function isSdkElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag.startsWith('app-notes-') || !!el.closest('app-notes-root');
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

function simpleHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
