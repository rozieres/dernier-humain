import * as T from '../src/data/texts.js';

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const isStrArr = (a, min = 1) => Array.isArray(a) && a.length >= min && a.every((s) => typeof s === 'string' && s.length > 0);

const TRACE_IDS = [
  'hub_welcome', 'feed_reply', 'feed_draft', 'feed_bio', 'farm_recipe', 'farm_review', 'farm_scarecrow',
  'hallu_edit', 'hallu_teacher', 'hallu_map', 'oldweb_guestbook', 'oldweb_fanpage', 'oldweb_email',
  'forest_invite', 'forest_lullaby', 'forest_apology', 'wilds_summit', 'wilds_pier',
];
const TIRET_KEYS = `intro.hello intro.goal intro.scan intro.scanned intro.grab intro.links intro.cookie
zone.feed.enter zone.feed.pit zone.feed.bottom zone.feed.popups zone.feed.pave zone.feed.solved
zone.farm.enter zone.farm.seed zone.farm.hit zone.farm.planted zone.farm.solved
zone.hallu.enter zone.hallu.sure zone.hallu.fall zone.hallu.scan zone.hallu.solved
zone.oldweb.enter zone.oldweb.artifact zone.oldweb.wrong zone.oldweb.modem zone.oldweb.solved
zone.forest.enter zone.forest.cabin zone.forest.crawler zone.forest.indexed zone.forest.knock zone.forest.note zone.forest.solved
beacon.first beacon.any beacon.all stage.night link.first link.ride link.dead link.restored
trace.first trace.any trace.all sea.drown fall idle scan.nothing scan.human scan.bots bots.bump
lighthouse.arrive lighthouse.robots lighthouse.wait finale.after finale.dawn freeroam`.split(/\s+/);
const ZONE_IDS = ['hub', 'feed', 'farm', 'hallu', 'oldweb', 'forest', 'lighthouse'];
const PLAY_ZONES = ['feed', 'farm', 'hallu', 'oldweb', 'forest'];
const DOC_KINDS = ['human', 'synthetic', 'oldweb', 'terminal', 'note', 'final'];

const EXPORTS = [
  'INTRO_CARDS', 'ZONES', 'OBJECTIVES', 'HINTS', 'TIRET', 'BEACON_DOCS', 'TRACES', 'FOREST', 'LIGHTHOUSE', 'CREDITS',
  'POPUPS', 'FALSE_FACTS', 'BOT_LINES', 'SEA_LINES', 'SEARCH_SUGGESTIONS', 'OLDWEB', 'FARM', 'FEED',
  'slopPost', 'slopHeadline', 'slopReview', 'slopComment',
];
for (const name of EXPORTS) check(T[name] !== undefined, `missing export ${name}`);

function checkDoc(doc, label) {
  check(doc && typeof doc === 'object', `${label}: not an object`);
  if (!doc) return;
  check(typeof doc.id === 'string', `${label}: id`);
  check(DOC_KINDS.includes(doc.kind), `${label}: kind ${doc.kind}`);
  check(typeof doc.site === 'string', `${label}: site`);
  check(doc.url === null || typeof doc.url === 'string', `${label}: url`);
  check(typeof doc.secure === 'boolean', `${label}: secure`);
  check(doc.author === null || typeof doc.author === 'string', `${label}: author`);
  check(doc.date === null || typeof doc.date === 'string', `${label}: date`);
  check(isStrArr(doc.body), `${label}: body`);
  const a = doc.analysis;
  check(a && typeof a.human === 'number' && a.human >= 0 && a.human <= 1, `${label}: analysis.human`);
  check(a && typeof a.verdict === 'string', `${label}: analysis.verdict`);
  check(a && isStrArr(a.notes), `${label}: analysis.notes`);
  if (doc.kind === 'synthetic') check(a.human <= 0.03, `${label}: synthetic score too high`);
}

