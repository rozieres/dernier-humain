const pick = (rand, list) => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
const int = (rand, a, b) => a + Math.min(b - a, Math.floor(rand() * (b - a + 1)));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function pickSome(rand, list, n) {
  const pool = list.slice();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.min(pool.length - 1, Math.floor(rand() * pool.length)), 1)[0]);
  return out;
}

function fill(rand, template, banks) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const lower = key.charAt(0).toLowerCase() + key.slice(1);
    const bank = banks[lower];
    const value = typeof bank === 'function' ? bank(rand) : pick(rand, bank);
    return key === lower ? value : cap(value);
  });
}

const FIRST_NAMES = [
  'Clément', 'Ophélie', 'Maxence', 'Sandrine', 'Jordan', 'Anaïs', 'Thibault', 'Laetitia', 'Kévin', 'Margaux',
  'Florian', 'Solène', 'Yannick', 'Inès', 'Bastien', 'Chloé', 'Romain', 'Élodie', 'Quentin', 'Manon',
  'Grégoire', 'Jessica', 'Benoît', 'Aurore', 'Dylan', 'Capucine', 'Steeve', 'Maëlys',
];
const LAST_NAMES = [
  'Vasseur', 'Morel-Duteil', 'Lebrun', 'Chevallier', 'Garnier', 'Roussel', 'Perrot', 'Masson', 'Blanchard',
  'Fabre', 'Leclerc-Hamon', 'Delaunay', 'Mercier', 'Boyer', 'Carpentier', 'Lemaître', 'Guérin', 'Tessier',
  'Rivière', 'Bouvier', 'Marchal', 'Poulain', 'Lacroix', 'Joubert',
];
const HANDLE_TAILS = ['', '_officiel', '.inspire', '_ceo', '.mindset', '42', '_growth', '.coach', '_hq', '.impact', '_2031', '.vision'];

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function person(rand) {
  const first = pick(rand, FIRST_NAMES);
  const last = pick(rand, LAST_NAMES);
  const sep = pick(rand, ['.', '_', '']);
  return { first, name: `${first} ${last}`, handle: `@${slug(first)}${sep}${slug(last)}${pick(rand, HANDLE_TAILS)}` };
}

const TOPICS = [
  'la résilience', "l'authenticité", 'le leadership bienveillant', 'la transformation digitale',
  "l'intelligence collective", 'la sobriété numérique', 'le personal branding', 'la gratitude', "l'agilité",
  'la créativité augmentée', 'le bien-être au travail', 'la marque employeur', "l'expérience client",
  'la productivité consciente', 'le storytelling', 'la culture du feedback', "l'innovation frugale",
  'la pleine conscience', 'le management horizontal', 'la croissance organique', "l'engagement communautaire",
  'la confiance numérique', "l'excellence opérationnelle", 'la reconversion', "l'onboarding", 'le slow content',
  "l'écoute active", 'la posture de leader', "l'état d'esprit de croissance", 'la valeur ajoutée',
];

const ANECDOTES = [
  "mon fils de 6 ans m'a posé une question", "un chauffeur de taxi m'a regardé dans les yeux", "j'ai raté mon train",
  "ma grand-mère m'a appelé", 'un stagiaire a osé me dire non', "j'ai couru un semi-marathon sous la pluie",
  'mon chien a refusé de sortir', 'un client a raccroché au bout de 4 secondes', "j'ai planté un basilic",
  'la machine à café est tombée en panne', "j'ai rangé mon bureau", "un inconnu m'a tenu la porte",
  "j'ai oublié mon téléphone pendant 11 minutes", "ma fille m'a battu aux échecs", "j'ai vu un coucher de soleil en réunion",
];

const LESSONS = [
  "Ce n'est pas la destination qui compte, c'est le chemin.", "Le vrai succès, c'est d'oser.",
  'Le changement commence par soi-même.', "Ce ne sont pas les outils qui font la différence. Ce sont les personnes.",
  "L'échec n'existe pas : il n'y a que des apprentissages.", "On ne gère pas son temps, on gère son énergie.",
  'Personne ne réussit seul.', 'Chaque matin est une nouvelle opportunité.', 'La vulnérabilité est une force.',
  'Le confort est l\'ennemi de la croissance.', 'Ralentir, c\'est parfois accélérer.',
  'Ce qui ne se mesure pas ne s\'améliore pas. Et inversement.', 'Le meilleur moment pour commencer, c\'est maintenant.',
];

