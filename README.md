# Le dernier humain sur Internet

Jeu d'exploration 3D en monde ouvert, jouable dans le navigateur.

2031. Internet va très bien : il n'a jamais été aussi actif, aussi poli, aussi bien référencé. 99,99 % de ce qui s'y publie est généré, et les humains n'y écrivent presque plus. Quelque part, il reste un dernier message écrit par quelqu'un. À vous de le trouver.

Comptez 35 à 50 minutes pour une première partie.

**Jouer en ligne : <https://rozieres.github.io/dernier-humain/>**

## Le jeu en bref

**L'histoire.** En 2031, 99,99 % du Web est généré et les humains n'y écrivent presque plus. Vous cherchez le dernier message humain encore en ligne, accompagné de Tiret, un petit assistant IA en forme de tiret cadratin, serviable jusqu'à l'absurde. L'île est une métaphore du Web : cinq vieux sites humains, reliés autrefois par un anneau de sites, ont chacun une balise éteinte. En rallumer une affiche le dernier message de quelqu'un qui a arrêté de publier, et fait avancer l'heure du jour, de l'après-midi à la nuit.

**Se repérer.** On part d'une colline centrale, la "Page d'accueil". Six arches y portent des liens hypertextes qui servent de tyroliennes vers les zones : bleus au départ, violets une fois visités, et un rouge marqué "404" vers le phare. À l'écran : l'objectif en haut à gauche, un cardiogramme "signal humain" qui s'affole près de ce qui est humain, un anneau de cinq segments pour les balises. Tab ouvre le journal avec la carte, et Tiret donne des indices si on piétine.

**Le gameplay.** Marcher, sauter, planer (Espace maintenu), sonder avec F (cyan pour le synthétique, ambre pour l'humain, violet pour l'halluciné), attraper et lancer des objets à la souris, lire avec E. Pas de combat ni de mort : tomber ou se noyer ramène au dernier sol sûr.

Les cinq zones se font dans l'ordre que vous voulez. La partie se sauvegarde toute seule dans le navigateur.

## Lancer le jeu

Il faut Node.js 20.19 ou plus récent dans la série 20, ou 22.12 et au-delà.

```bash
npm install
npm start
```

`npm start` lance le serveur local et ouvre le jeu dans le navigateur. Si rien ne s'ouvre, allez sur l'adresse affichée dans le terminal (par défaut `http://127.0.0.1:5173`).

Le jeu demande un navigateur récent avec WebGL2 (Chrome, Edge ou Firefox) et tourne mieux avec une carte graphique dédiée. La qualité se règle dans le menu Réglages ; elle s'ajuste aussi toute seule si la fréquence d'images chute. Un casque est conseillé.

## Contrôles

Les touches sont lues par position sur le clavier : sur un clavier AZERTY, le déplacement se fait avec Z Q S D sans rien configurer.

| Action | Touche |
|---|---|
| Se déplacer | Z Q S D (W A S D en QWERTY) ou les flèches |
| Courir | Maj gauche |
| Sauter, planer | Espace (maintenir en l'air pour planer) |
| Regarder | Souris |
| Interagir, lire | E |
| Sonder les environs | F |
| Saisir, lâcher, cliquer | Clic gauche |
| Lancer l'objet tenu | Clic droit |
| Journal (objectifs, carte, traces) | Tab |
| Pause, réglages | Échap |

## Vie privée

Le jeu n'envoie rien nulle part : aucune requête réseau pendant la partie, aucun service externe, aucun traceur. La sauvegarde, les réglages et ce que vous écrivez restent dans le stockage local de votre navigateur (clés `dhsi.*`).

## Commandes

| Commande | Effet |
|---|---|
| `npm start` | Serveur de développement, ouvre le navigateur |
| `npm run dev` | Serveur de développement seul |
| `npm run build` | Version de production dans `dist/` |
| `npm run preview` | Sert `dist/` en local pour vérification |
| `npm test` | Test de bout en bout : joue la partie de l'écran-titre au générique |

## Publier

`npm run build` produit un dossier `dist/` entièrement statique (environ 8 Mo), avec des chemins relatifs : il se dépose tel quel sur n'importe quel hébergement de fichiers statiques, à la racine ou dans un sous-dossier. Il n'y a ni serveur applicatif ni base de données.

La version en ligne est publiée sur GitHub Pages par le workflow `.github/workflows/pages.yml`, à chaque push sur `main`.

## Tests

Les tests pilotent un Chromium sans interface grâce à Playwright. À installer une fois :

```bash
npx playwright install chromium
```

Puis :

```bash
npm test                                  # partie complète, serveur de développement
E2E_TARGET=preview node tests/e2e.mjs     # même scénario sur la version de production
node tests/core.check.mjs                 # île, physique du terrain
node tests/texts.check.mjs                # textes
```

Les fichiers `tests/zone.*.check.mjs`, `tests/player.check.mjs` et `tests/story.check.mjs` vérifient chaque zone et chaque système en jouant avec des entrées clavier et souris simulées. Chacun attend un serveur de développement sur le port indiqué en tête de fichier.

## Sous le capot

- [three.js](https://threejs.org/) (WebGL2) pour le rendu, [Rapier](https://rapier.rs/) pour la physique, [Vite](https://vite.dev/) pour le développement et la construction. JavaScript sans framework.
- Tout est procédural : le terrain, la végétation, l'architecture, les textures, les shaders. Le dépôt ne contient aucune image, aucun modèle 3D, aucun fichier audio.
- La musique et les bruitages sont synthétisés en direct avec l'API WebAudio.
- Polices installées par npm via Fontsource : Inter, Instrument Serif, IBM Plex Mono, Caveat, VT323.

```
src/
  boot.js          démarrage, registre des systèmes, boucle de jeu
  core/            entrées, physique, matériaux, texte, état, qualité
  world/           île, terrain, végétation, mer, ciel, liens
  entities/        joueur, curseur, scanner, compagnon, traces, balises, objets, bots
  zones/           les sept lieux du jeu
  story/           titre, tutoriel, objectifs, progression, sauvegarde
  fx/              post-traitement, particules
  audio/           musique générative, bruitages
  ui/              interface
  data/            tous les textes
tests/             tests scriptés
tools/             capture d'écran et pilotage du navigateur
dev/               pages de test par système (hors production)
```

Paramètres d'URL utiles en développement : `?quality=low|medium|high|ultra`, `?mute=1`, `?debug=1`, `?skipMenu=1`, `?skipIntro=1`, `?nosave=1`, `?spawn=<zone>`, `?stage=0..6`.

## Crédits

Ce jeu a été généré par une intelligence artificielle : le code, les paysages, la musique et les textes.

Bibliothèques : three.js (MIT), Rapier (Apache-2.0), Vite (MIT), Playwright (Apache-2.0). Polices sous licence SIL Open Font License.

## Licence

MIT, voir le fichier `LICENSE`.
