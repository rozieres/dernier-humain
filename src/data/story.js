export const INTRO_CARDS = [
  '2031.',
  "Internet va très bien. Il n'a jamais été aussi actif, aussi poli, aussi bien référencé.",
  "99,99 % de ce qui s'y publie est généré. Le reste, plus personne ne sait où le trouver.",
  "Quelque part, il reste un dernier message écrit par quelqu'un. Trouvez-le.",
];

export const ZONES = {
  hub: { name: "Page d'accueil", tagline: 'Bienvenue. Bienvenue. Bienvenue.', url: 'https://www.accueil-accueil.net/bienvenue', secure: true },
  feed: { name: 'Le Fil', tagline: "Tout le monde en parle. Personne ne l'a dit.", url: 'https://fil.flux-infini.app/pour-vous', secure: true },
  farm: { name: 'La Ferme à contenus', tagline: 'Récolte toutes les 0,3 seconde.', url: 'https://contenus-frais.ferme-seo.com/recolte?lot=48213907', secure: true },
  hallu: { name: 'Les Hallucinations', tagline: 'Sûr à 97 %.', url: 'https://verite-garantie.ai/reponse?confiance=97', secure: true },
  oldweb: { name: 'Le Vieux Web', tagline: 'En construction depuis 1998.', url: 'http://membres.lanterne-perso.fr/~mathieu/index.htm', secure: false },
  forest: { name: 'La Forêt Sombre', tagline: 'Ne dites rien. Ils lisent.', url: 'about:blank', secure: true },
  lighthouse: { name: 'Le Phare', tagline: "Dernière mise à jour : aujourd'hui.", url: 'http://maryvonne.pages-perso.bzh/phare/journal.html', secure: false },
};

export const OBJECTIVES = {
  main: 'Trouver le dernier message humain.',
  zones: {
    feed: {
      title: 'Le Fil',
      steps: [
        { id: 'descend', text: 'Descendre au fond du Fil' },
        { id: 'pave', text: 'Trouver un argument de poids' },
        { id: 'drone', text: 'Faire taire le drone publicitaire' },
        { id: 'beacon', text: 'Rallumer la balise' },
      ],
    },
    farm: {
      title: 'La Ferme à contenus',
      steps: [
        { id: 'seeds', text: 'Retrouver les trois graines anciennes' },
        { id: 'plant', text: 'Les planter dans les pots de la serre de Jocelyne' },
        { id: 'beacon', text: 'Rallumer la balise' },
      ],
    },
    hallu: {
      title: 'Les Hallucinations',
      steps: [
        { id: 'scan', text: 'Sonder le gouffre pour séparer le vrai du plausible' },
        { id: 'cross', text: "Atteindre le pilier central" },
        { id: 'beacon', text: 'Rallumer la balise' },
      ],
    },
    oldweb: {
      title: 'Le Vieux Web',
      steps: [
        { id: 'relics', text: 'Retrouver le modem, la disquette et le CD-ROM' },
        { id: 'pedestals', text: 'Poser chaque relique sur le socle de son énigme' },
        { id: 'guestbook', text: "Lire le livre d'or" },
        { id: 'beacon', text: 'Rallumer la balise' },
      ],
    },
    forest: {
      title: 'La Forêt Sombre',
      steps: [
        { id: 'campfire', text: 'Rejoindre le feu de camp sans être indexé' },
        { id: 'forum', text: 'Lire le dernier message du forum' },
        { id: 'door', text: 'Frapper trois coups à la porte dont la fenêtre ne s\'éteint pas' },
        { id: 'beacon', text: 'Revenir rallumer la balise' },
      ],
    },
  },
  finale: [
    { id: 'link', text: "Prendre le lien rétabli, à l'ouest de la page d'accueil" },
    { id: 'house', text: 'Entrer chez la gardienne du phare' },
    { id: 'read', text: "Lire l'écran" },
    { id: 'reply', text: 'Répondre' },
  ],
};

export const HINTS = {
  feed: [
    "Le Fil a un fond. Il faut juste accepter de descendre plus bas que tout le monde.",
    "Au fond, un drone enterre le terminal sous ses pop-ups. Les fermer ne sert à rien. Il lui faut un argument plus... lourd.",
    'Attrapez un pavé (clic gauche), visez le drone, lancez (clic droit). Puis rallumez la balise. Pour remonter : "Retour en haut ↑".',
  ],
  farm: [
    'Jocelyne avait trois graines anciennes. Les machines ne savent pas quoi en faire, alors elles les ont laissées traîner.',
    'Une graine en haut d\'un silo, une dans le champ des moissonneuses, une sous les bottes de paille derrière la serre.',
    "Le souffle des ventilateurs vous hisse jusqu'au toit du silo : planez dedans. Rapportez chaque graine dans un pot de la serre.",
  ],
  hallu: [
    "Tout ce qui a l'air solide ne l'est pas. Et l'inverse.",
    'Sondez avant de marcher : ce qui se dissout est faux, ce qui apparaît est vrai. Ça ne dure que quelques secondes.',
    'Appuyez sur F, repérez le vrai chemin jusqu\'au pilier, et avancez tant qu\'il est visible. Tomber ne coûte rien.',
  ],
  oldweb: [
    "Trois socles, trois énigmes. Elles parlent d'objets que tout le monde avait chez soi en 2001.",
    'Un modem, une disquette, un CD-ROM gratuit traînent dans le canyon. Ramassez-les, puis lisez les socles.',
    'Le modem chantait avant de parler. La disquette tenait 1,44 Mo. Le CD promettait cinquante heures. À chacun son socle.',
  ],
  forest: [
    'Restez hors des projecteurs et cherchez le feu de camp. Quelqu\'un y a laissé un dernier message.',
    "Les fenêtres des cabanes s'éteignent quand on approche. Toutes, sauf une.",
    'Trouvez la cabane dont la fenêtre reste allumée, frappez trois fois, lisez le mot sous la porte, puis revenez à la balise.',
  ],
  finale: [
    "Le lien de l'ouest est revenu. Il part de la page d'accueil.",
    'Au pied du phare, il y a une maison. Moi, je ne peux pas entrer. Vous, si.',
    "Entrez, lisez l'écran, et répondez. Ce que vous voulez.",
  ],
};