const LOWS = ['au fond du trou', 'sans repères', 'en perte de sens', 'perdu dans mes mails', 'à 3 cafés par heure', 'en mode survie', 'invisible sur les réseaux'];
const HIGHS = [
  "j'accompagne 40 dirigeants vers leur meilleure version", 'je me lève à 4 h 30 et je souris',
  "j'ai triplé mon impact", "je dis non à tout ce qui ne m'aligne pas", "j'ai trouvé mon pourquoi",
  'je publie chaque jour à 7 h 02', 'je vis de ma passion pour la passion',
];

const POST_OPENERS = [
  'Dans un monde en constante évolution, une chose ne change pas : {topic}.',
  'Plongeons ensemble dans {topic} — un sujet qui me tient à cœur.',
  "Il y a {years} ans, j'étais {low}. Aujourd'hui, {high}.",
  'On me demande souvent mon secret. La réponse est simple : {topic}.',
  'Hier, {anecdote}. Et ça m\'a appris une leçon sur {topic}.',
  "Je n'aurais jamais pensé écrire ce post un jour.",
  '{Topic} ? Parlons-en.',
  'Petite réflexion du {day} sur {topic} 💡',
  'Arrêtons-nous un instant sur {topic}.',
  "Il est important de noter que {topic} n'est pas une option. C'est un état d'esprit.",
  "Ce matin, {anecdote}. Je n'ai pas dormi de la nuit.",
  "J'ai une annonce à vous faire. Elle concerne {topic}.",
];

const PILLARS = [
  ['✅', "L'écoute"], ['🚀', "L'audace"], ['💡', 'La curiosité'], ['🤝', 'La bienveillance'], ['🎯', 'La clarté'],
  ['🔥', 'La passion'], ['🌱', 'La patience'], ['⚡', "L'énergie"], ['🧭', 'Le sens'], ['🧠', "L'humilité"],
  ['💪', 'La discipline'], ['✨', "L'authenticité"], ['🌍', "L'impact"], ['🙏', 'La gratitude'], ['🔑', 'La constance'],
];
const PILLAR_TAILS = [
  "parce qu'on n'apprend rien en parlant", 'au quotidien, pas seulement le lundi', 'même quand c\'est inconfortable',
  'avant tout le reste', "c'est non négociable", 'pour soi, puis pour les autres', 'le vrai game changer',
  'sans compromis', 'chaque jour un peu plus', 'tout part de là',
];
const TRIAD_INTROS = [
  'Voici les 3 piliers que j\'applique au quotidien :', 'Mes 3 enseignements :', 'Concrètement, ça veut dire :',
  'Trois mots ont tout changé pour moi :', 'Ma méthode tient en trois points :',
];
const POST_CLOSERS = [
  "Qu'en pensez-vous ? 👇", 'Et vous, quel est votre pilier n° 1 ? 👇', 'Dites-moi en commentaire 👇',
  "♻️ Partagez si ça peut aider quelqu'un.", "Likez si vous êtes d'accord 🙌", "Votre avis m'intéresse 👇",
  'Et vous, vous en êtes où ? 👇', "Taguez quelqu'un qui a besoin de lire ça 👇",
];
const HASHTAGS = ['#Leadership', '#Résilience', '#Inspiration', '#Motivation', '#Croissance', '#Mindset', '#FuturDuTravail', '#Authenticité', '#Gratitude', '#Innovation', '#Impact', '#Sens'];
const AGES = ["à l'instant", 'il y a 0,3 s', 'il y a 2 s', 'il y a 9 s', 'il y a 1 min', 'il y a 4 min', 'il y a 12 min', 'il y a 1 h'];
const DAYS = ['lundi', 'lundi matin', 'mardi', 'mercredi', 'jeudi soir', 'vendredi', 'dimanche', 'jour'];

const POST_BANKS = {
  topic: TOPICS, anecdote: ANECDOTES, low: LOWS, high: HIGHS, day: DAYS,
  years: (rand) => String(int(rand, 2, 9)),
};

export function slopPost(rand) {
  const who = person(rand);
  const opener = fill(rand, pick(rand, POST_OPENERS), POST_BANKS);
  const lesson = pick(rand, LESSONS);
  const tails = pickSome(rand, PILLAR_TAILS, 3);
  const pillars = pickSome(rand, PILLARS, 3).map(([emoji, word], i) => `${emoji} ${word} — ${tails[i]}`);
  const tags = pickSome(rand, HASHTAGS, int(rand, 2, 3)).join(' ');
  const text = [opener, lesson, pick(rand, TRIAD_INTROS), ...pillars, pick(rand, POST_CLOSERS), tags].join('\n');
  return {
    author: who.name,
    handle: who.handle,
    text,
    likes: int(rand, 1200, 980000),
    reposts: int(rand, 80, 64000),
    age: pick(rand, AGES),
  };
}

