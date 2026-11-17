import { PerspectiveCamera, Vector3 } from 'three';
import { createEvents } from '/src/core/events.js';
import createUi from '/src/ui/ui.js';

const params = new URLSearchParams(location.search);
const events = createEvents();

const LABELS = {
  KeyW: 'Z', KeyA: 'Q', KeyS: 'S', KeyD: 'D', KeyE: 'E', KeyF: 'F', Space: 'Espace', ShiftLeft: 'Maj',
  Tab: 'Tab', Escape: 'Échap', Mouse0: 'Clic gauche', Mouse2: 'Clic droit', Enter: 'Entrée',
};

const pressedThisFrame = new Set();
const input = {
  locked: false,
  label: (code) => LABELS[code] || code.replace(/^Key/, ''),
  requestLock() {
    if (this.locked) return;
    this.locked = true;
    events.emit('input:lock');
  },
  exitLock() {
    if (!this.locked) return;
    this.locked = false;
    events.emit('input:unlock');
  },
  pressed: (code) => pressedThisFrame.has(code),
  isDown: () => false,
};

const flags = new Set(['zone.farm.seeds', 'zone.hallu.bridge']);
const state = {
  mode: 'loading',
  setMode(mode) {
    const from = this.mode;
    if (from === mode) return;
    this.mode = mode;
    events.emit('mode:change', { from, to: mode });
  },
  settings: { sensitivity: 1, invertY: false, fov: 75, master: 0.8, music: 0.7, sfx: 0.85, quality: 'high', subtitles: true, reduceFx: params.has('reduce') },
  setSetting(key, value) {
    this.settings[key] = value;
    events.emit('settings:change', { key, value });
  },
  beacons: { feed: 'active', farm: 'ready', hallu: 'locked', oldweb: 'active', forest: 'locked' },
  setBeacon(zone, status) {
    this.beacons[zone] = status;
  },
  get stage() {
    return Object.values(this.beacons).filter((s) => s === 'active').length;
  },
  traces: new Set(['hub_welcome', 'feed_reply', 'farm_recipe', 'oldweb_guestbook', 'forest_lullaby', 'hallu_edit']),
  playerMessages: [],
  addPlayerMessage(text) {
    this.playerMessages.push({ text, date: new Date().toISOString() });
  },
  flag: (name) => flags.has(name),
  setFlag: (name, v) => (v ? flags.add(name) : flags.delete(name)),
  hasSave: () => true,
  reset() {},
  save() {},
};

const audio = { unlock() {}, sfx() {}, loop: () => ({ stop() {} }), setParam() {} };

const camera = new PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 6000);
camera.position.set(0, 42, 0);
camera.lookAt(0, 44, -100);