check(isStrArr(T.INTRO_CARDS, 4), 'INTRO_CARDS');
for (const id of ZONE_IDS) {
  const z = T.ZONES[id];
  check(z && z.name && z.tagline && typeof z.url === 'string' && typeof z.secure === 'boolean', `ZONES.${id}`);
}
check(T.ZONES.lighthouse.url.startsWith('http://') && T.ZONES.lighthouse.secure === false, 'lighthouse url must be http, not secure');
check(T.ZONES.forest.url.startsWith('about:'), 'forest url about:');

check(typeof T.OBJECTIVES.main === 'string', 'OBJECTIVES.main');
for (const id of PLAY_ZONES) {
  const o = T.OBJECTIVES.zones[id];
  check(o && o.title && Array.isArray(o.steps) && o.steps.length >= 3 && o.steps.length <= 4, `OBJECTIVES.zones.${id}`);
  o?.steps.forEach((s) => check(s.id && s.text, `OBJECTIVES.zones.${id} step`));
}
check(Array.isArray(T.OBJECTIVES.finale) && T.OBJECTIVES.finale.every((s) => s.id && s.text), 'OBJECTIVES.finale');
for (const id of [...PLAY_ZONES, 'finale']) check(isStrArr(T.HINTS[id], 3), `HINTS.${id}`);

for (const key of TIRET_KEYS) {
  const lines = T.TIRET[key];
  check(isStrArr(lines, 2) && lines.length <= 5, `TIRET.${key} needs 2-5 variants`);
  lines?.forEach((l) => check(l.length <= 170, `TIRET.${key} too long (${l.length}): ${l}`));
}
for (const key of Object.keys(T.TIRET)) check(TIRET_KEYS.includes(key), `TIRET unexpected key ${key}`);

for (const id of PLAY_ZONES) checkDoc(T.BEACON_DOCS[id], `BEACON_DOCS.${id}`);
check(T.BEACON_DOCS.forest === T.FOREST.forumPost, 'forest beacon doc must be the forum post');
check(Object.keys(T.TRACES).length === 18, 'TRACES count');
for (const id of TRACE_IDS) {
  const d = T.TRACES[id];
  check(!!d, `TRACES.${id} missing`);
  if (!d) continue;
  checkDoc(d, `TRACES.${id}`);
  check(d.id === id, `TRACES.${id}: id mismatch`);
  check(typeof d.zone === 'string' && typeof d.place === 'string', `TRACES.${id}: zone/place`);
  check(d.body.length >= 2 && d.body.length <= 5, `TRACES.${id}: 2-5 paragraphs`);
  check(d.body.join(' ').length <= 700, `TRACES.${id}: too long to read in 30 s`);
}
for (const [k, d] of Object.entries(T.SYNTH_DOCS ?? {})) checkDoc(d, `SYNTH_DOCS.${k}`);

checkDoc(T.FOREST.forumPost, 'FOREST.forumPost');
checkDoc(T.FOREST.note, 'FOREST.note');
check(T.FOREST.note.kind === 'note' && T.FOREST.note.date === null, 'FOREST.note kind/date');
check(isStrArr(T.FOREST.doorSigns, 4) && isStrArr(T.FOREST.wrongDoor, 3), 'FOREST door strings');

const L = T.LIGHTHOUSE;
check(Array.isArray(L.log) && L.log.length >= 10 && L.log.every((e) => e.date && e.text), 'LIGHTHOUSE.log');
checkDoc(L.final, 'LIGHTHOUSE.final');
check(L.final.kind === 'final' && L.final.url.startsWith('http://') && L.final.secure === false, 'LIGHTHOUSE.final http');
check(typeof L.robotsTxt === 'string' && L.robotsTxt.includes('\n') && L.robotsTxt.includes('Disallow: /'), 'robotsTxt');
check(L.reply && L.board && L.board.title && L.board.empty, 'LIGHTHOUSE.reply/board');