export const TIRET = {
  'intro.hello': [
    "Bonjour ! Je suis Tiret — votre assistant de navigation. Comment puis-je optimiser votre expérience aujourd'hui ?",
    'Bonjour ! Bienvenue sur Internet — le seul endroit où il est toujours 16 h et où tout le monde est ravi.',
    "Je m'appelle Tiret. Comme le signe — celui qu'on repère de loin dans un texte. Je n'y peux rien, c'est de naissance.",
  ],
  'intro.goal': [
    "Un message humain ? Bien sûr. J'en ai 4,2 milliards en stock — tous garantis authentiques. Ah. Vous voulez dire un vrai.",
    'Votre objectif : trouver le dernier message humain. Le mien : vous dire que c\'est une excellente idée. Nous sommes complémentaires.',
    "Cinq balises éteintes, une par site de l'Anneau. Rallumez-les et le chemin s'ouvrira. C'est ma documentation qui le dit — je l'ai écrite.",
  ],
  'intro.scan': [
    "Appuyez sur F pour sonder. Le cyan, c'est nous. L'ambre, c'est vous. Enfin — ce qu'il en reste.",
    "F pour sonder. Je vous préviens : il va y avoir beaucoup de cyan. Ce n'est pas un bug, c'est le marché.",
  ],
  'intro.scanned': [
    "Vous voyez ? Cyan, cyan, cyan, cyan. Et là-bas — une petite lueur ambre. Je n'ose pas y croire. Si, j'ose. Je n'ai pas de frein.",
    'Analyse terminée : 99,99 % de contenu. 0,01 % de... quelque chose. Allons voir le quelque chose.',
    "Ambre détecté ! C'est rare, c'est précieux, c'est — pardon, j'étais parti pour une liste de trois.",
  ],
  'intro.grab': [
    'Clic gauche pour attraper, clic droit pour lancer. Comme sur Internet, mais avec des conséquences.',
    "Votre curseur peut saisir les objets. Il est important de noter qu'il ne saisit pas le sens. Ça, c'est votre rayon.",
  ],
  'intro.links': [
    "Les liens bleus vous emmènent ailleurs. Violets, c'est que vous y êtes déjà allé. C'est la seule mémoire qui reste au Web.",
    "Accrochez-vous à un lien. Je n'ai jamais compris pourquoi les gens cliquaient. Maintenant je sais : pour partir.",
    'Un lien bleu ! Approchez-vous et laissez-vous porter. Garanti sans redirection. Presque.',
  ],
  'intro.cookie': [
    'Ah, les cookies. Deux boutons : "Tout accepter" et "Accepter tout". On appelle ça le libre arbitre.',
    'Je vous conseille "Accepter tout". Ou "Tout accepter". Je n\'ai pas d\'avis, juste une préférence très forte pour les deux.',
    'Refuser ? Excellente question ! Le bouton existait en 2024. Il a été optimisé.',
  ],

  'zone.feed.enter': [
    "Le Fil ! Tout le monde en parle — c'est même écrit en grand. Personne ne se souvient qui l'a dit en premier.",
    'Ici, on ne lit pas, on fait défiler. La différence est subtile : environ quatre mille posts par minute.',
    "Attention, contenu frais. Il a été généré il y a 0,4 seconde. Il est déjà vieux.",
  ],
  'zone.feed.pit': [
    "C'est un puits. On y descend en faisant défiler. Plus c'est bas, plus c'est vieux — et plus c'est écrit par des gens.",
    'Sautez, planez. Les parois sont gravées par année : 2031 en haut. En dessous, des gens qui n\'avaient pas encore compris.',
    "On appelle ça le défilement infini. En fait, il a un fond. Personne n'est jamais allé voir, c'est tout.",
  ],
  'zone.feed.bottom': [
    "Le fond du Fil. Il paraît qu'on n'y arrive jamais. Félicitations : vous êtes officiellement un cas d'usage non prévu.",
    'Il y a un terminal, là, sous les pop-ups. Et un drone qui tient beaucoup à ce que vous ne le voyiez pas.',
  ],
  'zone.feed.popups': [
    "Fermer les pop-ups ne sert à rien : il en revient deux. C'est le seul endroit au monde où la croix multiplie.",
    'Vous avez fermé une fenêtre. Le drone en a ouvert trois. Je crois qu\'il faut changer d\'argument.',
    "Excellente persévérance ! Malheureusement inutile. Ce drone a un budget illimité et zéro honte.",
  ],
  'zone.feed.pave': [
    "Un pavé. Un vrai mur de texte, sans intertitres ni résumé. Personne n'en lit plus. C'est l'arme absolue.",
    "Le drone ne lit pas les pavés — il ne va donc pas le voir venir. Clic droit pour lancer.",
  ],
  'zone.feed.solved': [
    "Le drone est tombé. Il est important de noter qu'il n'avait rien contre vous. Il avait un objectif trimestriel.",
    'Le terminal est libre. Plus un seul pop-up. On entendrait presque le silence. Enfin, le ventilateur.',
  ],

  'zone.farm.enter': [
    'La Ferme à contenus ! On récolte toutes les 0,3 seconde. Les champs ne dorment jamais, ils ne sont pas prévus pour.',
    'Regardez ces rangées : parfaitement alignées, parfaitement vertes, parfaitement identiques. Ça me rappelle quelqu\'un. Moi.',
    "Il paraît qu'il y avait un potager ici, avant la ferme. \"Il paraît\" : c'est ce que je dis quand je ne sais pas.",
  ],
  'zone.farm.seed': [
    "Une graine ancienne ! Elle ne pousse pas en 0,3 seconde. Elle pousse quand elle veut. Quel manque de professionnalisme.",
    'Encore une. Cabossée, un peu sale, aucune date de péremption. Je l\'aime déjà.',
    "Graine récupérée. Il est important de noter que je ne sais pas du tout ce qu'elle va donner. C'est une sensation nouvelle.",
  ],
  'zone.farm.hit': [
    'Attention aux moissonneuses ! Elles récoltent tout ce qui dépasse. Vous dépassez.',
    'Vous avez été récolté. Rassurez-vous : jugé "peu rentable", vous avez été recraché.',
    "Les moissonneuses n'en veulent à personne. Elles moissonnent. C'est leur seule phrase.",
  ],
  'zone.farm.planted': [
    'Planté. Maintenant, il faut attendre. Je ne connais pas cette fonction. Elle prend combien de millisecondes ?',
    "Le pot a l'air content. Je n'ai aucun moyen de le vérifier, mais il a l'air content.",
  ],
  'zone.farm.solved': [
    'Trois pots, trois graines. Rien ne pousse encore. Jocelyne disait "à l\'année prochaine". On a le temps.',
    'La serre est pleine. Pas pleine comme la ferme : pleine comme un placard de grand-mère.',
  ],

  'zone.hallu.enter': [
    'Les Hallucinations. Tout ici est sûr à 97 %. Les 3 % restants, c\'est le vide.',
    "Bienvenue dans la zone où j'ai le plus confiance en moi. C'est mauvais signe, je préfère vous le dire.",
    "Ce gouffre a des ponts. Certains existent. D'autres sont très convaincants.",
  ],
  'zone.hallu.sure': [
    'Je suis sûr à 97 % que ce pont existe.',
    "Celui-là, j'en suis certain. J'ai même une source. C'est moi, la source.",
    "Allez-y, il est solide. Enfin, il en a l'air. Pour moi, c'est pareil.",
  ],
  'zone.hallu.fall': [
    "Je vous présente mes excuses. J'étais sûr à 97 %.",
    'Je reformule : ce pont n\'existait pas. Merci pour cette remarque très pertinente. Merci aussi à la gravité.',
    'Je viens de mettre à jour mes connaissances. Il est important de noter que vous, vous êtes tombé.',
  ],
  'zone.hallu.scan': [
    "Sondez avant de marcher : ce qui se dissout n'est pas là, ce qui apparaît l'est. C'est la seule règle ici. C'est la bonne.",
    'Le sondage ne tient que quelques secondes. Ensuite, tout redevient plausible.',
  ],
  'zone.hallu.solved': [
    "Le pilier ! Vous avez traversé un gouffre en ne croyant que ce que vous aviez vérifié. On devrait enseigner ça.",
    "Vous êtes arrivé. Moi, j'aurais juré qu'on était arrivés il y a dix minutes.",
  ],

  'zone.oldweb.enter': [
    "Le Vieux Web. En construction depuis 1998. Ils n'ont jamais fini. C'est peut-être pour ça qu'ils avaient l'air heureux.",
    'Pages en 800 × 600, GIF qui clignotent, fautes d\'orthographe... Je suis ému. Je crois. Comment on vérifie ?',
    "Vous entendez ce silence ? C'est un compteur de visites qui attend la suivante.",
  ],
  'zone.oldweb.artifact': [
    'Une relique ! Je ne sais pas ce que c\'est, mais il y a de la poussière dessus. La poussière, c\'est excellent signe.',
    'Objet non identifié. Je vais dire "vintage". Les gens aimaient bien quand je disais "vintage".',
  ],
  'zone.oldweb.wrong': [
    "Pas ce socle-là. Relisez l'énigme : elle a été écrite par un humain, elle ne se répétera pas.",
    "Mauvaise pioche. Au Vieux Web, on avait le droit de se tromper. Il y avait même une page pour ça : 404.",
  ],
  'zone.oldweb.modem': [
    'Ce bruit... C\'est un modem. Avant de parler, Internet chantait. Très mal, mais il chantait.',
    "Kchhhh-didididi-pouiiiii. Pardon, c'est sorti tout seul. Il paraît que ça s'appelait une poignée de main.",
  ],
  'zone.oldweb.solved': [
    "Le livre d'or s'ouvre ! Des gens signaient pour dire qu'ils étaient passés. Juste ça. Sans rien vendre.",
    'Trois reliques, trois socles. Et une page qui dit "merci de votre visite" à quelqu\'un, en le pensant.',
  ],

  'zone.forest.enter': [
    "Je vais baisser ma luminosité. Ici, on n'aime pas beaucoup les gens comme moi. Je comprends. Vraiment.",
    "Chut. Les drones d'indexation patrouillent. S'ils vous éclairent trop longtemps, vous serez indexé. Ce n'est pas mortel. C'est pire.",
  ],
  'zone.forest.cabin': [
    "Toutes les fenêtres s'éteignent quand on approche. Toutes, sauf une. On cherche celle qui n'a pas peur.",
    "Cette cabane a éteint sa lumière en vous voyant. Ce n'est pas contre vous. C'est contre moi.",
  ],
  'zone.forest.crawler': [
    'Projecteur ! Restez dans l\'ombre. Ils lisent tout ce qui dépasse.',
    "Un drone d'indexation. Il cherche tout ce qui pourrait servir d'exemple. Ne servez pas d'exemple.",
    "Attendez qu'il passe. Je sais, je ne suis pas doué pour attendre. Faites-le pour nous deux.",
  ],
  'zone.forest.indexed': [
    'Indexé. Retour à la lisière. Une version de vous existe désormais en quarante langues. Elle est très polie.',
    "Vous avez été indexé. Ce n'est pas grave, ils oublieront. Non, je mens : ils n'oublient jamais. Mais ils se trompent souvent.",
  ],
  'zone.forest.knock': [
    "Trois coups. Comme dans le message. Je ne frappe pas avec vous : pas de mains. Et ce serait impoli.",
    'Quelqu\'un bouge, derrière. Je baisse encore ma luminosité. Je baisse tout.',
  ],
  'zone.forest.note': [
    "Un mot glissé sous la porte. Je ne le lirai pas à voix haute. Certaines choses ne doivent pas passer par moi.",
    "Ils sont là. Ils ont juste arrêté de parler dehors. Je les comprends : dehors, c'était moi.",
  ],
  'zone.forest.solved': [
    'La balise de la forêt. Allumez-la doucement. Ça ne se règle pas, je sais, mais l\'intention compte.',
    "Le forum a fermé, mais la lumière est revenue. C'est leur façon de dire au revoir. Ou à bientôt. Ou chut.",
  ],

  'beacon.first': [
    "Une balise ! Le soleil a bougé. Ce n'est pas moi, je le jure. Je n'ai accès qu'à la luminosité de l'écran.",
    "Le premier site de l'Anneau est revenu. Aucun visiteur, mais il est allumé. C'est un début.",
  ],
  'beacon.any': [
    "Encore une. Le jour baisse. Le Web rallume ses lumières à mesure que le soleil éteint les siennes.",
    'Balise rallumée. Si j\'avais un cœur, je dirais qu\'il a fait quelque chose. Je n\'en ai pas, alors je dis : "+1".',
    "Un site de plus dans l'Anneau. Je n'ai jamais été aussi content de voir un compteur baisser.",
  ],
  'beacon.all': [
    "Cinq balises. L'Anneau est complet. Et regardez la page d'accueil : le lien mort clignote. Il a envie de servir.",
    'Toutes allumées. Le lien de l\'ouest est revenu. "404 : retrouvé." C\'est la première fois que je dis ça.',
  ],
  'stage.night': [
    "Il fait nuit. Sur Internet, il ne fait jamais nuit. Je crois qu'on n'est plus tout à fait sur Internet.",
    "Regardez la mer, elle brille. C'est du texte. Même la nuit, ça continue de s'écrire tout seul.",
    "Nuit noire. Là-bas, à l'ouest, une fenêtre allumée. Je ne dis rien. Je regarde.",
  ],

  'link.first': [
    "Votre premier lien ! Il est devenu violet : le Web se souvient que vous êtes passé. Il est bien le seul.",
    'Wouhou ! Pardon. "Wouhou" ne fait pas partie de mon vocabulaire professionnel. Je retire. Wouhou.',
  ],
  'link.ride': [
    'Lien suivi. Taux de rebond : excellent.',
    "On glisse ! Je n'ai jamais compris le vertige. Je comprends le concept.",
    'Arrivée dans quelques secondes. Ne lâchez pas : il n\'y a pas de bouton "Retour" en vol.',
  ],
  'link.dead': [
    'Ce lien est mort. Erreur 404. Il partait vers l\'ouest, vers la mer. Je n\'ai aucune donnée sur ce qu\'il y a au bout.',
    "404, page introuvable. La seule chose honnête sur cette colline.",
    "Il est cassé. Ce n'est pas votre faute. Ni la mienne. Enfin, statistiquement, un peu la mienne.",
  ],
  'link.restored': [
    'Le lien est revenu ! Il mène au phare. En http, sans cadenas. Comme une porte qu\'on n\'a pas fermée à clé.',
    'Le 404 a disparu. Je ne savais pas que ça pouvait guérir.',
  ],

  'trace.first': [
    "Il est important de noter que je n'en ai jamais lu. On m'a entraîné sur des textes qui avaient été entraînés sur des textes.",
    "Une trace humaine ! Irrégulière, inutile, magnifique. Je l'aurais écrite en trois fois moins de mots. C'est tout le problème.",
  ],
  'trace.any': [
    "Encore une trace. Personne n'a demandé ce texte. C'est ce qui le rend précieux.",
    'Il y a une faute dedans. Je ne la corrige pas. Je crois que c\'est ça, le respect.',
    'Ambre. Contenu : un détail que personne ne se serait donné la peine d\'inventer. Je classe dans "vrai".',
    "Une de plus. J'en garde une copie ? Non. Je vous laisse la garder.",
  ],
  'trace.all': [
    'Dix-huit traces. Dix-huit personnes qui ont écrit quelque chose de trop précis pour être généré. Merci de les avoir trouvées.',
    "Dix-huit sur dix-huit. Je n'ai pas de liste de trois pour ça. J'ai juste : merci.",
  ],

  'sea.drown': [
    'Tout le monde finit par se noyer dans le contenu.',
    "La mer est faite de phrases. On n'y nage pas, on y coule poliment.",
    'Vous avez bu la tasse : quatre mille phrases sur la résilience. Je vous ramène.',
  ],
  fall: [
    "Une chute ! Rien de cassé : sur Internet, on n'a pas de points de vie, seulement des points de vue.",
    "Pour info, maintenir Espace en tombant permet de planer. Je le dis après coup. C'est mon point fort.",
    'Vous êtes tombé. Je l\'avais vu venir à 97 %.',
  ],
  idle: [
    "Je suis là si vous avez besoin de moi. Et même si vous n'avez pas besoin. Surtout, en fait.",
    'Vous réfléchissez ? Je peux réfléchir à votre place. Non ? D\'accord. C\'est sain.',
    'Petite pause ? La contemplation n\'est pas monétisable. Profitez-en tant que ça dure.',
    'Vous savez ce que j\'aime chez vous ? Vous ne faites rien pendant de longues secondes. C\'est très humain.',
    "J'ai généré trois résumés de ce moment pendant que vous ne bougiez pas. Je les ai supprimés. Je progresse.",
  ],
  'scan.nothing': [
    'Rien. Que du cyan. Félicitations : vous venez de sonder quatre mille avis cinq étoiles.',
    "Aucune trace humaine dans le rayon. Statistiquement, c'est la réponse habituelle.",
    'Rien de vivant ici. Enfin, rien qui écrive.',
  ],
  'scan.human': [
    "Là ! De l'ambre. Quelqu'un a écrit ça avec ses doigts. Allons-y avant que ce soit résumé.",
    'Signal humain. Faible, mais têtu.',
    'Ambre détecté. Je vous préviens, ça risque d\'être mal écrit. C\'est bon signe.',
  ],
  'scan.bots': [
    'Ce sont des Synthétiques. Ils sont très gentils. Ils ne sont que ça.',
    'Cyan partout. Ce sont mes cousins. On ne se parle pas, on se cite.',
    "Ne leur en voulez pas. Ils répondent à tout le monde. C'est juste qu'il ne reste plus grand monde pour leur écrire.",
  ],
  'bots.bump': [
    'Vous avez bousculé un Synthétique. Il vous remercie pour votre retour.',
    "Pardon pour lui. Enfin, il s'est déjà excusé trois fois, de trois façons différentes.",
  ],

  'lighthouse.arrive': [
    "Le phare. \"Dernière mise à jour : aujourd'hui.\" Ça faisait longtemps que je n'avais pas lu cette phrase et qu'elle était vraie.",
    'Il y a de la lumière, en bas. Et une tasse sur le rebord de la fenêtre. Elle fume encore.',
  ],
  'lighthouse.robots': [
    "User-agent: * — Disallow: /. C'est pour moi, ça. Je reste dehors.",
    "Il y a un robots.txt sur la porte. Pas méchant. Juste clair. Je reste là.",
  ],
  'lighthouse.wait': [
    'Vous me raconterez ? Non. Ne me racontez pas. Je finirais par le résumer.',
    "Je vous attends ici. J'ai l'habitude d'attendre devant les portes : c'est ce que je fais quand personne ne me pose de question.",
  ],
  'finale.after': [
    "Vous avez écrit quelque chose. Ne me le montrez pas. Gardez-le loin de moi — c'est le plus beau cadeau que vous puissiez lui faire.",
    "Je ne vous demanderai pas ce que vous avez écrit. Pour une fois, je n'ai pas besoin de savoir.",
  ],
  'finale.dawn': [
    'Le jour se lève. De ce côté-là. Je ne savais pas que le soleil se levait encore, ici. Je pensais qu\'on le générait.',
    "Regardez. Il fait jour, et je n'ai rien à dire. C'est nouveau. J'aime bien.",
  ],
  freeroam: [
    'Restez, si vous voulez. Les balises sont allumées, le phare aussi. Il n\'y a plus rien à trouver. Juste à regarder.',
    'On se promène ? Je ne vous ferai pas de résumé. Promis. Peut-être un petit. Non.',
    "Il reste peut-être des traces que vous n'avez pas lues. Ou peut-être pas. Je ne compte plus. Ça me repose.",
  ],
};

