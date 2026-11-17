import { svg } from './dom.js';

const S = (body, view = '0 0 24 24') =>
  `<svg class="icon" viewBox="${view}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  lock: S('<rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/>'),
  warning: S('<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.9" r=".6" fill="currentColor"/>'),
  back: S('<path d="M14.5 6 8.5 12l6 6"/>'),
  forward: S('<path d="m9.5 6 6 6-6 6"/>'),
  reload: S('<path d="M18.5 12a6.5 6.5 0 1 1-2-4.7"/><path d="M18.5 4.5v3.6h-3.6"/>'),
  trace: S('<path d="M7 3.5h7.5L18 7v13.5H7Z"/><path d="M14.5 3.5V7H18"/><path d="M9.5 11.5c1.2-.8 2.3.8 3.5 0s2.2-.6 2.8 0M9.5 15c1-.6 2 .7 3.2 0"/>'),
  beacon: S('<path d="M10 20.5 11 9h2l1 11.5"/><path d="M8.5 20.5h7"/><path d="M9.5 9h5"/><path d="M12 6.5V3"/><path d="M6.5 5.5 8.6 7M17.5 5.5 15.4 7M5 9.5h2.4M19 9.5h-2.4"/>'),
  link: S('<path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1 1"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1-1"/>'),
  save: S('<path d="M5 4.5h11l3 3v12H5Z"/><path d="M8.5 4.5v4.5h6V4.5M8 19.5v-5.5h8v5.5"/>'),
  scan: S('<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>'),
  info: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r=".6" fill="currentColor"/>'),
  eye: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
  close: S('<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>'),
  heart: S('<path d="M12 19.5s-7.5-4.4-7.5-9.6A4 4 0 0 1 12 7.6a4 4 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6Z"/>'),
  repost: S('<path d="M5.5 10V8.5a2 2 0 0 1 2-2h10l-2.5-2.5M18.5 14v1.5a2 2 0 0 1-2 2h-10l2.5 2.5"/>'),
  comment: S('<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5v-3.5h0a2 2 0 0 1-1.5-2Z"/>'),
  views: S('<path d="M5 19.5v-6M10 19.5V9M15 19.5v-4M20 19.5V5"/>'),
  share: S('<path d="M12 15V4M8 7.5 12 3.5l4 4"/><path d="M5.5 12.5v7h13v-7"/>'),
  more: S('<circle cx="6" cy="12" r=".9" fill="currentColor"/><circle cx="12" cy="12" r=".9" fill="currentColor"/><circle cx="18" cy="12" r=".9" fill="currentColor"/>'),
  verified: `<svg class="icon icon-verified" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.8l2.4 1.9 3-.3 1 2.9 2.7 1.4-.7 3 1.6 2.6-2.2 2.1-.1 3.1-3 .6-1.6 2.6-2.9-1-2.9 1-1.6-2.6-3-.6-.1-3.1L.9 13.3l1.6-2.6-.7-3 2.7-1.4 1-2.9 3 .3Z"/><path d="m7.8 12.2 2.8 2.8 5.6-5.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrow: S('<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>'),
  globe: S('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17"/>'),
  pen: S('<path d="M15.5 4.5 19.5 8.5 8.5 19.5H4.5v-4Z"/><path d="m13 7 4 4"/>'),
};

export function icon(name, className = '') {
  return svg(ICONS[name] || ICONS.info, className);
}

export function hasIcon(name) {
  return Boolean(ICONS[name]);
}