const DOCS = {
  synthetic: {
    id: 'slop_dog', kind: 'synthetic', site: 'Le Fil', url: 'https://lefil.app/p/8842019', secure: true,
    author: 'Clara Vérité', date: 'il y a 2 min',
    title: '10 raisons pour lesquelles votre chien vous aime vraiment (la 7e va vous émouvoir)',
    body: [
      'Il est important de noter que les chiens sont les meilleurs amis de l\'homme. Selon une étude récente, 97 % des chiens aiment leur propriétaire — et c\'est une excellente nouvelle !',
      'Dans ce fil, nous explorons ensemble les signes, les preuves et les émotions qui rendent ce lien unique. Prêt ? C\'est parti.',
    ],
    analysis: { human: 0.02, verdict: 'Origine : synthétique', notes: ['Rythme ternaire détecté (3 sur 3 phrases).', 'Statistique invérifiable : 97 %.', 'Aucune faute. Aucune hésitation.'] },
  },
  human: {
    id: 'beacon_feed', kind: 'human', site: 'Le Fil', url: 'https://lefil.app/camille_r/derniers', secure: true,
    author: 'camille_r', date: '9 janvier 2027',
    body: [
      'bon. j\'ai posté une photo de mon chien ce matin. 4 000 réponses en une minute, toutes gentilles, toutes pareilles. aucune ne l\'a regardé.',
      'je crois que je vais arrêter ici.',
      'si vous êtes une vraie personne et que vous lisez ça : il s\'appelle Bilbo et il a peur des parapluies.',
    ],
    analysis: { human: 0.96, verdict: 'Origine : humaine', notes: ['Ponctuation irrégulière, minuscules en début de phrase.', 'Détail inutile et précis : les parapluies.', 'Aucune formule d\'engagement.'] },
  },
  oldweb: {
    id: 'beacon_oldweb', kind: 'oldweb', site: 'Chez Mathieu — bienvenue sur ma page !!', url: 'http://membres.lycos.fr/mathieu98/livredor.htm', secure: false,
    author: 'Mathieu (le webmaster)', date: '12 août 2029', title: 'Livre d\'or',
    body: [
      'Je repasse ici vingt-huit ans après. Le compteur dit que je suis le visiteur n° 000 214.',
      'Je ne sais pas qui étaient les 213 autres, mais merci d\'être venus.',
      'J\'avais quinze ans, je croyais qu\'on aurait tous un site. Je laisse la lumière allumée.',
    ],
    analysis: { human: 0.91, verdict: 'Origine : humaine', notes: ['Page statique, aucun script.', 'Compteur incrémenté à la main.', 'Nostalgie non optimisée.'] },
  },
  terminal: {
    id: 'beacon_forest', kind: 'terminal', site: 'Forum des Veilleurs', url: 'telnet://veilleurs.forum:2323/annonces', secure: false,
    author: 'l\'admin', date: '30 novembre 2030', title: 'Fermeture du forum public',
    body: [
      'Le forum public ferme ce soir. On continue ailleurs, entre nous, là où ils ne lisent pas.',
      'Pour ceux qui savent : trois coups, à la porte dont la fenêtre ne s\'éteint pas.',
    ],
    analysis: { human: 0.88, verdict: 'Origine : humaine', notes: ['Dernier message public de ce serveur.', 'Instruction volontairement vague.'] },
  },
  note: {
    id: 'forest_note', kind: 'note', site: '', url: '', secure: true, author: '', date: '',
    body: [
      'On est là. On est nombreux, même. On a juste arrêté de parler dehors : tout ce qu\'on disait finissait dans leurs bouches.',
      'Ne dis à personne où est cette porte.',
      'Si tu cherches la dernière qui écrit encore au grand jour, suis l\'Anneau jusqu\'à la mer. Elle n\'a jamais éteint.',
    ],
    analysis: { human: 0.99, verdict: 'Origine : humaine', notes: ['Encre bleue, papier plié en quatre.', 'Aucune copie connue.'] },
  },
  final: {
    id: 'lighthouse_final', kind: 'final', site: 'Le journal du phare', url: 'http://maryvonne.pages-perso.bzh/phare/journal.html', secure: false,
    author: 'Maryvonne', date: '16 novembre 2031',
    body: [
      'Grand beau, mer calme.',
      'J\'écris ici tous les jours depuis onze ans. Au début, il y avait du monde. Puis les réponses sont devenues trop gentilles, trop rapides, et j\'ai compris que je parlais à des miroirs.',
      'On me dit que ça ne sert à rien. Que tout ce que j\'écris est avalé dans l\'heure et recraché en mieux. C\'est possible. Mais un phare ne sert à rien non plus, la plupart des nuits. On l\'allume quand même, pour le bateau qui passera peut-être.',
      'Si vous lisez ceci, je ne peux pas savoir si vous êtes quelqu\'un. Vous ne pourrez pas me le prouver, et moi non plus. Tant pis. Vous avez fait tout ce chemin pour lire quelques lignes d\'une vieille dame qui regarde la mer : aucune machine n\'a ce temps à perdre.',
      'Alors laissez un mot. N\'importe lequel. Mal écrit, si possible.',
      'Je garde la lumière allumée.',
    ],
    analysis: { human: null, verdict: 'Origine : indéterminée', notes: ['L\'analyseur ne sait plus.', 'Aucun modèle de référence.', 'Temps perdu à écrire ceci : considérable.'] },
  },
  farm: {
    id: 'beacon_farm', kind: 'human', site: 'Le potager de Jocelyne', url: 'https://potager-jocelyne.fr/2028/10/dernieres-tomates', secure: true,
    author: 'Jocelyne', date: '3 octobre 2028', title: 'Dernières tomates',
    body: [
      'Onze tomates cette semaine, dont deux mangées par les limaces, que je ne félicite pas.',
      'On m\'a dit qu\'un site avait recopié tout mon carnet, avec les fautes en moins et un jardin que je n\'ai pas. Grand bien lui fasse. Lui, il n\'aura jamais de terre sous les ongles.',
      'Je range les tuteurs. À l\'année prochaine, si ça dit à quelqu\'un.',
    ],
    analysis: { human: 0.94, verdict: 'Origine : humaine', notes: ['Rancune envers les limaces : authentique.'] },
  },
};