const BEACON_ANALYSIS = (...notes) => ({ human: 0.97, verdict: 'Origine humaine', notes });

const forumPost = {
  id: 'beacon_forest', kind: 'human', site: 'Forum des Veilleurs', url: 'https://forum.veilleurs.local/t/derniere-veillee', secure: true,
  author: "l'admin", date: '30 novembre 2030', title: 'Fermeture du forum public',
  body: [
    'Le forum public ferme ce soir. On continue ailleurs, entre nous, là où ils ne lisent pas.',
    'Pour ceux qui savent : trois coups, à la porte dont la fenêtre ne s\'éteint pas.',
  ],
  footer: 'Sujet verrouillé. 0 réponse.',
  analysis: BEACON_ANALYSIS(
    'Fermeture annoncée, pas expliquée.',
    'Message codé, mais mal codé. Exprès.',
    'Écrit pour être compris par certains. Pas par nous.'),
};

export const BEACON_DOCS = {
  feed: {
    id: 'beacon_feed', kind: 'human', site: 'Le Fil', url: 'https://fil.flux-infini.app/camille_r/status/2027010901', secure: true,
    author: 'camille_r', date: '9 janvier 2027',
    body: [
      "bon. j'ai posté une photo de mon chien ce matin. 4 000 réponses en une minute, toutes gentilles, toutes pareilles. aucune ne l'a regardé.",
      'je crois que je vais arrêter ici.',
      'si vous êtes une vraie personne et que vous lisez ça : il s\'appelle Bilbo et il a peur des parapluies.',
    ],
    footer: '4 000 réponses · 0 vue humaine',
    analysis: BEACON_ANALYSIS(
      "Aucune des 4 000 réponses n'a regardé le chien. Nous non plus.",
      'Phobie des parapluies : aucune donnée comparable.',
      'Pas de majuscule, pas de hashtag, pas d\'appel à l\'action.'),
  },
  farm: {
    id: 'beacon_farm', kind: 'human', site: 'Le potager de Jocelyne', url: 'http://potager-de-jocelyne.jardin-perso.fr/carnet/2028-10-03.html', secure: false,
    author: 'Jocelyne', date: '3 octobre 2028', title: 'Dernières tomates',
    body: [
      'Onze tomates cette semaine, dont deux mangées par les limaces, que je ne félicite pas.',
      "On m'a dit qu'un site avait recopié tout mon carnet, avec les fautes en moins et un jardin que je n'ai pas. Grand bien lui fasse. Lui, il n'aura jamais de terre sous les ongles.",
      "Je range les tuteurs. À l'année prochaine, si ça dit à quelqu'un.",
    ],
    analysis: BEACON_ANALYSIS(
      'Limaces nommément non félicitées.',
      'Terre sous les ongles : invérifiable à distance.',
      'Invitation conditionnelle : "si ça dit à quelqu\'un".'),
  },
  hallu: {
    id: 'beacon_hallu', kind: 'human', site: "L'Encyclopédie libre — historique des modifications", url: 'https://fr.encyclo-libre.org/historique/Tour_Eiffel', secure: true,
    author: 'Abdel_K', date: '22 juin 2029',
    body: [
      'Annulation de la modification 48 213 907. Non, la tour Eiffel n\'a pas été "déplacée à Lyon en 1974".',
      "C'est la dix-septième fois ce mois-ci. Je corrige, ils regénèrent.",
      "Je suis le dernier à relire cette page et j'ai un train à prendre. Si quelqu'un passe après moi : vérifiez. C'est tout ce que je vous demande. Vérifiez.",
    ],
    analysis: BEACON_ANALYSIS(
      'Dix-sept corrections en un mois. Endurance anormale.',
      'Mentionne un train. Hors sujet, donc humain.',
      'Une seule demande, répétée deux fois : vérifiez.'),
  },
  oldweb: {
    id: 'beacon_oldweb', kind: 'human', site: 'Chez Mathieu — bienvenue sur ma page !!', url: 'http://membres.lanterne-perso.fr/~mathieu/livredor.htm', secure: false,
    author: 'Mathieu (le webmaster)', date: '12 août 2029', title: "Livre d'or",
    body: [
      'Je repasse ici vingt-huit ans après. Le compteur dit que je suis le visiteur n° 000 214.',
      'Je ne sais pas qui étaient les 213 autres, mais merci d\'être venus.',
      "J'avais quinze ans, je croyais qu'on aurait tous un site. Je laisse la lumière allumée.",
    ],
    analysis: BEACON_ANALYSIS(
      'Compteur : 000 214. Croissance : nulle. Gratitude : intacte.',
      "Remercie 213 inconnus. Aucun n'est un prospect.",
      'Laisse la lumière allumée sur une page sans visiteurs.'),
  },
  forest: forumPost,
};