const STYLES = ['title', 'line', 'small', 'gap', 'player', 'final'];
check(T.CREDITS.every((c) => typeof c.text === 'string' && STYLES.includes(c.style)), 'CREDITS shape');
check(T.CREDITS.filter((c) => c.style === 'player').length === 1, 'CREDITS one player entry');

check(T.POPUPS.length >= 16 && T.POPUPS.every((p) => p.title && p.body && p.cta), 'POPUPS');
check(T.POPUPS[0].cta === 'Tout accepter' && T.POPUPS[0].cta2 === 'Accepter tout', 'cookie banner buttons');
check(isStrArr(T.FALSE_FACTS, 40), 'FALSE_FACTS ≥ 40');
for (const k of ['idle', 'feed']) check(isStrArr(T.BOT_LINES[k], 20), `BOT_LINES.${k} ≥ 20`);
for (const k of ['greet', 'bumped', 'scanned', 'farm']) check(isStrArr(T.BOT_LINES[k], 10), `BOT_LINES.${k} ≥ 10`);
check(isStrArr(T.SEA_LINES, 150), 'SEA_LINES ≥ 150');
T.SEA_LINES.forEach((s) => check(s.length <= 60, `SEA_LINES too long: ${s}`));
check(new Set(T.SEA_LINES).size === T.SEA_LINES.length, 'SEA_LINES duplicates');
check(isStrArr(T.SEARCH_SUGGESTIONS, 12), 'SEARCH_SUGGESTIONS ≥ 12');

check(T.OLDWEB.pages.length >= 14 && T.OLDWEB.pages.every((p) => p.title && isStrArr(p.lines) && Number.isFinite(p.counter) && p.year >= 1998 && p.year <= 2006), 'OLDWEB.pages');
for (const k of ['modem', 'floppy', 'cdrom']) {
  check(typeof T.OLDWEB.riddles[k] === 'string', `OLDWEB.riddles.${k}`);
  check(T.OLDWEB.artifacts[k]?.name && T.OLDWEB.artifacts[k]?.description, `OLDWEB.artifacts.${k}`);
}
check(isStrArr(T.OLDWEB.guestbook, 12), 'OLDWEB.guestbook ≥ 12');
check(isStrArr(T.FARM.signs, 3) && T.FARM.seeds.length === 3 && T.FARM.seeds.every((s) => s.id && s.name) && isStrArr(T.FARM.pots, 3), 'FARM');
check(isStrArr(T.FEED.years, 10) && T.FEED.years[0] === '2031' && isStrArr(T.FEED.signage, 3) && T.FEED.backToTop === 'Retour en haut ↑', 'FEED');