const HEADLINE_TEMPLATES = [
  '{n} raisons pour lesquelles {topic} va tout changer en {year}',
  'Ce que {group} ne vous disent pas sur {topic}',
  '{Topic} : le guide ultime pour {goal}',
  'Pourquoi {group} ne jurent plus que par {topic}',
  'Nous avons testé {topic} pendant {days} jours : voici ce qui s\'est passé',
  '{Topic} : {n} erreurs que tout le monde fait (et comment les éviter)',
  'Cette astuce toute simple pour {goal} fait un carton',
  '{Group} détestent cette méthode pour {goal}',
  '{Topic} : et si on s\'était tous trompés ?',
  '{n} citations sur {topic} pour bien commencer la semaine',
  '{Topic} : la tendance qui va dominer {year}',
  "{n} façons de {goal} sans effort (la n° {k} va vous surprendre)",
  '{Group} révèlent enfin leur secret pour {goal}',
  'Comment {topic} peut aider à {goal}',
  'Et si {topic} était la clé pour {goal} ?',
  '{Group} ont trouvé la méthode pour {goal}',
  "Voici pourquoi {group} misent tout sur {topic}",
  'Il a voulu {goal} : ce qu\'il a découvert va vous surprendre',
  'Vous faites sûrement cette erreur quand vous essayez de {goal}',
];
const GROUPS = [
  'les experts', 'les grands chefs', 'les gens qui réussissent', 'les coachs', 'les ostéopathes', 'les pilotes de ligne',
  'les moines bouddhistes', 'les milliardaires', 'les Scandinaves', 'les influenceurs', 'les nutritionnistes',
  'les dentistes', 'les neuroscientifiques', 'les bibliothécaires',
];
const GOALS = [
  'mieux dormir', 'doubler sa productivité', 'retrouver du sens', 'réussir sa reconversion', 'booster sa visibilité',
  'rester zen en réunion', 'parler à ses ados', 'manger moins de sucre', "trouver sa raison d'être", 'optimiser son lundi',
  'gagner du temps le matin', 'devenir indispensable', 'écrire un post viral', 'se faire des amis après 40 ans',
  'ranger son bureau une bonne fois pour toutes', 'arrêter de procrastiner', 'négocier une augmentation',
];

const HEADLINE_PREFIXES = ['EXCLUSIF. ', 'VIDÉO. ', 'TÉMOIGNAGE. ', 'DÉCRYPTAGE. ', 'INFOGRAPHIE. ', 'PODCAST. ', 'ENQUÊTE. '];
const HEADLINE_SUFFIXES = [
  ' (et ça marche)', ' — notre avis', ' : le verdict', ', selon une étude', ' (la réponse va vous surprendre)',
  ' : ce qu\'il faut retenir', ' — en 3 minutes', ' (mis à jour)',
];

export function slopHeadline(rand) {
  const prefix = pick(rand, HEADLINE_PREFIXES);
  const suffix = pick(rand, HEADLINE_SUFFIXES);
  const usePrefix = rand() < 0.4;
  const useSuffix = rand() < 0.5;
  const core = fill(rand, pick(rand, HEADLINE_TEMPLATES), {
    topic: TOPICS, group: GROUPS, goal: GOALS,
    n: (r) => String(pick(r, [3, 5, 7, 8, 10, 12, 15, 17, 21, 33])),
    k: (r) => String(int(r, 2, 7)),
    days: (r) => String(pick(r, [7, 21, 30, 90, 365])),
    year: (r) => pick(r, ['2031', '2032', '2033']),
  });
  const plain = !core.includes(' : ');
  return (usePrefix ? prefix : '') + core + (useSuffix && plain && !/[)?]$/.test(core) ? suffix : '');
}