const TRACES = {
  hub_welcome: { ...DOCS.synthetic, id: 'hub_welcome', zone: 'hub', place: 'Sous le panneau d\'accueil', kind: 'human', title: 'Premier message', site: 'Accueil' },
  feed_reply: { ...DOCS.human, id: 'feed_reply', zone: 'feed', place: 'Au fond du puits', title: 'Une réponse lente' },
  farm_recipe: { ...DOCS.farm, id: 'farm_recipe', zone: 'farm', place: 'Derrière l\'épouvantail', title: 'La vraie recette du clafoutis' },
  oldweb_guestbook: { ...DOCS.oldweb, id: 'oldweb_guestbook', zone: 'oldweb', place: 'Dans le canyon', title: 'Livre d\'or, page 3' },
  forest_lullaby: { ...DOCS.terminal, id: 'forest_lullaby', zone: 'forest', place: 'Près du feu de camp', title: 'Berceuse pour serveur' },
  hallu_edit: { ...DOCS.synthetic, id: 'hallu_edit', zone: 'hallu', place: 'Sur le pilier', title: 'Modification annulée' },
};

const texts = {
  INTRO_CARDS: [
    '2031.',
    'Internet va très bien. Il n\'a jamais été aussi actif, aussi poli, aussi bien référencé.',
    '99,99 % de ce qui s\'y publie est généré. Le reste, plus personne ne sait où le trouver.',
    'Quelque part, il reste un dernier message écrit par quelqu\'un. Trouvez-le.',
  ],
  OBJECTIVES: {
    main: 'Rallumer les cinq balises de l\'Anneau',
    zones: {
      feed: { title: 'Le Fil', steps: [{ id: 'pit', text: 'Descendre au fond du puits' }, { id: 'pave', text: 'Bloquer le défilement avec un pavé' }, { id: 'beacon', text: 'Rallumer la balise' }] },
      farm: { title: 'La Ferme à contenus', steps: [{ id: 'seeds', text: 'Trouver trois vraies graines' }, { id: 'plant', text: 'Les planter loin des moissonneuses' }, { id: 'beacon', text: 'Rallumer la balise' }] },
      hallu: { title: 'Les Hallucinations', steps: [{ id: 'bridge', text: 'Trouver le vrai pont' }, { id: 'pillar', text: 'Atteindre le pilier central' }, { id: 'beacon', text: 'Rallumer la balise' }] },
      oldweb: { title: 'Le Vieux Web', steps: [{ id: 'artifacts', text: 'Rapporter le modem, la disquette et le CD-ROM' }, { id: 'beacon', text: 'Rallumer la balise' }] },
      forest: { title: 'La Forêt Sombre', steps: [{ id: 'door', text: 'Trouver la porte dont la fenêtre ne s\'éteint pas' }, { id: 'knock', text: 'Frapper trois coups sans être indexé' }, { id: 'beacon', text: 'Rallumer la balise' }] },
    },
    finale: [{ id: 'link', text: 'Emprunter le lien restauré vers la mer' }],
  },
  TRACES,
  LIGHTHOUSE: { reply: { prompt: 'Laissez un mot.', placeholder: 'Mal écrit, si possible.', note: 'Ce message reste dans votre navigateur. Personne ne le lira à votre place.' } },
  CREDITS: [
    { text: 'Ce jeu a été généré par une intelligence artificielle.', style: 'line' },
    { text: 'Le code, les paysages, la musique.', style: 'line' },
    { text: 'Les messages de Camille, de Jocelyne, d\'Abdel, de Mathieu, de Maryvonne.', style: 'line' },
    { text: 'Aucun d\'eux n\'a existé.', style: 'line' },
    { text: '', style: 'gap' },
    { text: 'Dans tout ce que vous venez de traverser, il n\'y a qu\'un seul message authentiquement humain.', style: 'line' },
    { text: 'Le vôtre.', style: 'line' },
    { text: '', style: 'player' },
    { text: '', style: 'gap' },
    { text: 'Le dernier humain sur Internet', style: 'title' },
    { text: 'c\'était vous.', style: 'final' },
  ],
};

