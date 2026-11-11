# Déployer Zapstick sur Coolify

Le `Dockerfile` construit l’application avec Next.js en mode standalone et Node.js 22. Un garde HTTP écoute sur le port public et démarre Next sur un port aléatoire privé, lié à `127.0.0.1`. Le build est isolé dans `.next-coolify` ; il ne dépend ni de Cloudflare, ni de l’authentification Sites, ni d’une base de données serveur. Les fichiers, packs et préférences restent dans le navigateur de chaque visiteur.

## Configuration Coolify

1. Créer une application à partir de `https://github.com/sthiefaine/zapstick`, branche `main`.
2. Choisir le build pack **Dockerfile**.
3. Base Directory : `/`. Dockerfile Location : `/Dockerfile` (ou `Dockerfile`, selon l’écran Coolify).
4. Port exposé : **3000**. Le garde écoute sur `0.0.0.0` ; le port interne de Next ne doit jamais être publié.
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

Le build exécute `scripts/prepare-standalone.mjs` pour inclure automatiquement `public`, les fichiers statiques et le garde HTTP dans `.next-coolify/standalone`. `npm start` et `start:coolify` lancent `runtime-guard.mjs`, qui supervise le serveur Next privé. Lancer directement `server.js` contournerait cette protection. Les anciens scripts `dev:sites`, `build:sites` et `start:sites` sont conservés séparément et ne font pas partie du déploiement Coolify.

## Protection des requêtes HTTP

Le garde fonctionne par défaut avec Docker et `npm start`, sans clé ni service externe. Il limite les abus applicatifs HTTP avant Next :

- Budget global : 80 requêtes/s, rafale de 160. Budget par adresse du pair TCP : 20/s, rafale de 80. Une première page et environ 40 fichiers peuvent se charger normalement.
- Pages et chemins non reconnus comme fichiers publics existants : 10/s, rafale de 30, au maximum 12 réponses SSR simultanées. Un faux chemin `/_next/static/...` n’échappe pas à ce budget.
- Au maximum 64 transferts vers Next, sans file d’attente. Le dépassement répond `429` avec `Retry-After: 1`.
- GET, HEAD et OPTIONS seuls ; les corps de requêtes sont refusés. Les imports, GIF, images et sauvegardes de Zapstick sont traités côté navigateur et n’envoient aucun POST au serveur. Une future fonctionnalité serveur POST devra adapter explicitement cette règle.
- URL limitée à 2048 octets, en-têtes à 8192 octets et 48 champs ; délais de lecture et connexions persistantes bornés. Au maximum 256 connexions, dont 8 places réservées aux connexions de contrôle locales lorsque les clients externes occupent les autres places.
- Délai total SSR de 15 secondes ; fichiers de 120 secondes pour permettre le téléchargement du moteur WASM sur mobile. Les réponses sont transmises en flux avec contrôle de débit mémoire ; les en-têtes de cache des fichiers sont conservés.
- `/api/health` répond depuis l’état de supervision, avec un contrôle périodique du Next privé. Il ne consomme pas de rendu SSR et reste accessible au contrôle local lorsque les budgets publics sont épuisés. Ce mécanisme ne garantit pas la disponibilité si le système ou le réseau est saturé.

Les budgets IP utilisent uniquement `socket.remoteAddress`. Les en-têtes entrants `X-Forwarded-For`, `Forwarded`, `CF-Connecting-IP` et similaires ne changent pas l’identité du pair. Derrière Traefik, ce pair est généralement **le proxy**, donc ce budget est partagé entre ses visiteurs ; il ne faut pas l’annoncer comme une limite individuelle par visiteur. Les limites globales et de concurrence restent applicables.

Les adresses ne sont ni journalisées ni persistées par le garde. Au maximum 4096 budgets sont conservés en mémoire, avec expiration après 2 minutes d’inactivité et nettoyage périodique. Si la table est pleine, les nouveaux pairs sont refusés au lieu d’agrandir la mémoire. L’arrêt SIGTERM/SIGINT cesse l’admission, termine les réponses dans un délai borné puis arrête l’enfant Next ; un enfant qui ne s’arrête pas est terminé de force.

