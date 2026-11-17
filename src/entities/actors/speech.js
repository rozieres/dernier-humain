const PAUSES = { ',': 0.13, ';': 0.16, ':': 0.15, '.': 0.24, '!': 0.24, '?': 0.24, '…': 0.3, '—': 0.16, '–': 0.14 };
const VOWEL = /[aeiouyàâéèêëîïôöùûü]/i;
const MAX_VOICE = 2.4;

export const BLOCKED_MODES = new Set(['loading', 'title', 'intro', 'paused', 'reading']);

export function lineDuration(text) {
  return Math.max(2.4, String(text).length / 14 + 1.2);
}

export function lineIndex(count, n) {
  if (n <= 1 || count <= 0) return 0;
  if (n === 2) return count % 2;
  return 1 + ((count - 1) % (n - 1));
}

export function syllables(text) {
  const out = [];
  let t = 0;
  for (const w of String(text).split(/(\s+|[,;:.!?…—–]+)/)) {
    if (!w || /^\s+$/.test(w)) {
      t += 0.035;
      continue;
    }
    if (/^[,;:.!?…—–]+$/.test(w)) {
      t += PAUSES[w[w.length - 1]] ?? 0.1;
      continue;
    }
    let vowels = 0;
    let prev = false;
    for (const ch of w) {
      const v = VOWEL.test(ch);
      if (v && !prev) vowels++;
      prev = v;
    }
    const n = Math.max(1, Math.min(4, vowels || 1));
    for (let i = 0; i < n; i++) {
      out.push({ t, d: 0.0675, stress: i === n - 1 });
      t += 0.0885;
    }
  }
  if (t > MAX_VOICE && out.length) {
    const keep = Math.ceil(out.length * (MAX_VOICE / t) * 1.25);
    const stride = out.length / keep;
    const scale = MAX_VOICE / t;
    const picked = [];
    for (let k = 0; k < keep; k++) {
      const s = out[Math.floor(k * stride)];
      picked.push({ t: s.t * scale, d: s.d, stress: s.stress });
    }
    return picked;
  }
  return out;
}

export function envelopeAt(sylls, t) {
  let e = 0;
  for (const s of sylls) {
    if (s.t > t) break;
    const x = (t - s.t) / s.d;
    if (x < 2.2) e = Math.max(e, Math.exp(-x * 1.6) * (s.stress ? 1 : 0.7) * Math.min(1, x * 6 + 0.3));
  }
  return e;
}

export function emoteFor(key, text) {
  const k = key || '';
  if (/solved|beacon\.(first|all)|link\.(first|restored)|trace\.(first|all)/.test(k)) return 'spin';
  if (/excuse|désolé|pardon/i.test(text) || /hallu\.fall|fall$|drown/.test(k)) return 'shake';
  if (/forest|robots|lighthouse\.wait|finale/.test(k)) return 'shy';
  if (/^(oui|bien sûr|excellente|d'accord|exact)/i.test(text)) return 'nod';
  return null;
}
