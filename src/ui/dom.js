const NBSP = ' ';

export function h(selector, props = null, ...children) {
  const [tag, ...classes] = selector.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (key === 'text') el.textContent = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key === 'style' && typeof value === 'object') {
        for (const [prop, v] of Object.entries(value)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, v);
          else el.style[prop] = v;
        }
      }
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else el.setAttribute(key, value === true ? '' : value);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function svg(markup, className = '') {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const node = tpl.content.firstElementChild;
  if (className) node.classList.add(...className.split(' '));
  return node;
}

export function typo(text = '', { curly = true } = {}) {
  const base = curly ? String(text).replace(/(\p{L})'(?=\p{L})/gu, '$1\u2019') : String(text);
  return base
    .replace(/ ([;:!?%»])/g, `${NBSP}$1`)
    .replace(/(«) /g, `$1${NBSP}`)
    .replace(/(\d) (\d{3})(?!\d)/g, `$1${NBSP}$2`)
    .replace(/(\d) (\d{3})(?!\d)/g, `$1${NBSP}$2`);
}

export function percent(value) {
  return `${Math.round(value * 100)}${NBSP}%`;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

export function clamp(v, a = 0, b = 1) {
  return v < a ? a : v > b ? b : v;
}

export function hashString(text) {
  let x = 2166136261;
  for (let i = 0; i < text.length; i++) {
    x ^= text.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}

export function isObject(value) {
  return typeof value === 'object' && value !== null;
}

export async function fadeOut(el, ms = 400) {
  el.classList.add('is-leaving');
  await sleep(ms);
  el.remove();
}

export function keycap(label, extra = '') {
  return h(`span.keycap${extra ? `.${extra}` : ''}`, { text: label });
}