Ces limites protègent les ressources applicatives contre des abus L7 modestes. Elles ne bloquent pas une attaque volumétrique qui sature le lien réseau, le noyau ou le proxy. Pour ce risque, utiliser la protection réseau du fournisseur ou une protection en amont comme Cloudflare, et empêcher l’accès direct à l’origine quand cette architecture est retenue.

### Couche Traefik dans Coolify

Le fichier Compose contient les middlewares `zapstick-l7-rate` (10 requêtes/s, rafale 80) et `zapstick-l7-inflight` (64 requêtes simultanées par hôte). Le limiteur de débit utilise le pair réseau par défaut, sans critère basé sur un en-tête envoyé par le client. Compose publie le port uniquement sur `127.0.0.1` pour les tests locaux ; le proxy Coolify rejoint le service sur son réseau Docker et le port 3000. Renommer les middlewares si plusieurs installations partagent le même Traefik.

**Ressource Docker Compose** : les labels sont inclus dans le service, et `coolify.traefik.middlewares` les référence. Coolify les attache aux routeurs qu’il génère pour ce service. Un simple `docker compose up` sans Traefik n’active pas ces labels : le garde Node reste actif.

**Application au build pack Dockerfile** : Coolify ne lit pas les labels du fichier Compose. Dans le serveur Coolify, ouvrir **Proxy → Dynamic Configurations** et ajouter :

```yaml
http:
  middlewares:
    zapstick-l7-rate:
      rateLimit:
        average: 10
        period: 1s
        burst: 80
    zapstick-l7-inflight:
      inFlightReq:
        amount: 64
```

Dans l’application, repérer le routeur HTTPS réel dans **Container labels**. Si nécessaire, passer la gestion des labels à **Managed manually**, puis ajouter `zapstick-l7-rate@file,zapstick-l7-inflight@file` à la fin de sa valeur `.middlewares`, en conservant ses middlewares existants. Sauvegarder et redéployer ; vérifier ensuite les labels effectifs. Ne pas remplacer les routeurs, services ou réglages TLS générés. Le garde embarqué fonctionne même avant cette configuration complémentaire.

### Proxy de confiance et Cloudflare

Conserver les critères réseau par défaut tant que la chaîne de confiance n’a pas été configurée. Ne pas activer `forwardedHeaders.insecure` ni utiliser arbitrairement un en-tête client comme identité. Si Cloudflare ou un autre proxy est ajouté, le limiteur Traefik voit d’abord ses adresses communes. Une identification fiable des visiteurs exige de restreindre l’accès à l’origine aux réseaux du proxy, de configurer `forwardedHeaders.trustedIPs` avec ses plages officielles à jour, puis de choisir une stratégie d’IP correspondant à la chaîne réellement validée. Les [plages officielles Cloudflare](https://www.cloudflare.com/ips/) ne sont pas figées dans ce dépôt. Le garde Node continue à raisonner par pair TCP, sans faire confiance à ces en-têtes.

### Contrôles locaux

`node --test tests/runtime-guard.mjs` (Node 22) teste uniquement des serveurs temporaires sur `127.0.0.1` : rafale de fichiers, budgets, rotation de faux en-têtes IP, table mémoire bornée, requêtes malformées ou trop grandes, délais, saturation de concurrence, santé et arrêt de l’enfant. Ces tests ne réalisent aucune charge vers un service externe. Après déploiement, vérifier la santé et le chargement normal ; ne pas lancer de test de charge sur un domaine tiers.

Sources : [Dockerfile dans Coolify](https://coolify.io/docs/applications/builds/dockerfile), [contrôles de santé Coolify](https://coolify.io/docs/applications/configuration/health-checks), [sortie standalone Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [middlewares Coolify](https://coolify.io/docs/core/networking/proxy/traefik/custom-middlewares), [RateLimit Traefik](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/ratelimit/), [InFlightReq Traefik](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/inflightreq/), [en-têtes de confiance Traefik](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/#forwarded-headers).