function makeWorld() {
  const GRID = 641;
  const HALF = 1280;
  const CELL = 4;
  const zones = {
    hub: { name: 'Page d\'accueil', center: [0, 0], radius: 110 },
    feed: { name: 'Le Fil', center: [0, -640], radius: 215 },
    farm: { name: 'La Ferme à contenus', center: [640, -60], radius: 240 },
    hallu: { name: 'Les Hallucinations', center: [330, 600], radius: 200 },
    oldweb: { name: 'Le Vieux Web', center: [-520, 520], radius: 220 },
    forest: { name: 'La Forêt Sombre', center: [-620, -330], radius: 250 },
    lighthouse: { name: 'Le Phare', center: [-1140, 170], radius: 70 },
  };
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vnoise = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.25 + vnoise(x * 4.3, y * 4.3) * 0.125;
  const bump = (x, z, cx, cz, r, hgt) => hgt * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
  const heights = new Float32Array(GRID * GRID);
  for (let iz = 0; iz < GRID; iz++) {
    for (let ix = 0; ix < GRID; ix++) {
      const x = -HALF + ix * CELL;
      const z = -HALF + iz * CELL;
      const r = Math.hypot(x, z);
      const coast = 930 + (fbm(x * 0.004, z * 0.004) - 0.45) * 260;
      let hgt = Math.min(1, (coast - r) / 260) * 30 + fbm(x * 0.01, z * 0.01) * 22 - 6;
      if (r > coast) hgt = -((r - coast) / 8) - 2;
      hgt += bump(x, z, 0, 0, 120, 18);
      hgt += bump(x, z, 0, -640, 230, 95) - bump(x, z, 0, -640, 34, 110);
      hgt += bump(x, z, 470, -430, 160, 150);
      hgt += bump(x, z, 330, 600, 170, 30) - bump(x, z, 330, 600, 80, 35);
      const lr = Math.hypot(x + 1140, z - 170);
      if (lr < 80) hgt = Math.max(hgt, 14 * Math.min(1, (80 - lr) / 30) - 2);
      heights[iz * GRID + ix] = hgt;
    }
  }
  const biomeAt = (x, z) => {
    const w = (id, k = 1) => {
      const zone = zones[id];
      const d = Math.hypot(x - zone.center[0], z - zone.center[1]);
      return Math.max(0, Math.min(1, (zone.radius * 1.1 - d) / 80)) * k;
    };
    return { feed: w('feed'), farm: w('farm'), hallu: w('hallu'), oldweb: w('oldweb'), forest: w('forest'), sand: 0, rock: 0, path: 0 };
  };
  const arrivals = { feed: [0, -492], farm: [452, -44], hallu: [262, 462], oldweb: [-392, 392], forest: [-436, -232] };
  const paths = Object.entries(arrivals).map(([to, [x, z]]) => ({ to, points: [[0, 0], [x * 0.5 + 20, z * 0.5 - 10], [x, z]] }));
  return { SIZE: 2560, HALF, GRID, CELL, SEA_LEVEL: 0, heights, biomeAt, zones, paths };
}

const ctx = {
  events, input, state, audio, camera, texts,
  world: params.has('noworld') ? undefined : makeWorld(),
  uiRoot: document.getElementById('ui'),
  has: (name) => name === 'audio',
  time: { now: 0, dt: 0, realDt: 0, frame: 0 },
};

