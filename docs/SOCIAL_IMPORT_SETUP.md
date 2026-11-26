# Instagram et TikTok publics

Le champ de lien utilise FxTwitter dans le navigateur pour X. Les publications
Instagram et TikTok passent par le serveur web Zapstick puis une instance Cobalt
privée. Si Cobalt échoue sur Instagram ou ne renvoie que la couverture d'un Reel,
Zapstick utilise yt-dlp avec curl-cffi pour récupérer les médias publics.
Une extension locale expose également les vraies photos et les carrousels mixtes ;
elle ne transforme jamais la couverture d'une vidéo en photo de remplacement.
Aucun compte ni cookie personnel n'est utilisé. Les publications privées,
les restrictions géographiques et certains blocages anti-bot restent indisponibles ;
l'interface propose alors l'import du fichier depuis l'appareil.

## Service privé Coolify

Image officielle validée :
`ghcr.io/imputnet/cobalt@sha256:28540f81d2cffbd9d089c08438e39a7689a7cee7e9a5b0f60de93a22d19f5dbe`
(Cobalt 11).
Créer un service sur le réseau privé du site avec l'alias `social-import`, port
interne `9000`, sans domaine et sans port publié sur l'hôte. L'image officielle
fonctionne en lecture seule ; prévoir un `/tmp` temporaire de 64 Mio, 1 CPU et
512 Mio de RAM. Ne pas monter les volumes ni secrets du bot WhatsApp.

Variables Cobalt :

```
API_URL=http://social-import:9000/
DURATION_LIMIT=120
TUNNEL_LIFESPAN=120
RATELIMIT_WINDOW=60
RATELIMIT_MAX=20
```

Variable **d'exécution serveur** du site web, indisponible au build :

```
COBALT_API_URL=http://social-import:9000/
```

Ne jamais exposer l'API Cobalt sur Internet. Si une clé API est configurée, définir
`API_KEY_URL=file:///keys.json` avec un fichier privé monté en lecture seule et
`API_AUTH_REQUIRED=1` côté Cobalt ; définir la même clé dans `COBALT_API_KEY` côté
Zapstick, uniquement à l'exécution. Sans clé, l'isolement réseau reste obligatoire.

## Parcours et limites

- `POST /api/import/resolve` accepte seulement un objet JSON `{"url":"https://…"}`
  de 2 Kio maximum et les chemins de publications Instagram/TikTok autorisés.
- Le serveur demande à Cobalt `alwaysProxy:true`, `videoQuality:"480"`,
  `downloadMode:"auto"`, `localProcessing:"disabled"` et `disableMetadata:true`.
- Les tunnels et vignettes doivent appartenir à l'origine Cobalt configurée et au
  chemin exact `/tunnel`. Le secours Instagram autorise uniquement les MP4, JPEG,
  PNG et WebP HTTPS
  de `cdninstagram.com` et `fbcdn.net`, sans redirection. La clé privée Cobalt
  n'est jamais transmise à ces hébergeurs.
- Le navigateur reçoit uniquement des chemins locaux temporaires
  `/api/import/media/<ticket>`, jamais l'adresse ou une clé du service privé.
- Tickets de 90 secondes, 20 médias maximum par publication, 128 tickets en mémoire,
  deux opérations simultanées maximum, quotas globaux et au niveau du garde HTTP.
- Téléchargement plafonné à 20 Mio, types et signatures contrôlés, délai absolu de
  25 secondes. Les octets sont relayés en mémoire sans stockage durable.
- L'image Docker installe yt-dlp 2026.11.23 et curl-cffi 0.17.0 dans un environnement
  Python isolé. Le sous-processus récupère seulement les métadonnées, ignore toute
  configuration personnelle, ne reçoit aucun secret et s'arrête au bout de vingt
  secondes. Il reste soumis aux quotas ci-dessus. En développement local, yt-dlp
  installé dans le `PATH` est utilisé ; `INSTAGRAM_DOWNLOADER` peut aussi désigner
  son chemin absolu. Le secours Instagram ne nécessite pas de Cobalt local.
- Seule l'extension du dépôt `services/instagram-import/plugins` est chargée ;
  les répertoires d'extensions personnels de yt-dlp sont désactivés. Les photos
  sont reconnues par leur type Instagram, jamais par une simple vignette vidéo.

Les journaux ne contiennent ni URL source, ni ticket, ni média. Redémarrer le site
invalide les tickets en mémoire ; recoller le lien suffit pour préparer un nouvel
import. Les carrousels se sélectionnent dans le choix de médias existant.

## Vérification manuelle

Deux URL des fixtures publiques officielles de yt-dlp ont été extraites sans
cookies avec yt-dlp 2026.10.26 depuis le poste de développement :

- `https://www.instagram.com/reel/Chunk8-jurw/` : neuf formats vidéo MP4.
- `https://www.tiktok.com/@pokemonlife22/video/7059698374567611694` : MP4, six secondes.

Sur le serveur Hetzner, Cobalt 11 a réellement téléchargé le TikTok de six
secondes en MP4 (658 136 octets). Sur le Reel Instagram ci-dessus, Cobalt a
renvoyé une image JPEG de couverture plutôt que la vidéo : ce résultat déclenche
maintenant le secours Instagram. Un lien Reel/TV ne peut pas réussir avec sa seule
couverture, même si le service amont la présente comme un résultat complet.

Un autre ancien exemple TikTok a répondu que l'IP n'était pas autorisée. Ces
résultats prouvent une extraction publique possible, pas une disponibilité garantie
pour chaque publication ni pour l'IP du serveur. Vérifier Cobalt sur le serveur,
puis coller chaque lien dans Zapstick et attendre un média réellement éditable.
Vérifier également un refus propre suivi d'un import depuis l'appareil.

Sources : [Cobalt API](https://github.com/imputnet/cobalt/blob/main/docs/api.md),
[services pris en charge](https://github.com/imputnet/cobalt/blob/main/api/README.md),
[configuration](https://github.com/imputnet/cobalt/blob/main/docs/api-env-variables.md).
