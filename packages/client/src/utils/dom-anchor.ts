import type { AnchorHealth, AnchorLayoutHint, NoteAnchor } from '../types.js';
import { findElementByXPath, getElementXPath } from './xpath.js';

const MIN_SCORE_STABLE = 70;
const MIN_SCORE_MEDIUM = 42;
const MIN_SCORE_LOW = 24;

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
  const health = computeAnchorHealth(anchorEl, { noteId, selectors, cssSelector, textHint });
  const layoutHint = getLayoutHint(anchorEl);

  return {
    noteId,
    pagePath,
    xpath,
    cssSelector,
    selectors,
    selectorHint,
    textHint,
    tagName,
    health,
    layoutHint
  };
}

export function findElementByAnchor(anchor: NoteAnchor): Element | null {
  if (anchor.noteId && !anchor.noteId.startsWith('xpath_')) {
    const byDataId = safeQuerySelector(`[data-note-id="${cssEscape(anchor.noteId)}"]`);
    if (byDataId && !isSdkElement(byDataId) && isElementVisibleForAnchor(byDataId)) return byDataId;
    if (byDataId && !isSdkElement(byDataId)) return byDataId;
  }

  const candidates = collectCandidates(anchor);
  if (candidates.length === 0) return null;

  const minScore = getMinAcceptScore(anchor);
  const pickBest = (pool: Element[]): { el: Element | null; score: number } => {
    let best: Element | null = null;
    let bestScore = 0;
    for (const el of pool) {
      const score = scoreAnchorMatch(el, anchor);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return { el: best, score: bestScore };
  };

  const visible = candidates.filter(isElementVisibleForAnchor);
  const visiblePick = pickBest(visible.length > 0 ? visible : candidates);
  if (visiblePick.el && visiblePick.score >= minScore) return visiblePick.el;

  const anyPick = pickBest(candidates);
  if (!anyPick.el || anyPick.score < minScore) return null;
  if (isElementVisibleForAnchor(anyPick.el)) return anyPick.el;
  if (hasStableSelector(anchor)) return anyPick.el;
  return null;
}

export function getAnchorHealth(anchor: NoteAnchor): AnchorHealth {
  if (anchor.health === 'invalid' || anchor.health === 'rebind_required') return anchor.health;
  return inferAnchorHealth(anchor);
}

export function inferAnchorHealth(anchor: NoteAnchor): AnchorHealth {
  if (anchor.health === 'stable' || anchor.health === 'medium' || anchor.health === 'low') return anchor.health;
  if (anchor.noteId && !anchor.noteId.startsWith('xpath_')) return 'stable';
  if (hasStableSelector(anchor)) return 'stable';
  if (anchor.textHint && anchor.tagName) return 'medium';
  return 'low';
}

function computeAnchorHealth(
  el: Element,
  meta: { noteId: string; selectors: string[]; cssSelector?: string; textHint?: string }
): AnchorHealth {
  if (meta.noteId && !meta.noteId.startsWith('xpath_')) return 'stable';
  if (meta.selectors.some((selector) => isStableSelector(selector))) return 'stable';
  if (meta.cssSelector && isUniqueSelector(meta.cssSelector) && isStableSelector(meta.cssSelector)) {
    return 'stable';
  }
  const directText = getDirectText(el);
  if (directText && directText.length >= 2 && directText.length <= 80) return 'medium';
  if (meta.textHint && meta.textHint.length >= 4) return 'medium';
  return 'low';
}

function collectCandidates(anchor: NoteAnchor): Element[] {
  const seen = new Set<Element>();
  const add = (el: Element | null): void => {
    if (!el || isSdkElement(el) || seen.has(el)) return;
    seen.add(el);
  };
  const addAll = (selector: string | undefined): void => {
    if (!selector) return;
    for (const el of safeQueryAll(selector)) add(el);
  };

  for (const selector of anchor.selectors ?? []) {
    addAll(selector);
  }
  addAll(anchor.cssSelector);
  if (anchor.xpath) add(findElementByXPath(anchor.xpath));

  if (anchor.textHint && anchor.textHint.length >= 2) {
    for (const el of queryByTextHint(anchor)) add(el);
  }

  return Array.from(seen);
}

function queryByTextHint(anchor: NoteAnchor): Element[] {
  const hint = normalizeText(anchor.textHint ?? '');
  if (!hint || hint.length < 2) return [];

  const tag = anchor.tagName?.toLowerCase();
  const selector = tag ? `${tag}, ${tag} *` : 'button, a, label, p, span, h1, h2, h3, h4, h5, h6, li, td, th, div';
  const nodes = Array.from(document.querySelectorAll(selector));
  const matches: Element[] = [];

  for (const node of nodes) {
    if (!(node instanceof Element) || isSdkElement(node) || isGenericContainer(node)) continue;
    if (tag && node.tagName.toLowerCase() !== tag) continue;
    if (scoreTextMatch(node, hint) >= 35) matches.push(node);
  }

  return matches.slice(0, 12);
}

function scoreAnchorMatch(el: Element, anchor: NoteAnchor): number {
  if (isSdkElement(el) || isGenericContainer(el)) return 0;
  if (!isElementVisibleForAnchor(el)) {
    if (hasStableSelector(anchor) && elementMatchesStable(el, anchor)) return 8;
    return 0;
  }

  if (anchor.tagName && el.tagName.toLowerCase() !== anchor.tagName) return 0;

  let score = 10;

  if (anchor.noteId && !anchor.noteId.startsWith('xpath_')) {
    if (el.getAttribute('data-note-id') === anchor.noteId) return 100;
  }

  for (const selector of anchor.selectors ?? []) {
    if (!selector || !isStableSelector(selector)) continue;
    if (!elementMatches(el, selector)) continue;
    score += 75;
    break;
  }

  if (anchor.cssSelector) {
    const count = countMatches(anchor.cssSelector);
    if (elementMatches(el, anchor.cssSelector)) {
      if (count === 1) score += 35;
      else score -= 25 * Math.min(count - 1, 3);
    }
  }

  if (anchor.xpath) {
    const current = getElementXPath(el);
    if (current === anchor.xpath) score += 40;
    else if (sameXPathTail(current, anchor.xpath)) score += 12;
    else score -= 10;
  }

  if (anchor.textHint) {
    const textScore = scoreTextMatch(el, anchor.textHint);
    if (textScore === 0 && !hasStableSelector(anchor)) return 0;
    score += textScore;
  } else if (!hasStableSelector(anchor)) {
    return 0;
  }

  if (anchor.selectorHint) {
    const hint = anchor.selectorHint.toLowerCase();
    const actual = getSelectorHint(el).toLowerCase();
    if (actual === hint) score += 8;
  }

  score += scoreLayoutHint(el, anchor.layoutHint);

  return Math.max(0, score);
}

function scoreTextMatch(el: Element, hint: string): number {
  const hintNorm = normalizeText(hint);
  if (!hintNorm) return 0;

  const direct = normalizeText(getDirectText(el));
  const full = normalizeText(el.textContent ?? '');

  if (direct) {
    if (direct === hintNorm) return 50;
    if (hintNorm.length >= 4 && direct.includes(hintNorm)) {
      return direct.length <= hintNorm.length * 2 ? 45 : 30;
    }
  }

  if (!full) return 0;
  if (full === hintNorm) return 42;

  if (hintNorm.length < 4) {
    return direct === hintNorm ? 38 : 0;
  }

  if (!full.includes(hintNorm)) return 0;

  const ratio = hintNorm.length / full.length;
  if (ratio < 0.08) return 0;
  if (ratio < 0.2) return 12;
  if (ratio < 0.45) return 28;
  return 36;
}

function getMinAcceptScore(anchor: NoteAnchor): number {
  const health = getAnchorHealth(anchor);
  if (health === 'stable') return MIN_SCORE_STABLE;
  if (health === 'medium') return MIN_SCORE_MEDIUM;
  return MIN_SCORE_LOW;
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
  const classes =
    typeof el.className === 'string'
      ? el.className
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((name) => `.${name}`)
          .join('')
      : '';
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : classes}`;
}

function getTextHint(el: Element): string | undefined {
  const direct = normalizeText(getDirectText(el));
  const text = direct || normalizeText(el.textContent ?? '');
  return text ? text.slice(0, 120) : undefined;
}

function getDirectText(el: Element): string {
  return Array.from(el.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('');
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isGenericContainer(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (['html', 'body', 'main', 'nav', 'header', 'footer'].includes(tag)) return true;
  const rect = el.getBoundingClientRect();
  if (rect.width >= window.innerWidth * 0.92 && rect.height >= window.innerHeight * 0.5) return true;
  return false;
}

function isUniqueSelector(selector: string): boolean {
  return countMatches(selector) === 1;
}

function countMatches(selector: string): number {
  try {
    return document.querySelectorAll(selector).length;
  } catch {
    return 0;
  }
}

function elementMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

function sameXPathTail(a: string, b: string): boolean {
  const tailA = a.split('/').slice(-4).join('/');
  const tailB = b.split('/').slice(-4).join('/');
  return tailA === tailB;
}

function safeQuerySelector(selector: string): Element | null {
  return safeQueryAll(selector)[0] ?? null;
}

function safeQueryAll(selector: string): Element[] {
  try {
    return Array.from(document.querySelectorAll(selector)).filter((node): node is Element => node instanceof Element);
  } catch {
    return [];
  }
}

function getLayoutHint(el: Element): AnchorLayoutHint | undefined {
  if (typeof window === 'undefined') return undefined;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) return undefined;
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  return {
    relCenterX: (rect.left + rect.width / 2) / vw,
    relCenterY: (rect.top + rect.height / 2) / vh,
    relWidth: rect.width / vw,
    relHeight: rect.height / vh
  };
}

function scoreLayoutHint(el: Element, hint?: AnchorLayoutHint): number {
  if (!hint || typeof window === 'undefined') return 0;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) return -12;
  const vw = window.innerWidth || 1;
  const vh = window.innerHeight || 1;
  const cx = (rect.left + rect.width / 2) / vw;
  const cy = (rect.top + rect.height / 2) / vh;
  const rw = rect.width / vw;
  const rh = rect.height / vh;
  const dist = Math.hypot(cx - hint.relCenterX, cy - hint.relCenterY);
  let score = 0;
  if (dist < 0.06) score += 28;
  else if (dist < 0.14) score += 18;
  else if (dist < 0.28) score += 8;
  else if (dist > 0.55) score -= 22;
  else if (dist > 0.38) score -= 10;

  const sizeDelta = Math.abs(rw - hint.relWidth) + Math.abs(rh - hint.relHeight);
  if (sizeDelta < 0.12) score += 6;
  else if (sizeDelta > 0.45) score -= 6;
  return score;
}

function isElementVisibleForAnchor(el: Element): boolean {
  if (!(el.isConnected && el.getClientRects().length > 0)) return false;

  let area = 0;
  for (const rect of el.getClientRects()) {
    if (rect.width >= 2 && rect.height >= 2) {
      area = rect.width * rect.height;
      break;
    }
  }
  if (area <= 0) return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false;
  }

  let parent: Element | null = el.parentElement;
  while (parent && parent !== document.documentElement) {
    if (parent.hasAttribute('hidden')) return false;
    const ps = window.getComputedStyle(parent);
    if (ps.display === 'none' || ps.visibility === 'hidden') return false;
    parent = parent.parentElement;
  }
  return true;
}

function elementMatchesStable(el: Element, anchor: NoteAnchor): boolean {
  if (anchor.noteId && !anchor.noteId.startsWith('xpath_') && el.getAttribute('data-note-id') === anchor.noteId) {
    return true;
  }
  for (const selector of anchor.selectors ?? []) {
    if (selector && isStableSelector(selector) && elementMatches(el, selector)) return true;
  }
  return false;
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