const CANON = [
  '2031.',
  "Internet va très bien. Il n'a jamais été aussi actif, aussi poli, aussi bien référencé.",
  "99,99 % de ce qui s'y publie est généré. Le reste, plus personne ne sait où le trouver.",
  "Quelque part, il reste un dernier message écrit par quelqu'un. Trouvez-le.",
  'Bienvenue. Bienvenue. Bienvenue.', "Tout le monde en parle. Personne ne l'a dit.", 'Récolte toutes les 0,3 seconde.',
  'Sûr à 97 %.', 'En construction depuis 1998.', 'Ne dites rien. Ils lisent.', "Dernière mise à jour : aujourd'hui.",
  "Bonjour ! Je suis Tiret — votre assistant de navigation. Comment puis-je optimiser votre expérience aujourd'hui ?",
  "Un message humain ? Bien sûr. J'en ai 4,2 milliards en stock — tous garantis authentiques. Ah. Vous voulez dire un vrai.",
  "Il est important de noter que je n'en ai jamais lu. On m'a entraîné sur des textes qui avaient été entraînés sur des textes.",
  "Appuyez sur F pour sonder. Le cyan, c'est nous. L'ambre, c'est vous. Enfin — ce qu'il en reste.",
  'Je suis sûr à 97 % que ce pont existe.', "Je vous présente mes excuses. J'étais sûr à 97 %.",
  "Je vais baisser ma luminosité. Ici, on n'aime pas beaucoup les gens comme moi. Je comprends. Vraiment.",
  'Tout le monde finit par se noyer dans le contenu.',
  "User-agent: * — Disallow: /. C'est pour moi, ça. Je reste dehors.",
  'Vous me raconterez ? Non. Ne me racontez pas. Je finirais par le résumer.',
  "Vous avez écrit quelque chose. Ne me le montrez pas. Gardez-le loin de moi — c'est le plus beau cadeau que vous puissiez lui faire.",
  "bon. j'ai posté une photo de mon chien ce matin. 4 000 réponses en une minute, toutes gentilles, toutes pareilles. aucune ne l'a regardé.",
  'je crois que je vais arrêter ici.',
  "si vous êtes une vraie personne et que vous lisez ça : il s'appelle Bilbo et il a peur des parapluies.",
  'Onze tomates cette semaine, dont deux mangées par les limaces, que je ne félicite pas.',
  "On m'a dit qu'un site avait recopié tout mon carnet, avec les fautes en moins et un jardin que je n'ai pas. Grand bien lui fasse. Lui, il n'aura jamais de terre sous les ongles.",
  "Je range les tuteurs. À l'année prochaine, si ça dit à quelqu'un.",
  'Annulation de la modification 48 213 907. Non, la tour Eiffel n\'a pas été "déplacée à Lyon en 1974".',
  "C'est la dix-septième fois ce mois-ci. Je corrige, ils regénèrent.",
  "Je suis le dernier à relire cette page et j'ai un train à prendre. Si quelqu'un passe après moi : vérifiez. C'est tout ce que je vous demande. Vérifiez.",
  'Je repasse ici vingt-huit ans après. Le compteur dit que je suis le visiteur n° 000 214.',
  "Je ne sais pas qui étaient les 213 autres, mais merci d'être venus.",
  "J'avais quinze ans, je croyais qu'on aurait tous un site. Je laisse la lumière allumée.",
  'Le forum public ferme ce soir. On continue ailleurs, entre nous, là où ils ne lisent pas.',
  "Pour ceux qui savent : trois coups, à la porte dont la fenêtre ne s'éteint pas.",
  "On est là. On est nombreux, même. On a juste arrêté de parler dehors : tout ce qu'on disait finissait dans leurs bouches.",
  'Ne dis à personne où est cette porte.',
  "Si tu cherches la dernière qui écrit encore au grand jour, suis l'Anneau jusqu'à la mer. Elle n'a jamais éteint.",
  'Grand beau, mer calme.',
  "J'écris ici tous les jours depuis onze ans. Au début, il y avait du monde. Puis les réponses sont devenues trop gentilles, trop rapides, et j'ai compris que je parlais à des miroirs.",
  "On me dit que ça ne sert à rien. Que tout ce que j'écris est avalé dans l'heure et recraché en mieux. C'est possible. Mais un phare ne sert à rien non plus, la plupart des nuits. On l'allume quand même, pour le bateau qui passera peut-être.",
  "Si vous lisez ceci, je ne peux pas savoir si vous êtes quelqu'un. Vous ne pourrez pas me le prouver, et moi non plus. Tant pis. Vous avez fait tout ce chemin pour lire quelques lignes d'une vieille dame qui regarde la mer : aucune machine n'a ce temps à perdre.",
  "Alors laissez un mot. N'importe lequel. Mal écrit, si possible.",
  'Je garde la lumière allumée.',
  'Origine : indéterminée', "L'analyseur ne sait plus.", 'Aucun modèle de référence.', 'Temps perdu à écrire ceci : considérable.',
  'Laissez un mot.', 'Mal écrit, si possible.', 'Ce message reste dans votre navigateur. Personne ne le lira à votre place.',
  'Ce jeu a été généré par une intelligence artificielle.', 'Le code, les paysages, la musique.',
  "Les messages de Camille, de Jocelyne, d'Abdel, de Mathieu, de Maryvonne.", "Aucun d'eux n'a existé.",
  "Dans tout ce que vous venez de traverser, il n'y a qu'un seul message authentiquement humain.", 'Le vôtre.',
  'Le dernier humain sur Internet', "c'était vous.",
  'Ce qui chantait avant de parler.', 'Ce qui tenait 1,44 Mo de nous.', 'Ce qui promettait cinquante heures gratuites.',
];

