const NB = ' ';

export const TITLE = 'Le dernier humain sur Internet';
export const TITLE_WORDS = ['Le dernier humain', 'sur Internet'];
export const SUBTITLE = `2031 — 99,99${NB}% de contenu généré`;

export const MENU = {
  start: 'Commencer',
  continue: 'Continuer',
  settings: 'Réglages',
  privacy: 'Aucune donnée ne quitte votre navigateur.',
  headphones: 'Casque conseillé',
  version: 'v1.0 — Édition hors ligne',
};

export const LOADING_CAPTIONS = [
  'Génération du contenu authentique…',
  'Lissage des opinions…',
  'Correction des fautes qui faisaient le charme…',
  'Chargement de 4,2 milliards de témoignages sincères…',
  `Calcul de l’engagement émotionnel…`,
  'Reformulation des silences…',
  `Vérification qu’il reste quelqu’un…`,
  'Indexation des souvenirs…',
  'Préchauffage du phare…',
];

export const LOADING_DONE = 'Prêt. Personne ne vous attendait.';

export const HUD = {
  objective: 'Objectif',
  signal: 'Signal humain',
  signalNone: 'Aucun signal',
  ring: `L’Anneau`,
  traces: 'Traces',
  notSecure: 'Non sécurisé',
  indexation: 'Indexation',
  indexed: 'Vous êtes indexé',
  meters: 'm',
};

export const ZONES = {
  hub: { name: `Page d’accueil`, tagline: 'Bienvenue. Bienvenue. Bienvenue.' },
  feed: { name: 'Le Fil', tagline: 'Tout le monde en parle. Personne ne l’a dit.' },
  farm: { name: 'La Ferme à contenus', tagline: 'Récolte toutes les 0,3 seconde.' },
  hallu: { name: 'Les Hallucinations', tagline: `Sûr à 97${NB}%.` },
  oldweb: { name: 'Le Vieux Web', tagline: 'En construction depuis 1998.' },
  forest: { name: 'La Forêt Sombre', tagline: 'Ne dites rien. Ils lisent.' },
  lighthouse: { name: 'Le Phare', tagline: `Dernière mise à jour${NB}: aujourd’hui.` },
};

export const RING_ORDER = ['feed', 'farm', 'hallu', 'oldweb', 'forest'];

export const BEACON_STATUS = {
  locked: 'Éteinte',
  ready: 'Prête à rallumer',
  active: 'Rallumée',
};

export const READER = {
  close: 'Fermer',
  analysis: 'Analyse du scanner',
  humanOrigin: 'Origine humaine',
  undetermined: 'indéterminée',
  verdict: 'Verdict',
  notes: 'Observations',
  scroll: 'Faire défiler',
  views: 'vues',
  sponsored: 'Contenu recommandé pour vous',
  guestbook: `Signer mon livre d’or`,
  visitors: 'Vous êtes le visiteur n°',
  construction: 'Page en construction',
  bestViewed: 'Site optimisé pour Netscape 4 — 800 × 600',
  lastUpdate: 'Dernière mise à jour',
  back: 'Précédente',
  top: 'Haut de page',
  archives: 'Archives',
  noDate: 'sans date',
};

export const REPLY = {
  send: 'Envoyer',
  nothing: `Je n’ai rien à dire`,
  hint: 'Ctrl + Entrée pour envoyer',
  to: 'À Maryvonne',
};

export const CREDITS = {
  hold: 'Maintenir une touche pour passer',
  explore: 'Continuer à explorer',
  restart: 'Recommencer',
  empty: '…',
};

export const JOURNAL = {
  title: 'Journal',
  objectives: 'Objectifs',
  map: 'Carte',
  traces: 'Traces trouvées',
  none: 'Aucune trace pour le moment. Sondez (F) et suivez le signal ambré.',
  main: 'Rallumer les cinq balises de l’Anneau',
  finale: 'Le Phare',
  finaleLocked: 'Le lien vers la mer ne répond plus (404).',
  close: 'Fermer',
  mapNoData: 'Carte indisponible.',
  you: 'Vous',
  done: 'fait',
};

export const PAUSE = {
  title: 'Pause',
  resume: 'Reprendre',
  settings: 'Réglages',
  restart: 'Recommencer la partie',
  confirm: 'Tout effacer et recommencer ? Vos messages et réglages sont conservés.',
  confirmYes: 'Oui, recommencer',
  confirmNo: 'Annuler',
  controls: 'Commandes',
  back: 'Retour',
  stage: 'Balises',
};

export const CONTROLS = [
  { keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], label: 'Se déplacer' },
  { keys: ['ShiftLeft'], label: 'Courir' },
  { keys: ['Space'], label: 'Sauter · maintenir pour planer' },
  { keys: ['KeyE'], label: 'Interagir, lire' },
  { keys: ['KeyF'], label: 'Sonder' },
  { keys: ['Mouse0'], label: 'Saisir, lâcher, cliquer' },
  { keys: ['Mouse2'], label: 'Lancer' },
  { keys: ['Tab'], label: 'Journal' },
  { keys: ['Escape'], label: 'Pause' },
];

export const TITLE_HINTS = [
  { keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], label: 'marcher' },
  { keys: ['KeyE'], label: 'lire' },
  { keys: ['KeyF'], label: 'sonder' },
];

export const SETTINGS = {
  title: 'Réglages',
  groups: {
    controls: 'Contrôles',
    display: 'Affichage',
    sound: 'Son',
  },
  sensitivity: 'Sensibilité de la souris',
  invertY: `Inverser l’axe vertical`,
  fov: 'Champ de vision',
  quality: 'Qualité graphique',
  qualities: { low: 'Basse', medium: 'Moyenne', high: 'Haute', ultra: 'Ultra' },
  master: 'Volume général',
  music: 'Musique',
  sfx: 'Effets',
  subtitles: 'Sous-titres',
  reduceFx: 'Réduire les effets',
  on: 'Oui',
  off: 'Non',
  back: 'Retour',
};

export const INTRO = {
  skip: 'Une touche pour continuer',
};