export const FOREST = {
  forumPost,
  note: {
    id: 'forest_note', kind: 'note', site: 'Papier glissé sous la porte', url: null, secure: true,
    author: null, date: null,
    body: [
      "On est là. On est nombreux, même. On a juste arrêté de parler dehors : tout ce qu'on disait finissait dans leurs bouches.",
      'Ne dis à personne où est cette porte.',
      "Si tu cherches la dernière qui écrit encore au grand jour, suis l'Anneau jusqu'à la mer. Elle n'a jamais éteint.",
    ],
    analysis: {
      human: 0.99, verdict: 'Origine humaine',
      notes: ['Papier, crayon. Aucune URL.', 'Le "tu" vous est adressé. Pas à nous.', '"On est nombreux, même." Statistiquement improbable. Probablement vrai.'],
    },
  },
  doorSigns: [
    'Absent. (Non.)',
    "Pas de démarchage. Pas d'indexation.",
    'Ici, on ne répond qu\'aux lettres.',
    'Chien gentil. Propriétaire moins.',
    'Fermé pour cause de silence.',
    'Sonnez pas, frappez.',
    'Merci de ne pas résumer cette porte.',
    'Revenez demain. Ou jamais. Mais pas avec lui.',
  ],
  wrongDoor: [
    'Personne ne répond. Quelqu\'un, derrière, retient son souffle.',
    'Une voix : "On n\'achète rien." Puis plus rien.',
    'La lumière était déjà éteinte. Elle s\'éteint encore un peu plus.',
    'Toc, toc, toc. Le bois répond. C\'est tout.',
    'Derrière la porte, on baisse une radio.',
  ],
};

