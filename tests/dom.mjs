// A small DOM test double for event/data wiring. This is not a browser or a renderer.
import { readFileSync } from 'node:fs';

const decode = text => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[entity] ?? String.fromCodePoint(entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)))));
const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
class TextNode { constructor(value) { this.value = value; this.parentElement = null; } get textContent() { return this.value; } }

function simpleMatch(element, selector) {
  if (!(element instanceof Element)) return false;
  const bare = selector.replace(/\[[^\]]+\]/g, '');
  const tag = bare.match(/^[a-z][\w-]*/i)?.[0];
  if (tag && element.tagName !== tag.toUpperCase()) return false;
  for (const [, id] of bare.matchAll(/#([\w-]+)/g)) if (element.id !== id) return false;
  for (const [, name] of bare.matchAll(/\.([\w-]+)/g)) if (!element.classList.contains(name)) return false;
  for (const [, key, quote, value] of selector.matchAll(/\[([\w-]+)(?:=(['"]?)([^\]'"]*)\2)?\]/g)) {
    if (!element.hasAttribute(key) || (value !== undefined && element.getAttribute(key) !== value)) return false;
  }
  return true;
}
function matches(element, selector) {
  return selector.split(',').some(part => {
    const chain = part.trim().split(/\s+/); let current = element;
    if (!simpleMatch(current, chain.pop())) return false;
    while (chain.length) {
      const parent = chain.pop(); current = current.parentElement;
      while (current && !simpleMatch(current, parent)) current = current.parentElement;
      if (!current) return false;
    }
    return true;
  });
}

export class Element extends EventTarget {
  constructor(tag, document) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.attributes = new Map(); this.childNodes = []; this.parentElement = null;
    this.style = { setProperty(key, value) { this[key] = String(value); }, getPropertyValue(key) { return this[key] ?? ''; } };
    this.classList = {
      contains: key => (this.getAttribute('class') || '').split(/\s+/).includes(key),
      add: (...keys) => this.setAttribute('class', [...new Set([...(this.getAttribute('class') || '').split(/\s+/).filter(Boolean), ...keys])].join(' ')),
      remove: (...keys) => this.setAttribute('class', (this.getAttribute('class') || '').split(/\s+/).filter(key => !keys.includes(key)).join(' ')),
      toggle: (key, force) => { const add = force ?? !this.classList.contains(key); this.classList[add ? 'add' : 'remove'](key); return add; },
    };
    this.dataset = new Proxy({}, {
      get: (_, key) => this.getAttribute('data-' + String(key).replace(/[A-Z]/g, character => '-' + character.toLowerCase())) ?? undefined,
      set: (_, key, value) => { this.setAttribute('data-' + String(key).replace(/[A-Z]/g, character => '-' + character.toLowerCase()), String(value)); return true; },
    });
  }
  get children() { return this.childNodes.filter(child => child instanceof Element); }
  get id() { return this.getAttribute('id') || ''; } set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') || ''; } set className(value) { this.setAttribute('class', value); }
  get hidden() { return this.hasAttribute('hidden'); } set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get open() { return this.hasAttribute('open'); }
  set open(value) { if (value) this.setAttribute('open', ''); else this.removeAttribute('open'); }
  get value() { return this._value ?? this.getAttribute('value') ?? (this.tagName === 'SELECT' ? this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value : '') ?? ''; }
  set value(value) { this._value = String(value); }
  get checked() { return this._checked ?? this.hasAttribute('checked'); } set checked(value) { this._checked = Boolean(value); }
  get disabled() { return this.hasAttribute('disabled'); } set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get textContent() { return this.childNodes.map(child => child.textContent).join(''); }
  set textContent(value) { this.replaceChildren(new TextNode(String(value))); }
  get innerHTML() { return this.childNodes.map(child => child instanceof Element ? `<${child.tagName.toLowerCase()}>${child.innerHTML}</${child.tagName.toLowerCase()}>` : child.value).join(''); }
  set innerHTML(value) { this.replaceChildren(); parse(String(value), this, this.ownerDocument); }
  getAttribute(key) { return this.attributes.has(key) ? this.attributes.get(key) : null; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  hasAttribute(key) { return this.attributes.has(key); }
  removeAttribute(key) { this.attributes.delete(key); }
  append(...nodes) { for (let node of nodes) { if (typeof node === 'string') node = new TextNode(node); node.remove?.(); node.parentElement = this; this.childNodes.push(node); } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { for (const child of this.childNodes) child.parentElement = null; this.childNodes = []; this.append(...nodes); }
  remove() { if (this.parentElement) { this.parentElement.childNodes = this.parentElement.childNodes.filter(child => child !== this); this.parentElement = null; } }
  after(node) { const parent = this.parentElement; node.remove(); node.parentElement = parent; parent.childNodes.splice(parent.childNodes.indexOf(this) + 1, 0, node); }
  matches(selector) { return matches(this, selector); }
  closest(selector) { for (let current = this; current; current = current.parentElement) if (matches(current, selector)) return current; return null; }
  querySelectorAll(selector) { const result = []; const visit = node => { for (const child of node.children) { if (matches(child, selector)) result.push(child); visit(child); } }; visit(this); return result; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  dispatchEvent(event) {
    if (!event.target) Object.defineProperty(event, 'target', { value: this, configurable: true });
    const result = super.dispatchEvent(event);
    if (event.bubbles && !event.cancelBubble) (this.parentElement || this.ownerDocument)?.dispatchEvent(event);
    return result;
  }
  click() { this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
  focus() { this.ownerDocument.activeElement = this; } select() { this.focus(); }
  showModal() { this.setAttribute('open', ''); }
  close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); }
  reset() { for (const input of this.querySelectorAll('input, select, textarea')) { delete input._value; delete input._checked; } }
  reportValidity() {
    return (this.tagName === 'FORM' ? this.querySelectorAll('input, select') : [this]).every(input => {
      if (input.hasAttribute('required') && !input.value) return false;
      if (input.getAttribute('type') !== 'number' || !input.value) return true;
      const value = Number(input.value);
      return Number.isFinite(value) && (!input.hasAttribute('min') || value >= Number(input.getAttribute('min'))) && (!input.hasAttribute('max') || value <= Number(input.getAttribute('max')));
    });
  }
  getContext() { return { createLinearGradient: () => ({ addColorStop() {} }) }; }
}
function parse(source, parent, document) {
  const stack = [parent];
  for (const token of source.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const tag = token.slice(2).match(/^[\w-]+/)?.[0].toUpperCase();
      const index = stack.findLastIndex(element => element.tagName === tag); if (index > 0) stack.length = index;
    } else if (token.startsWith('<')) {
      const tag = token.slice(1).match(/^[\w-]+/)?.[0]; if (!tag) continue;
      const node = new Element(tag, document);
      const rest = token.slice(tag.length + 1).replace(/\/?\s*>$/, '');
      for (const [, name, double, single, bare] of rest.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) node.setAttribute(name, decode(double ?? single ?? bare ?? ''));
      stack.at(-1).append(node); if (!voids.has(tag.toLowerCase()) && !token.endsWith('/>')) stack.push(node);
    } else stack.at(-1).append(new TextNode(decode(token)));
  }
}
class Document extends EventTarget {
  constructor(source) { super(); this.root = new Element('document', this); parse(source, this.root, this); this.documentElement = this.root.querySelector('html'); this.head = this.root.querySelector('head'); this.body = this.root.querySelector('body'); this.readyState = 'complete'; this.hidden = false; }
  getElementById(id) { return this.root.querySelector('#' + id); }
  querySelector(selector) { return this.root.querySelector(selector); }
  querySelectorAll(selector) { return this.root.querySelectorAll(selector); }
  createElement(tag) { return new Element(tag, this); }
}
export function setupDOM(data = {}) {
  const document = new Document(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const window = new EventTarget(); window.scrollTo = () => {}; window.scrollBy = () => {};
  const map = new Map(Object.entries(data));
  const localStorage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
  Object.assign(globalThis, { document, window, localStorage, isSecureContext: true, matchMedia: () => ({ matches: true }),
    requestAnimationFrame: callback => { callback(performance.now() + 500); return 0; }, cancelAnimationFrame: () => {},
    location: { reload() {} }, CustomEvent: class extends Event { constructor(type, options = {}) { super(type, options); this.detail = options.detail; } },
  });
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false, clipboard: { writeText: async () => {} } }, configurable: true });
  const originalInterval = globalThis.setInterval; globalThis.setInterval = () => 0;
  const originalTimeout = globalThis.setTimeout; globalThis.setTimeout = (callback, ms, ...args) => { const timer = originalTimeout(callback, ms, ...args); timer.unref(); return timer; };
  return { document, window, localStorage, map, restoreTimers() { globalThis.setInterval = originalInterval; globalThis.setTimeout = originalTimeout; } };
}
export const tick = () => new Promise(resolve => setImmediate(resolve));
export function activeProFixture(now = Date.now()) {
  const activatedAt = now - 1000;
  return { fitcat_subscription_v1: JSON.stringify({ version: 1, campaign: 'launch-8days-v1', activatedAt, expiresAt: activatedAt + 8 * 86400000 }) };
}
export function submit(form) { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