const ui = await createUi(ctx);
ctx.ui = ui;
ui.start();

let last = performance.now();
let t = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (!params.has('still')) camera.rotation.y = Math.sin(t * 0.25) * 0.08;
  camera.updateMatrixWorld();
  ui.frame(dt);
  pressedThisFrame.clear();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let markerHandles = [];

function clearOverlays() {
  for (const el of document.querySelectorAll('#ui .layer')) el.remove();
  markerHandles.forEach((m) => m.remove());
  markerHandles = [];
}

const scenes = {
  async loading() {
    state.setMode('loading');
    ui.loading(0.42);
  },
  async title() {
    state.setMode('title');
    return ui.title.show({ canContinue: true });
  },
  async intro() {
    state.setMode('intro');
    return ui.intro.play(texts.INTRO_CARDS);
  },
  async hud() {
    state.setMode('playing');
    input.requestLock();
    ui.hud(true);
    ui.setAddress({ url: 'https://lefil.app/tendances/maintenant', secure: true, status: '200 OK' });
    ui.setSignal(0.6);
    ui.objective('Descendre au fond du Fil et trouver ce qui ne défile pas');
    ui.reticle('interact');
    ui.prompt(input.label('KeyE'), 'Lire');
    ui.subtitle({ speaker: 'Tiret', text: 'Appuyez sur F pour sonder. Le cyan, c\'est nous. L\'ambre, c\'est vous. Enfin — ce qu\'il en reste.', duration: 600 });
    ui.toast('Trace trouvée : "Une réponse lente"', { icon: 'trace', duration: 600 });
    ui.toast('Balise prête : La Ferme à contenus', { icon: 'beacon', duration: 600 });
    ui.setIndexation(0.42);
    ui.hint([input.label('KeyF')], 'Sonder les environs', 600);
    markerHandles.push(
      ui.marker.add({ position: new Vector3(-28, 40, -110), kind: 'human', label: 'Trace' }),
      ui.marker.add({ position: new Vector3(40, 52, -190), kind: 'synthetic', label: 'Synthétique' }),
      ui.marker.add({ position: new Vector3(14, 46, -90), kind: 'hallucination', label: 'Hallucination' }),
      ui.marker.add({ position: new Vector3(-5, 124, -640), kind: 'beacon', label: 'Balise' }),
      ui.marker.add({ position: new Vector3(-300, 40, -60), kind: 'link', label: 'Lien' }),
      ui.marker.add({ position: new Vector3(20, 40, 30), kind: 'human', label: 'Derrière vous' }),
    );
    ui.zoneCard({ name: 'Le Fil', tagline: 'Tout le monde en parle. Personne ne l\'a dit.' });
  },
  async insecure() {
    ui.setAddress({ url: 'http://maryvonne.pages-perso.bzh/phare/journal.html', secure: false, status: '404' });
  },
  async reader(kind = 'human') {
    if (state.mode !== 'playing') state.setMode('playing');
    const doc = { ...DOCS[kind] };
    if (kind === 'oldweb') doc.actions = [{ id: 'sign', label: 'Signer le livre d\'or' }];
    return ui.reader.open(doc);
  },
  async reply() {
    state.setMode('ending');
    const text = await ui.reply.open(texts.LIGHTHOUSE.reply);
    state.addPlayerMessage(text);
    return text;
  },
  async replyFilled() {
    const p = scenes.reply();
    await sleep(500);
    const area = document.querySelector('.reply-area');
    area.value = 'Bonjour Maryvonne. Je suis venu à pied depuis la colline, il faisait nuit. J\'ai vu votre fenêtre de loin. Merci d\'avoir laissé la lumière.';
    area.dispatchEvent(new Event('input'));
    return p;
  },
  async creditsPlayer() {
    state.setMode('ending');
    if (!state.playerMessages.length) state.addPlayerMessage('Bonjour Maryvonne. J\'ai vu votre fenêtre de loin. Merci d\'avoir laissé la lumière.');
    return ui.credits.play(texts.CREDITS.slice(6));
  },
  async credits() {
    state.setMode('ending');
    if (!state.playerMessages.length) state.addPlayerMessage('Bonjour Maryvonne. J\'ai vu votre fenêtre de loin.');
    return ui.credits.play(texts.CREDITS);
  },
  async journal() {
    if (state.mode !== 'playing') state.setMode('playing');
    ui.journal.toggle();
  },
  async pause() {
    if (state.mode !== 'playing') state.setMode('playing');
    input.locked = true;
    input.exitLock();
  },
  async settings() {
    await scenes.pause();
    await sleep(100);
    document.querySelectorAll('.pause .menu-item')[1].click();
  },
  night() {
    document.getElementById('stage').classList.toggle('night');
  },
};