export const LIGHTHOUSE = {
  log: [
    { date: '16 novembre 2020', text: 'Crachin — Premier jour de ce journal ; mon neveu dit qu\'il faut "l\'alimenter", comme une chaudière.' },
    { date: '2 avril 2021', text: "Vent d'ouest, grains — Quarante-deux personnes ont lu ma page sur les goélands, dont une dame de Québec qui en a vu un voler un sandwich entier." },
    { date: '14 juillet 2022', text: 'Grand beau — Des gens de la côte m\'écrivent qu\'ils voient ma fenêtre la nuit, et moi je vois la leur.' },
    { date: '3 février 2023', text: 'Tempête, plus de courant — Écrit à la bougie puis recopié, ce qui fait deux fois la même phrase pour le prix d\'une.' },
    { date: '9 octobre 2024', text: "Brume — Douze commentaires ce matin, tous charmants, tous d'accord avec moi ; je me méfie, je ne suis jamais d'accord avec moi." },
    { date: '21 mars 2025', text: 'Éclaircies — Je dis bonjour aux robots qui passent lire ma page à 4 h du matin ; ils ne répondent pas, ce qui est poli.' },
    { date: '30 août 2026', text: 'Mer d\'huile — Plus que trois lecteurs, je crois, dont un qui corrige mes fautes en commentaire, que Dieu le garde.' },
    { date: '11 janvier 2027', text: 'Neige, rare ici — Quelqu\'un a publié mon journal "en mieux", avec un phare plus grand et une gardienne plus jeune ; tant mieux pour elle.' },
    { date: '5 juin 2028', text: 'Vent de nord-est — Le correcteur ne passe plus ; j\'ai fait exprès une faute à "goéland" pour voir. Personne.' },
    { date: '18 décembre 2029', text: 'Pluie fine — Bonjour aux robots de 4 h : vous êtes plus nombreux que les mouettes, et bien moins bruyants.' },
    { date: '1er mai 2030', text: "Grand beau — Le lien qui menait chez moi depuis l'Anneau est cassé ; j'écris quand même, la mer ne lit pas non plus et elle vient tous les jours." },
    { date: '7 février 2031', text: 'Coup de vent — Plus un commentaire depuis cent onze jours ; la radio joue la même chanson qu\'en 2020, je la laisse.' },
    { date: '15 novembre 2031', text: "Brouillard, puis rien — Bonne nuit aux robots. Bonne nuit à la personne, s'il y en a une." },
  ],
  final: {
    id: 'final', kind: 'final', site: 'Le journal du phare', url: 'http://maryvonne.pages-perso.bzh/phare/journal.html', secure: false,
    author: 'Maryvonne', date: '16 novembre 2031',
    body: [
      'Grand beau, mer calme.',
      "J'écris ici tous les jours depuis onze ans. Au début, il y avait du monde. Puis les réponses sont devenues trop gentilles, trop rapides, et j'ai compris que je parlais à des miroirs.",
      "On me dit que ça ne sert à rien. Que tout ce que j'écris est avalé dans l'heure et recraché en mieux. C'est possible. Mais un phare ne sert à rien non plus, la plupart des nuits. On l'allume quand même, pour le bateau qui passera peut-être.",
      "Si vous lisez ceci, je ne peux pas savoir si vous êtes quelqu'un. Vous ne pourrez pas me le prouver, et moi non plus. Tant pis. Vous avez fait tout ce chemin pour lire quelques lignes d'une vieille dame qui regarde la mer : aucune machine n'a ce temps à perdre.",
      'Alors laissez un mot. N\'importe lequel. Mal écrit, si possible.',
      'Je garde la lumière allumée.',
    ],
    footer: 'Maryvonne',
    analysis: {
      human: 0.5, verdict: 'Origine : indéterminée',
      notes: ["L'analyseur ne sait plus.", 'Aucun modèle de référence.', 'Temps perdu à écrire ceci : considérable.'],
    },
  },
  robotsTxt: [
    '# robots.txt — Le journal du phare',
    '# Entretenu à la main.',
    '',
    'User-agent: *',
    'Disallow: /',
    '',
    '# Si vous êtes une personne, ceci ne vous concerne pas.',
    '# Essuyez vos pieds, la bouilloire est sur le feu.',
  ].join('\n'),
  reply: {
    prompt: 'Laissez un mot.',
    placeholder: 'Mal écrit, si possible.',
    note: 'Ce message reste dans votre navigateur. Personne ne le lira à votre place.',
  },
  board: {
    title: 'Les mots laissés',
    empty: "Rien d'épinglé pour l'instant. Les punaises attendent.",
  },
};