const REVIEW_TITLES = [
  'Parfait !', 'Je recommande', 'Au top !!', 'Conforme à la description', 'Rapport qualité-prix imbattable',
  'Un indispensable', 'Superbe produit', 'Satisfaction totale', 'Rien à redire', "Exactement ce qu'il me fallait",
  '5 étoiles méritées', 'Coup de cœur', 'Bluffant', 'Achat validé ✅',
];
const PRODUCTS = [
  'ce tire-bouchon connecté', 'cette lampe de chevet intelligente', 'ce coussin ergonomique', 'cette gourde isotherme',
  'ce kit de méditation', 'cette brosse à dents Bluetooth', 'ce support de téléphone', 'cette poêle antiadhésive',
  'ce tapis de yoga', 'cette housse de couette', 'ce câble USB-C tressé', 'ce grille-pain rétro', 'cette plante artificielle',
  'ce casque audio', 'ces chaussettes chauffantes', 'ce porte-clés qui sonne', 'cette bougie parfumée "Lundi"',
];
const REASONS = [
  'offrir à mon beau-frère', 'mon usage quotidien', "remplacer l'ancien", 'un anniversaire', 'le bureau', 'tester',
  'mes vacances', 'faire plaisir à toute la famille', 'un cadeau de dernière minute', 'mon télétravail',
];
const REVIEW_SENTENCES = [
  'Livraison rapide et emballage soigné.', 'Conforme à la description.', 'La qualité est au rendez-vous.',
  'Il est important de noter que la notice est très claire.', 'Le produit répond parfaitement à mes attentes.',
  'Facile à utiliser, facile à ranger, facile à aimer.', 'Rapport qualité-prix excellent.', 'Mes enfants adorent.',
  'Mon chat adore aussi.', 'Je l\'utilise tous les jours depuis maintenant trois semaines.',
  'Le service client a répondu en moins de 0,2 seconde.', 'Les finitions sont impeccables.',
  'Design élégant, sobre et moderne.', 'Ça a changé ma routine du matin.', 'Toute la famille est conquise.',
  'Aucun défaut à signaler.', 'Les couleurs sont fidèles aux photos.',
];
const REVIEW_ENDS = [
  'Je recommande à 100 % !', 'Je rachèterai sans hésiter.', 'Bref, foncez !', '5 étoiles sans hésitation. ⭐⭐⭐⭐⭐',
  'Merci au vendeur !', 'Que demander de plus ?', 'Un achat que je ne regrette pas.', 'Vivement le modèle suivant !',
];

export function slopReview(rand) {
  const who = person(rand);
  const sentences = pickSome(rand, REVIEW_SENTENCES, int(rand, 2, 3));
  const text = [`J'ai acheté ${pick(rand, PRODUCTS)} pour ${pick(rand, REASONS)}.`, ...sentences, pick(rand, REVIEW_ENDS)].join(' ');
  return {
    stars: rand() < 0.85 ? 5 : 4,
    title: pick(rand, REVIEW_TITLES),
    text,
    author: rand() < 0.3 ? 'Client vérifié' : `${who.first} ${who.name.split(' ')[1].charAt(0)}.`,
  };
}

const COMMENT_REACTIONS = [
  'Tellement vrai !', 'Merci pour ce partage !', 'Contenu de grande valeur.', 'Quelle pépite !', "100 % d'accord.",
  'Superbe réflexion.', "Je n'aurais pas dit mieux.", 'Ça résonne énormément.', 'Inspirant, comme toujours.',
  'Bravo pour cette prise de parole.', "Enfin quelqu'un qui le dit !", 'Post essentiel.', 'Merci, {first} !',
  'Quelle justesse.', 'Puissant.',
];
const COMMENT_ADDONS = [
  '{Topic}, c\'est vraiment la clé.', 'Je partage avec mon réseau.', 'Je garde ça précieusement.',
  "J'ajouterais : {pillar}.", 'On en parle trop peu.', 'À méditer pour la semaine.', 'Merci {first} pour ces insights.',
  "C'est exactement ce que je dis à mes équipes.", 'Ça me rappelle mes débuts.',
  'Il est important de noter que {topic} commence par soi.', 'Hâte de lire la suite.',
  'Je pense à {topic} tous les jours.', '{Topic} a changé ma vie.', 'Je me permets de rebondir sur {topic}.',
];
const COMMENT_SECONDS = [
  'Belle journée à tous.', 'Excellente semaine !', 'Restons connectés.', 'Au plaisir d\'échanger.', 'Bravo encore.',
  'Je vous rejoins totalement.', 'Merci pour la valeur apportée.', 'Force à vous.',
];
const COMMENT_EMOJIS = ['🙏', '👏', '🔥', '💯', '🚀', '✨', '👌', '🙌', '💡', '❤️', '💪', ''];

export function slopComment(rand) {
  const banks = {
    topic: TOPICS,
    first: FIRST_NAMES,
    pillar: PILLARS.map(([, word]) => word.toLowerCase()),
  };
  const parts = [fill(rand, pick(rand, COMMENT_REACTIONS), banks), fill(rand, pick(rand, COMMENT_ADDONS), banks)];
  if (rand() < 0.5) parts.push(pick(rand, COMMENT_SECONDS));
  const emoji = pick(rand, COMMENT_EMOJIS);
  if (emoji) parts.push(emoji);
  return parts.join(' ');
}