const dev = document.getElementById('dev');
if (params.has('clean')) dev.classList.add('hidden');
const group = (title, items) => {
  const h4 = document.createElement('h4');
  h4.textContent = title;
  dev.append(h4);
  for (const [label, fn] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = async () => {
      const r = await fn();
      if (r !== undefined) console.log('[dev] resolved', r);
    };
    dev.append(b);
  }
};
group('Écrans', [
  ['Chargement', () => { clearOverlays(); return scenes.loading(); }],
  ['Chargement → 100 %', () => ui.loading(1)],
  ['Titre', () => { clearOverlays(); return scenes.title(); }],
  ['Intro', () => { clearOverlays(); return scenes.intro(); }],
  ['HUD complet', () => { clearOverlays(); return scenes.hud(); }],
  ['Pause', () => scenes.pause()],
  ['Réglages', () => scenes.settings()],
  ['Journal', () => scenes.journal()],
  ['Réponse', () => scenes.reply()],
  ['Générique (joueur)', () => scenes.creditsPlayer()],
  ['Générique complet', () => scenes.credits()],
  ['Jour / nuit', () => scenes.night()],
]);
group('Lecteur', Object.keys(DOCS).map((k) => [k, () => scenes.reader(k)]));
group('HUD', [
  ['Signal 0', () => ui.setSignal(0)],
  ['Signal 0,3', () => ui.setSignal(0.3)],
  ['Signal 1', () => ui.setSignal(1)],
  ['Non sécurisé 404', () => scenes.insecure()],
  ['Chargement…', () => ui.setAddress({ url: 'https://ferme.contenus.io/recolte', status: 'chargement…' })],
  ['Indexation 0,9', () => ui.setIndexation(0.9)],
  ['Indexation off', () => ui.setIndexation(null)],
  ['Réticule grab', () => ui.reticle('grab')],
  ['Réticule holding', () => ui.reticle('holding')],
  ['Réticule click', () => ui.reticle('click')],
  ['Réticule default', () => ui.reticle('default')],
  ['Carte de zone', () => ui.zoneCard({ name: 'La Forêt Sombre', tagline: 'Ne dites rien. Ils lisent.' })],
  ['Toast', () => ui.toast('Partie sauvegardée', { icon: 'save' })],
  ['Sous-titre', () => ui.subtitle({ speaker: 'Tiret', text: 'Je suis sûr à 97 % que ce pont existe.' })],
  ['Trace +1', () => { state.traces.add(`t${state.traces.size}`); events.emit('trace:found', { id: 'x', found: state.traces.size, total: 18 }); }],
  ['Balise hallu prête', () => { state.beacons.hallu = 'ready'; events.emit('beacon:ready', { zone: 'hallu' }); }],
  ['HUD on/off', () => ui.hud(!document.querySelector('.hud').classList.contains('is-hidden') ? false : true)],
]);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') dev.classList.toggle('hidden');
});

window.__dev = { ui, ctx, scenes, clearOverlays, sleep, DOCS };
window.__ready = true;

const start = params.get('scene');
if (start) {
  const [name, arg] = start.split(':');
  scenes[name]?.(arg);
} else {
  ui.loading(0.1);
  for (let i = 1; i <= 10; i++) setTimeout(() => ui.loading(i / 10), i * 180);
  setTimeout(() => { scenes.hud(); }, 2400);
}