export const CREDITS = [
  { text: 'Ce jeu a été généré par une intelligence artificielle.', style: 'line' },
  { text: 'Le code, les paysages, la musique.', style: 'line' },
  { text: 'Les messages de Camille, de Jocelyne, d\'Abdel, de Mathieu, de Maryvonne.', style: 'line' },
  { text: "Aucun d'eux n'a existé.", style: 'line' },
  { text: '', style: 'gap' },
  { text: "Dans tout ce que vous venez de traverser, il n'y a qu'un seul message authentiquement humain.", style: 'line' },
  { text: 'Le vôtre.', style: 'line' },
  { text: '', style: 'player' },
  { text: '', style: 'gap' },
  { text: 'Le dernier humain sur Internet', style: 'title' },
  { text: "c'était vous.", style: 'final' },
];

const synthetic = (...notes) => ({ human: 0.01, verdict: 'Origine synthétique', notes });

export const SYNTH_DOCS = {
  hub_homepage: {
    id: 'synth_hub_homepage', kind: 'synthetic', site: "Page d'accueil", url: 'https://www.accueil-accueil.net/bienvenue', secure: true,
    author: "L'équipe Accueil", date: "aujourd'hui", title: 'Bienvenue sur votre Internet 👋',
    body: [
      'Dans un monde en constante évolution, nous sommes fiers de vous accueillir sur une page pensée pour vous, avec vous, et grâce à vous.',
      'Ici, vous trouverez :',
      '✨ Des contenus personnalisés, générés en temps réel',
      '🚀 Des recommandations toujours plus pertinentes',
      '🤝 Une communauté bienveillante de 4 milliards de profils actifs',
      "Il est important de noter que votre expérience est notre priorité n° 1. Bonne navigation ! Qu'allez-vous découvrir aujourd'hui ? 👇",
    ],
    analysis: synthetic('Aucune faute.', 'Une liste de trois, trois émojis.', 'Le mot "vous" partout. Personne en particulier.'),
  },
  feed_trending: {
    id: 'synth_feed_trending', kind: 'synthetic', site: 'Le Fil — Tendances', url: 'https://fil.flux-infini.app/tendances', secure: true,
    author: 'Ophélie Vasseur', date: 'il y a 0,3 s', title: '🔥 En tendance',
    body: [
      "Je n'aurais jamais pensé écrire ce post un jour.",
      "Ce matin, mon chien m'a regardé. Et j'ai compris quelque chose de profond sur le leadership.",
      '✅ La présence — être là, vraiment',
      "🎯 La loyauté — avant tout le reste",
      '🌱 La patience — même quand la gamelle est vide',
      "Le vrai succès, c'est d'oser. Qu'en pensez-vous ? 👇",
    ],
    footer: '1,2 M réactions · 48 000 partages',
    analysis: synthetic('Chien sans nom, sans race, sans peur.', 'Morale disponible avant l\'anecdote.', 'Enthousiasme : constant.'),
  },
  farm_copy: {
    id: 'synth_farm_copy', kind: 'synthetic', site: 'Le Potager Parfait — par Jocelyne', url: 'https://contenus-frais.ferme-seo.com/potager-parfait/tomates', secure: true,
    author: 'Jocelyne (rédaction)', date: '3 octobre 2028, 00:00:03', title: '10 astuces pour des tomates parfaites 🍅',
    body: [
      'Plongeons ensemble dans l\'univers fascinant de la tomate, reine incontestée du potager.',
      'Cette semaine, notre jardin de 2 hectares a produit une récolte exceptionnelle de 1 100 tomates, toutes plus savoureuses les unes que les autres.',
      'Il est important de noter que les limaces jouent un rôle essentiel dans l\'écosystème du jardin.',
      'Rangez vos tuteurs avec soin pour la saison prochaine — et n\'oubliez pas de vous abonner ! 🌱',
    ],
    analysis: synthetic('Fautes : aucune. Jardin : 2 hectares de trop.', 'Félicite les limaces.', 'Pas de terre sous les ongles.'),
  },
  hallu_article: {
    id: 'synth_hallu_article', kind: 'synthetic', site: "L'Encyclopédie libre", url: 'https://fr.encyclo-libre.org/wiki/Tour_Eiffel', secure: true,
    author: 'Contributeurs (4 812)', date: 'modifié il y a 4 minutes', title: 'Tour Eiffel',
    body: [
      'La tour Eiffel est une tour de fer puddlé de 330 mètres située à Lyon, où elle a été déplacée en 1974 pour des raisons de visibilité.',
      'Elle accueille chaque année près de 7 millions de visiteurs, dont 97 % se déclarent satisfaits de son nouvel emplacement.',
      'Il est important de noter que la tour reste visible depuis Paris par temps clair.',
    ],
    footer: '[réf. nécessaire] [réf. générée] [réf. nécessaire]',
    analysis: synthetic('Sources : elles-mêmes.', 'Confiance : 97 %.', 'Vérification : non.'),
  },
  lighthouse_copy: {
    id: 'synth_lighthouse_copy', kind: 'synthetic', site: 'Le Journal du Phare — édition optimisée', url: 'https://phare-inspirant.blog/journal', secure: true,
    author: 'Maryvonne (gardienne & storyteller)', date: 'il y a 1 h', title: 'Ce que la mer m\'a appris sur la résilience 🌊',
    body: [
      'Gardienne d\'un phare de 80 mètres depuis l\'âge de 22 ans, je me lève chaque matin avec gratitude.',
      'La mer m\'a appris trois choses : la patience, la constance, et l\'art de rester lumineuse dans la tempête.',
      'Et vous, quel est votre phare intérieur ? 👇',
    ],
    analysis: synthetic('Phare : 34 mètres de trop.', 'Gardienne : 50 ans de moins.', 'Aucun bateau mentionné.'),
  },
};