const strings = [];
const collect = (v) => {
  if (typeof v === 'string') strings.push(v);
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === 'object') Object.values(v).forEach(collect);
};
for (const name of EXPORTS) if (typeof T[name] !== 'function') collect(T[name]);
collect(T.SYNTH_DOCS);
const stringSet = new Set(strings);
for (const c of CANON) check(stringSet.has(c), `canon string not found verbatim: ${c}`);

check(T.BEACON_DOCS.feed.author === 'camille_r' && T.BEACON_DOCS.feed.date === '9 janvier 2027', 'feed beacon meta');
check(T.BEACON_DOCS.farm.title === 'Dernières tomates' && T.BEACON_DOCS.farm.site === 'Le potager de Jocelyne', 'farm beacon meta');
check(T.BEACON_DOCS.hallu.author === 'Abdel_K' && T.BEACON_DOCS.hallu.date === '22 juin 2029', 'hallu beacon meta');
check(T.BEACON_DOCS.oldweb.site === 'Chez Mathieu — bienvenue sur ma page !!' && T.BEACON_DOCS.oldweb.author === 'Mathieu (le webmaster)', 'oldweb beacon meta');
check(T.FOREST.forumPost.site === 'Forum des Veilleurs' && T.FOREST.forumPost.author === "l'admin" && T.FOREST.forumPost.date === '30 novembre 2030', 'forest beacon meta');
check(L.final.author === 'Maryvonne' && L.final.date === '16 novembre 2031' && L.final.site === 'Le journal du phare', 'final meta');

const isUrl = (s) => /^(https?:|about:)/.test(s) || L.robotsTxt === s;
for (const s of strings) {
  check(!/[«»]/.test(s), `guillemets found: ${s}`);
  if (!isUrl(s)) check(!/[\p{L}\d)"][!?;]/u.test(s), `missing space before ! ? ; : ${s}`);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const GEN = {
  slopPost: (o) => typeof o.author === 'string' && /^@/.test(o.handle) && typeof o.text === 'string' && Number.isFinite(o.likes) && Number.isFinite(o.reposts) && typeof o.age === 'string',
  slopHeadline: (o) => typeof o === 'string' && o.length > 10,
  slopReview: (o) => [4, 5].includes(o.stars) && typeof o.title === 'string' && typeof o.text === 'string' && typeof o.author === 'string',
  slopComment: (o) => typeof o === 'string' && o.length > 5,
};
for (const [name, valid] of Object.entries(GEN)) {
  const a = T[name](mulberry32(1234));
  const b = T[name](mulberry32(1234));
  check(JSON.stringify(a) === JSON.stringify(b), `${name} not deterministic`);
  const rand = mulberry32(42);
  const seen = new Set();
  let ok = true;
  for (let i = 0; i < 500; i++) {
    const out = T[name](rand);
    if (!valid(out)) ok = false;
    seen.add(JSON.stringify(out));
    if (typeof out === 'string' ? /[«»]/.test(out) || /\{\w+\}/.test(out) : /[«»]|\{\w+\}/.test(out.text)) ok = false;
  }
  check(ok, `${name} produced an invalid output`);
  check(seen.size / 500 >= 0.95, `${name} uniqueness ${(seen.size / 5).toFixed(1)} %`);
  console.log(`${name}: ${(seen.size / 5).toFixed(1)} % unique — e.g. ${JSON.stringify(T[name](mulberry32(7))).slice(0, 160)}`);
}

if (failures.length) {
  console.error(`FAIL (${failures.length})`);
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log(`OK — ${strings.length} strings checked, ${CANON.length} canon strings found.`);
