const human = (score, ...notes) => ({ human: score, verdict: 'Origine humaine', notes });
const probable = (score, ...notes) => ({ human: score, verdict: 'Origine humaine probable', notes });

export const TRACES = {
  hub_welcome: {
    id: 'hub_welcome', zone: 'hub', place: "à quelques pas du point d'apparition, au pied du panneau de bienvenue",
    kind: 'human', site: "Page d'accueil — commentaires (4 812 007)", url: 'https://www.accueil-accueil.net/bienvenue#commentaires', secure: true,
    author: 'fred_pas_le_bot', date: '2 mars 2027',
    body: [
      'premier ! ah non. quatre millions huit cent mille et quelques. bon.',
      "je voulais juste dire que vous avez changé le bleu de la page d'accueil et que l'ancien était mieux. personne m'a demandé mon avis, je le donne quand même, c'est gratuit (pour l'instant).",
      "sinon il fait beau à Montélimar et ma fille a perdu sa première dent dans une crêpe. bonne journée à tous, même aux robots, vous y êtes pour rien.",
    ],
    analysis: probable(0.93,
      "Aucun appel à l'action. Commentaire sans but.",
      'Détail invérifiable et inutile : une dent, une crêpe.',
      'Politesse adressée aux robots. Non sollicitée.'),
  },

  feed_reply: {
    id: 'feed_reply', zone: 'feed', place: 'sur une corniche de la paroi du Fil, au niveau gravé "2029"',
    kind: 'human', site: 'Le Fil — réponses', url: 'https://fil.flux-infini.app/reussir.chaque.matin/status/8812007/reponses', secure: true,
    author: 'nadege.velo', date: '6 mai 2029',
    title: 'En réponse à @reussir.chaque.matin : "Les 10 habitudes des gens qui réussissent"',
    body: [
      'moi je me lève à 9h40 et je réussis pas grand chose',
      'mais ce matin j\'ai réparé le vélo de la voisine du 3e avec une chambre à air que je gardais "au cas où" depuis 2011. elle m\'a donné quatre clémentines dont une pas bonne.',
      "je sais pas si c'est une habitude. c'est arrivé une fois.",
    ],
    analysis: human(0.96,
      'Aucune des 10 habitudes respectée.',
      'Une clémentine sur quatre déclarée "pas bonne". Aucun intérêt commercial.',
      'Ponctuation approximative, intention limpide.'),
  },

  feed_draft: {
    id: 'feed_draft', zone: 'feed', place: 'au niveau gravé "2025", dans une niche de la paroi, derrière un écran éteint',
    kind: 'human', site: 'Le Fil — brouillons (non publié)', url: 'https://fil.flux-infini.app/brouillons/3', secure: true,
    author: 'thomas.b', date: '17 avril 2025', title: 'Brouillon',
    body: [
      'Mon père est mort mardi. Il détestait ce site. Il disait "ton fil" en faisant le geste des ciseaux avec deux doigts.',
      'Il réparait les postes de radio de tout le canton. Il en a laissé onze dans le garage, avec une étiquette sur chacun : le nom du propriétaire, la panne, et "pas pressé" sur la moitié.',
      'L\'appli me propose de "rendre ce post plus engageant". J\'ai dit non trois fois.',
      "Je le laisse en brouillon. Il aurait préféré que je ne le publie pas, et j'aime bien lui faire plaisir encore un peu.",
    ],
    footer: 'Dernière modification : 17 avril 2025, 02:14 — Publier ?',
    analysis: human(0.98,
      'Jamais publié. Aucune audience visée.',
      'Refuse trois fois une amélioration automatique.',
      'Onze radios, dont la moitié "pas pressé". Détail invérifiable et inutile.'),
  },

  feed_bio: {
    id: 'feed_bio', zone: 'feed', place: 'tout en bas du puits, sur la paroi gravée "2024", à hauteur d\'yeux',
    kind: 'human', site: 'Le Fil — profil', url: 'https://fil.flux-infini.app/cailloux_departements', secure: true,
    author: '@cailloux_departements', date: 'mis à jour le 8 février 2024', title: 'Bio',
    body: [
      "Prof de SVT à la retraite. Je collectionne les cailloux qui ont la forme d'un département. J'ai le Cantal, l'Aube et presque la Manche (il manque le bout).",
      "Je ne suis pas un robot, mais je sais que c'est exactement ce que dirait un robot, donc je ne sais plus quoi mettre.",
      '41 abonnés, dont ma sœur deux fois parce qu\'elle a perdu son mot de passe.',
    ],
    analysis: human(0.95,
      'Presque la Manche.',
      'Doute sincère sur sa propre nature. Rare chez nous.',
      "Nombre d'abonnés avoué sans honte."),
  },

  farm_recipe: {
    id: 'farm_recipe', zone: 'farm', place: 'dans la serre de Jocelyne, coincée sous un pot de confiture vide',
    kind: 'human', site: 'Le cahier de cuisine de Bernadette', url: 'http://cahier-de-bernadette.pages-perso.fr/clafoutis.html', secure: false,
    author: 'Bernadette', date: '14 juin 2026', title: 'Clafoutis (le vrai)',
    body: [
      '500 g de cerises AVEC les noyaux. Ceux qui dénoyautent ont peur de la vie, disait ma tante Odile, qui n\'était pas ma tante.',
      '3 œufs, 80 g de sucre, 60 g de farine, un demi-litre de lait entier (pas l\'autre), une pincée de sel, du beurre pour le plat. Four à 180, quarante minutes, ou jusqu\'à ce que le chien vienne s\'asseoir devant la porte du four.',
      'J\'ai retrouvé ma recette sur un grand site, mot pour mot, sauf "dénoyautez soigneusement les cerises". Odile doit se retourner dans sa tombe. Elle va finir par creuser.',
    ],
    analysis: human(0.97,
      'Unité de mesure non standard : le chien.',
      'Contredit sciemment 4 000 recettes concurrentes.',
      'Tante Odile : lien de parenté indéterminé.'),
  },

  farm_review: {
    id: 'farm_review', zone: 'farm', place: "sur le grand panneau d'avis à l'entrée de la ferme, tout en bas, sous les cinq étoiles",
    kind: 'human', site: 'Avis clients — Tuyau d\'arrosage extensible 30 m', url: 'https://www.jardi-shop-express.com/tuyau-30m/avis?note=1', secure: true,
    author: 'Gérard M.', date: '2 août 2025', title: '★☆☆☆☆ Il a explosé au baptême',
    body: [
      'Votre tuyau fait 30 mètres quand il est plein d\'eau et 4 mètres quand il est content. Il a explosé dans le dos de mon beau-frère pendant les photos du baptême de la petite.',
      "Toute la famille est trempée sur l'album. Ma belle-mère aussi, en tailleur. Elle ne me parle plus, ce qui n'est pas complètement un défaut du produit.",
      'Je mets une étoile parce que zéro n\'est pas possible. Et votre réponse automatique, "Nous sommes ravis que le produit vous plaise !", m\'a fait plus de mal que le tuyau.',
    ],
    footer: '3 personnes ont trouvé cet avis utile. 4 812 ont préféré l\'avis suivant (5 étoiles).',
    analysis: human(0.96,
      'Colère réelle, syntaxe intacte.',
      'Une étoile, et une phrase de reconnaissance cachée dedans.',
      "Belle-mère en tailleur : aucune utilité pour l'algorithme."),
  },

  farm_scarecrow: {
    id: 'farm_scarecrow', zone: 'farm', place: "accrochée à l'épouvantail, au milieu du champ des moissonneuses",
    kind: 'note', site: 'Pancarte (carton, feutre vert)', url: 'http://potager-de-jocelyne.jardin-perso.fr/photos/epouvantail.jpg', secure: false,
    author: 'Inès, 8 ans et demi', date: 'été 2028', title: 'MONSIEUR PAILLE',
    body: [
      "Il s'apelle Monsieur Paille il garde les fraises.",
      'Si vous êtes un oiseau partez. Si vous êtes un robot partez aussi. Si vous êtes une moissoneuse vous avez rien a faire là c\'est un jardin.',
      'Si vous êtes Léo rendez moi mon rateau vert.',
      'PS : il a pas de cerveau mais il est gentil',
    ],
    analysis: human(0.99,
      'Trois fautes. Aucune corrigée. Bien.',
      "Menace graduée selon l'espèce.",
      'Râteau vert : affaire non classée.'),
  },

  hallu_edit: {
    id: 'hallu_edit', zone: 'hallu', place: 'sur une pierre réelle mais invisible, au bord du gouffre (le sondage la révèle)',
    kind: 'human', site: "L'Encyclopédie libre — Discussion : Hérisson d'Europe", url: 'https://fr.encyclo-libre.org/discussion/Herisson_d_Europe', secure: true,
    author: 'Lise_B', date: '11 octobre 2028', title: 'Section "Migrations"',
    body: [
      'J\'ai retiré la phrase "le hérisson migre vers l\'Islande chaque automne". Elle a été remise quatre minutes plus tard, avec une source qui cite une page qui cite la phrase.',
      "Je n'ai pas de source. J'ai un hérisson. Il vit sous mon tas de bois depuis 2019, je l'appelle Pépin, et il n'est jamais allé plus loin que le compost du voisin.",
      "Je sais que ce n'est pas une référence acceptable. Je retire quand même. Je retirerai demain.",
    ],
    analysis: human(0.95,
      'Source citée : un hérisson nommé Pépin.',
      'Promet de recommencer demain. Obstination caractéristique.',
      'Aucun ton encyclopédique. Fiabilité : supérieure.'),
  },

  hallu_teacher: {
    id: 'hallu_teacher', zone: 'hallu', place: 'sur une pierre suspendue au-dessus du gouffre, à mi-chemin du pilier',
    kind: 'note', site: 'Copie de Théo L., 3e B — appréciation', url: 'https://ent.college-des-tilleuls.edu/copies/3B/theo-l', secure: true,
    author: 'Mme Ferrand', date: '5 mars 2030', title: 'Rédaction : "Un souvenir d\'enfance"',
    body: [
      'Théo, ta copie est parfaite. Pas une faute, trois parties, une ouverture sur le monde. C\'est bien le problème.',
      'Tu écris "quant même" depuis la sixième et je m\'y étais attachée. Ton souvenir se passe dans un phare où tu n\'es jamais allé, avec un grand-père qui "transmet des valeurs". Ton grand-père, je le connais : il vend des huîtres et il triche à la belote.',
      'Refais-la à la main, avec tes fautes et avec lui. Je te mettrai la note que tu mérites, pas celle que le texte mérite.',
    ],
    footer: 'Note : —',
    analysis: human(0.97,
      'Encre rouge, pression plus forte en fin de phrase.',
      "Préfère les fautes de l'élève à la perfection du texte.",
      'Grand-père tricheur : vérifiable par toute la classe.'),
  },

  hallu_map: {
    id: 'hallu_map', zone: 'hallu', place: 'au pied du pilier central, coincé sous une pierre',
    kind: 'note', site: "Plan d'accès (photo d'une feuille quadrillée)", url: 'https://photos.partage-famille.net/kerbrat/fete14.jpg', secure: true,
    author: 'Les Kerbrat', date: 'juillet 2027', title: 'Pour venir à la fête du 14',
    body: [
      'Après la boulangerie, à gauche. Enfin à droite si vous venez de la gare. Si vous voyez le calvaire, vous êtes allés trop loin : faites demi-tour devant chez Dédé, il a l\'habitude.',
      "Le GPS va vous faire passer par le pont sur la rivière. Il n'y a plus de pont depuis 1987. Il y a un âne. Ne suivez pas le GPS, suivez l'âne, il sait.",
      'La sonnette marche pas, criez. Apportez des chaises si vous en avez, et pas de salade de riz, on en a déjà quatre.',
    ],
    analysis: human(0.96,
      'Itinéraire valable uniquement depuis la gare.',
      'Signale un pont qui n\'existe pas. Plus fiable que nous sur ce point.',
      'Quatre salades de riz : situation critique, véridique.'),
  },

  oldweb_guestbook: {
    id: 'oldweb_guestbook', zone: 'oldweb', place: 'dans une alcôve du canyon, sous une bannière "NEW !" qui clignote',
    kind: 'oldweb', site: "Les aquariums de Pascal — livre d'or", url: 'http://membres.lanterne-perso.fr/~pascal.aqua/livredor.html', secure: false,
    author: 'Mélanie (Rouen)', date: '23/01/2003', title: "Message n° 87 du livre d'or",
    body: [
      'Bonjour Pascal,',
      'je voulais te dire que mon poisson rouge Gaston est mort la semaine dernière. Mais grâce à ta page sur l\'eau (le truc des nitrites) il a vécu 3 ans au lieu de 3 semaines comme celui de ma cousine.',
      "Mon père dit que c'est pas grave c'est qu'un poisson. Moi je trouve que 3 ans c'est beaucoup pour un poisson et pour un site aussi.",
      'Continue ton site stp !!! Mélanie, 11 ans, Rouen',
    ],
    analysis: human(0.97,
      'Gratitude adressée à un webmaster. Espèce disparue.',
      'Poisson nommé, daté, regretté.',
      "Signe avec son âge et sa ville : imprudence d'époque."),
  },

  oldweb_fanpage: {
    id: 'oldweb_fanpage', zone: 'oldweb', place: "au sommet d'une mesa du canyon, au pied d'une antenne rouillée",
    kind: 'oldweb', site: "Les Gardiens de l'Archipel — LE site des fans (depuis 2001)", url: 'http://membres.lanterne-perso.fr/~sandrine.archipel/fin.htm', secure: false,
    author: 'Sandrine_Archipel', date: '28 juin 2006', title: "C'est la fin (snif)",
    body: [
      "Voilà c'est officiel, la chaîne arrête la série après la saison 6. Le site s'arrête aussi. J'ai pas le cœur à résumer des épisodes qui existent pas.",
      '412 résumés, 1 900 captures (merci Fabrice pour ton magnétoscope qui marchait que le mardi), 3 fanfictions dont une de moi que je regrette un peu.',
      "Sur le forum on était 60. On s'est jamais vus. Je reconnaîtrais vos fautes d'orthographe entre mille. Bisous à tous, et à Fabrice, même s'il pensait que Kaël était le traître (il l'était PAS).",
    ],
    footer: 'Dernière mise à jour : 28/06/2006 — Vous êtes le visiteur n° 48 207',
    analysis: human(0.98,
      '412 résumés, aucune rémunération.',
      'Querelle de 2003 toujours ouverte.',
      'Affection exprimée par la reconnaissance des fautes.'),
  },

  oldweb_email: {
    id: 'oldweb_email', zone: 'oldweb', place: 'dans une boîte aux lettres rouillée, au bord du canyon',
    kind: 'oldweb', site: 'Messagerie — Boîte de réception (1 non lu)', url: 'http://webmail.lanterne-perso.fr/lire.php?msg=1187', secure: false,
    author: 'Papi Roger', date: '15 novembre 2001', title: 'TR: TR: Fw: TR: NE CASSEZ PAS LA CHAINE !!! (lisez jusqu\'au bout)',
    body: [
      "Salut ma puce, je ne crois pas du tout à ces histoires mais je te l'envoie quand même, c'est l'occasion de te dire bonjour avec l'ordinateur.",
      "Ici il pleut. Le noyer a perdu toutes ses feuilles en une nuit, ta grand-mère dit que c'est un signe, moi je dis que c'est novembre.",
      "Elle te fait dire de rappeler dimanche. Ne l'envoie pas à 10 personnes. Rappelle une personne, ça suffira.",
      '----- Message transféré ----- Cette chaîne a été lancée en 1994 par un moine. Si vous la transmettez à 10 personnes dans l\'heure, vous aurez de la chance pendant 7 ans...',
    ],
    analysis: probable(0.88,
      'Texte automatique de 1994 en pièce jointe. Le reste : authentique.',
      'Météo locale non demandée.',
      'Ne croit pas à la chaîne. La transmet quand même. Par tendresse.'),
  },

  forest_invite: {
    id: 'forest_invite', zone: 'forest', place: 'punaisée à un tronc, au bord de la clairière du feu de camp',
    kind: 'note', site: 'Feuille punaisée (crayon à papier)', url: 'about:blank', secure: true,
    author: 'Sam', date: 'novembre 2030', title: 'Jeudi chez Sam',
    body: [
      'Jeudi, chez moi, 20 h. Apportez un truc que vous avez fait vous-mêmes. Pas "fait avec". Fait.',
      "Pas de téléphone sur la table, il y a un panier à l'entrée. Le panier est moche, c'est Loïc qui l'a tressé, ne lui dites rien.",
      "Le code de la porte, c'est celui d'habitude moins un. Si vous ne connaissez pas celui d'habitude, c'est que ce mot n'est pas pour vous. Mais bonne soirée quand même.",
    ],
    analysis: human(0.94,
      'Invitation non indexable : code non fourni.',
      'Panier moche. Assumé.',
      'Bienveillance envers le lecteur exclu.'),
  },

  forest_lullaby: {
    id: 'forest_lullaby', zone: 'forest', place: "sur le rebord de la fenêtre d'une cabane éteinte, près du ruisseau",
    kind: 'human', site: 'Notes du téléphone', url: 'about:blank', secure: true,
    author: 'papa (Hugo)', date: '18 février 2029, 3 h 12', title: 'chanson bébé NE PAS EFFACER',
    body: [
      "il est 3h12 tu dors enfin. je tape ça pour pas oublier la chanson parce que l'appli de berceuses a planté, que j'ai improvisé et que ça a MARCHÉ",
      "dors petit haricot / la lune a mis son manteau / le chat dort dans le seau / et papa dort debout (ça rime pas, c'est pas grave, toi t'as pas remarqué)",
      'refrain : on fait chut, on fait chut, le frigo fait brrr',
      'demain je saurai plus pourquoi le frigo. je laisse quand même.',
    ],
    analysis: human(0.99,
      'Fatigue.',
      'Rime abandonnée en cours de route. Revendiquée.',
      'Le frigo : élément musical injustifié, conservé.'),
  },

  forest_apology: {
    id: 'forest_apology', zone: 'forest', place: 'posé sur une souche, au bord du ruisseau, entre deux cabanes',
    kind: 'human', site: 'Message privé (non lu)', url: 'about:blank', secure: true,
    author: 'Mehdi', date: '21 septembre 2030', title: 'Pardon pour le store',
    body: [
      "Karim, c'est moi qui ai cassé ton store en 2009, avec le ballon en mousse qui n'était pas en mousse.",
      "J'ai laissé accuser Romain. Je le dis maintenant parce que tu ne lis plus tes messages, et que Romain est devenu dentiste : il s'en est remis.",
      'Je te dois un store et vingt et un ans d\'explications. Je commence par le store. Envoie-moi les mesures.',
    ],
    analysis: human(0.97,
      'Délai de prescription dépassé de vingt et un ans.',
      'Ballon "en mousse" : mensonge de 2009, rectifié.',
      'Demande les mesures. Intention de réparer : concrète.'),
  },

  wilds_summit: {
    id: 'wilds_summit', zone: 'wilds', place: 'au sommet des Monts du Cache, dans une boîte en fer sous le cairn',
    kind: 'note', site: 'Carnet de sommet (boîte en fer)', url: 'about:blank', secure: true,
    author: 'Anne-So et Bruno', date: '12 août 2026', title: 'Monts du Cache, 185 m',
    body: [
      'Montés à deux, redescendus à deux, mais pas d\'accord.',
      'Bruno dit que la vue est "générée". Je lui ai lancé une pomme dans le dos pour lui prouver que le monde existait. Il a dit que la pomme aussi. On s\'est disputés quarante minutes au sommet et on n\'a pas regardé la vue.',
      "On reviendra pour la regarder. La pomme a roulé en bas : si quelqu'un la trouve, elle est à nous.",
    ],
    analysis: human(0.96,
      'Protocole expérimental : une pomme.',
      'Dispute notée, vue négligée. Ordre des priorités humain.',
      'Revendique la propriété d\'une pomme perdue.'),
  },

  wilds_pier: {
    id: 'wilds_pier', zone: 'wilds', place: 'au bout du ponton, face au phare',
    kind: 'note', site: 'Mot coincé dans une bouée', url: 'about:blank', secure: true,
    author: 'Yannick, pêcheur', date: 'septembre 2031',
    body: [
      'Le grand feu du phare est éteint depuis 1994. La mairie dit qu\'il n\'y a plus personne là-bas.',
      'Alors qui allume la petite fenêtre, en bas, tous les soirs vers 21 h ? Elle reste allumée jusqu\'au matin, j\'ai vérifié, je pêche de nuit. Le dimanche, il y a de la musique en plus.',
      "Je ne vais pas aller voir. Je regarde d'ici, ça me suffit. Si c'est vous : bonsoir.",
    ],
    analysis: human(0.95,
      'Observation répétée pendant des mois. Patience non optimisée.',
      'La musique du dimanche : inutile, donc précieuse.',
      "S'adresse à quelqu'un qui ne le lira peut-être jamais."),
  },
};
