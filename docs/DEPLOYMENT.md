# Déployer Zapstick sur Coolify

Le `Dockerfile` construit l’application avec Next.js en mode standalone et Node.js 22. Le build est isolé dans `.next-coolify` ; il ne dépend ni de Cloudflare, ni de l’authentification Sites, ni d’une base de données serveur. Les fichiers, packs et préférences restent dans le navigateur de chaque visiteur.

## Configuration Coolify

1. Créer une application à partir de `https://github.com/sthiefaine/zapstick`, branche `main`.
2. Choisir le build pack **Dockerfile**.
3. Base Directory : `/`. Dockerfile Location : `/Dockerfile` (ou `Dockerfile`, selon l’écran Coolify).
4. Port exposé : **3000**. Le conteneur écoute sur `0.0.0.0`.
5. Associer le domaine HTTPS public souhaité. Le proxy Coolify doit terminer TLS.
6. Ajouter les variables ci-dessous puis déployer.

L’image exécute le serveur en utilisateur non privilégié. Son contrôle de santé appelle `/api/health` avec Node.js ; aucun paquet curl supplémentaire n’est nécessaire. Aucun volume n’est requis pour la collection. Ne pas utiliser un volume partagé comme mécanisme de synchronisation des données du navigateur.

## Variables

Les valeurs commençant par `NEXT_PUBLIC_` sont publiques et incorporées au JavaScript pendant le build : les déclarer dans Coolify comme **Build Variables**, puis reconstruire après modification. Ne jamais y placer de secret.

- `NEXT_PUBLIC_SITE_URL` : origine HTTPS publique, par exemple `https://stickers.exemple.fr`, sans chemin. Sert aux URL canoniques, alternances de langues, partage et sitemap.
- `SITE_URL` : même origine, comme variable d’exécution serveur. Peut surcharger la base des métadonnées à l’exécution. Conserver les deux valeurs identiques.
- `NEXT_PUBLIC_SITE_INDEXABLE` et `SITE_INDEXABLE` : `true` uniquement pour une instance publique prête à être indexée. Défaut : `false`. L’indexation reste désactivée pour une origine HTTP ou locale.
- `NEXT_PUBLIC_SITE_OPERATOR_NAME` : nom de l’éditeur. Défaut autorisé : `Clairdev`.
- `NEXT_PUBLIC_SITE_OPERATOR_COUNTRY` : pays de l’éditeur. Défaut autorisé : `France`.
- `NEXT_PUBLIC_PRIVACY_EMAIL` : contact de confidentialité. Défaut autorisé : `simonnou.thiefaine@gmail.com`.
- `NEXT_PUBLIC_SITE_HOSTING` : identité et coordonnées publiques de l’hébergeur de cette instance ; à renseigner pour les mentions légales.
- `NEXT_PUBLIC_SITE_OPERATOR_ADDRESS`, `NEXT_PUBLIC_SITE_OPERATOR_LEGAL_STATUS`, `NEXT_PUBLIC_SITE_OPERATOR_REGISTRATION`, `NEXT_PUBLIC_SITE_PUBLICATION_DIRECTOR` : champs publics facultatifs de l’éditeur. À renseigner selon son statut et les obligations applicables ; ils ne sont pas affichés s’ils sont vides. Aucun statut juridique n’est déduit automatiquement.

Pour une préproduction ou un site réservé à des utilisateurs, garder `SITE_INDEXABLE=false` et `NEXT_PUBLIC_SITE_INDEXABLE=false`. `robots.txt` permet aux robots de lire la directive `noindex, nofollow` des pages et de leurs en-têtes ; le sitemap est vide. Un blocage `Disallow: /` empêcherait cette lecture et ne garantit pas le retrait d’une URL déjà connue. Ces directives ne sont pas un contrôle d’accès : configurer une authentification dans le proxy si l’instance doit être privée.

Les accès aux sources X/FxTwitter, Giphy et Tenor partent du navigateur. Leur disponibilité et leurs restrictions CORS s’appliquent. Le déploiement n’ajoute aucun proxy de téléchargement ni journal de collection.

## Vérification après déploiement

- `/api/health` doit répondre `200` avec `{"status":"ok","service":"zapstick"}`.
- Les routes `/fr`, `/en`, `/pt-BR`, `/es`, `/de`, `/zh-CN`, `/ja` et `/ru` doivent être accessibles.
- Vérifier `html[lang]`, le titre, la description, la canonique et les liens `hreflang` d’une route localisée.
- Vérifier `/robots.txt`, `/sitemap.xml` et `/social-card.png` avec le domaine configuré.
- Vérifier les pages `/<langue>/privacy` et `/<langue>/legal`, les coordonnées d’éditeur et l’hébergeur réel.
- Tester les thèmes, l’import, l’export de sauvegarde et l’effacement local sur un navigateur de test.

L’indexation et les aperçus de partage nécessitent un domaine public accessible aux robots. La présence des métadonnées ne garantit pas une indexation ou un classement. Soumettre le sitemap à la Search Console du domaine est une opération distincte.

## Docker local

```sh
docker build -t zapstick .
docker run --rm -p 3000:3000 zapstick
```

Ou, avec les variables d’environnement listées ci-dessus dans le shell :

```sh
docker compose up --build -d
```

Le fichier Compose accepte `SITE_URL`, `SITE_INDEXABLE`, `SITE_OPERATOR_NAME`, `SITE_OPERATOR_COUNTRY`, `PRIVACY_EMAIL`, `SITE_HOSTING`, `SITE_OPERATOR_ADDRESS`, `SITE_OPERATOR_LEGAL_STATUS`, `SITE_OPERATOR_REGISTRATION`, `SITE_PUBLICATION_DIRECTOR` et `ZAPSTICK_PORT` pour renseigner les arguments de build correspondants. Il n’intègre aucun fichier `.env` dans l’image.

## Construire et lancer sans Docker

```sh
npm ci
npm run build
npm start
```

Le build exécute `scripts/prepare-standalone.mjs` pour inclure automatiquement `public` et les fichiers statiques dans `.next-coolify/standalone`. `npm start` lance ce serveur complet. Les alias `build:coolify` et `start:coolify` restent disponibles. Les anciens scripts `dev:sites`, `build:sites` et `start:sites` sont conservés séparément et ne font pas partie du déploiement Coolify.

Sources : [Dockerfile dans Coolify](https://coolify.io/docs/applications/builds/dockerfile), [contrôles de santé Coolify](https://coolify.io/docs/applications/configuration/health-checks), [sortie standalone Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
