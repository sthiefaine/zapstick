# Activer la passerelle WhatsApp

Le compte dédié WhatsApp Business est associé comme appareil lié via Baileys, bibliothèque non officielle. Il reste soumis aux restrictions de WhatsApp. Le son est expérimental : valider un sticker natif sur Android avant de l'ouvrir au public. Le déploiement habituel fonctionne sans la passerelle ; l'override décrit ici est optionnel.

## Préparer le compte et les secrets

Si WhatsApp Business est déjà activé avec l'eSIM dédiée, passer à la configuration. Sinon, installer l'application officielle et terminer l'inscription du numéro par SMS/appel **dans WhatsApp**. Conserver l'accès à la ligne et au téléphone. Aucun code SMS, QR ou fichier de session ne doit être transmis dans un chat, un ticket ou Git.

Le téléphone principal n'a pas besoin de rester connecté en permanence. Ouvrir régulièrement WhatsApp Business sur ce téléphone : WhatsApp indique une connexion au compte principal au moins tous les 14 jours pour conserver les appareils liés. [Appareils liés](https://faq.whatsapp.com/378279804439436/).

Copier `.env.whatsapp.example` vers `.env.whatsapp.local` uniquement si ce fichier privé n'existe pas déjà. Ne pas écraser une configuration préparée. Appliquer `chmod 600 .env.whatsapp.local`. Il est exclu de Git et du contexte Docker.

Renseigner trois secrets indépendants générés dans un gestionnaire de secrets : `WHATSAPP_BRIDGE_TOKEN` (au moins 32 caractères), `WHATSAPP_TRANSFER_KEY` et `WHATSAPP_AUTH_KEY` (chacune : 32 octets aléatoires encodés en base64url sans remplissage, soit 43 caractères). Le premier authentifie le serveur web ; les deux clés protègent respectivement les transferts et la session. `WHATSAPP_BOT_NUMBER` contient le numéro international en chiffres seuls, sans `+`, espace ou zéro national initial.

Ces valeurs sont des variables **d'exécution serveur**, jamais des arguments de build ni des `NEXT_PUBLIC_`. Ne pas imprimer la sortie complète de `docker compose config`, qui développe les secrets. Conserver la clé d'authentification après association : la changer ne fait pas migrer automatiquement la session.

Les quatre commutateurs démarrent à `false` : `WHATSAPP_BOT_ENABLED` et `WHATSAPP_BOT_SOUND_ENABLED` activent le service privé dans Compose ; `WHATSAPP_BRIDGE_ENABLED` et `WHATSAPP_SOUND_ENABLED` activent le parcours public et son option sonore. Compose traduit les variables `BOT_*` vers les variables internes du service. Les essais commencent avec **bot actif, site désactivé, son désactivé**.

## Parcours local avec Docker

Démarrer Docker Desktop. Depuis la racine du dépôt, valider sans afficher de secrets, puis construire l'image :

```sh
docker compose --env-file .env.whatsapp.local -f docker-compose.whatsapp.yml config --quiet
docker compose --env-file .env.whatsapp.local -f docker-compose.whatsapp.yml build whatsapp-bridge
```

Arrêter une éventuelle instance avant association, puis lancer l'outil dans un terminal administrateur réellement interactif, sans `-T`, redirection ou enregistrement de session :

```sh
docker compose --env-file .env.whatsapp.local -f docker-compose.whatsapp.yml stop whatsapp-bridge
docker compose --env-file .env.whatsapp.local -f docker-compose.whatsapp.yml run --rm --no-deps whatsapp-bridge npm run pair
```

Après confirmation locale, le QR temporaire apparaît uniquement dans cette console privée. Sur le téléphone : **WhatsApp Business → Appareils connectés → Connecter un appareil**. Scanner puis fermer la console. Le serveur ne publie aucun QR dans une page ni dans ses logs habituels ; un verrou refuse une seconde instance concurrente.

Mettre `WHATSAPP_BOT_ENABLED=true` dans le fichier privé, laisser les trois autres commutateurs à `false`, puis démarrer :

```sh
docker compose --env-file .env.whatsapp.local -f docker-compose.whatsapp.yml up -d whatsapp-bridge
docker compose --env-file .env.whatsapp.local -f docker-compose.whatsapp.yml exec whatsapp-bridge sh
```

La dernière commande ouvre une console dans le conteneur déjà démarré pour les tests ci-dessous. Ne pas publier le port 3001.

## Parcours local sans Docker

Alternative au précédent : ne pas connecter deux services au même compte. Installer Node.js 22.13 ou plus récent et FFmpeg 5 ou plus récent avec `libopus`. Le bridge valide le WebP final sans le réencoder ; seul l'encodage audio Opus est nécessaire au transport sonore. Depuis la racine :

```sh
cd services/whatsapp-bridge
npm ci --ignore-scripts --no-audit --no-fund
```

Arrêter tout processus du bot avant association. Les secrets sont lus depuis le même fichier privé ; seul le chemin de session local est ajouté à la commande :

```sh
WHATSAPP_AUTH_DIR="$PWD/.data/auth" node --env-file=../../.env.whatsapp.local src/pair.mjs
```

Après association, démarrer le processus privé :

```sh
WHATSAPP_AUTH_DIR="$PWD/.data/auth" WHATSAPP_DATA_DIR="$PWD/.data/transfers" HOSTNAME=127.0.0.1 PORT=3001 WHATSAPP_BRIDGE_ENABLED=true WHATSAPP_SOUND_ENABLED=false node --env-file=../../.env.whatsapp.local src/main.mjs
```

Les répertoires `.data` sont ignorés par Git. Les commutateurs publics du fichier restent désactivés ; les valeurs explicites ne s'appliquent qu'à ce processus. Pour tester le son plus tard, l'arrêter puis reprendre cette commande avec `WHATSAPP_SOUND_ENABLED=true`. Les commandes de test se lancent dans un deuxième terminal, dans le même répertoire. Un futur serveur web local doit utiliser `WHATSAPP_BRIDGE_URL=http://127.0.0.1:3001` ; Compose utilise le nom privé `whatsapp-bridge`.

## Installer dans Coolify

Choisir le build pack **Docker Compose**, Base Directory `/`, Docker Compose Location `/docker-compose.whatsapp.yml`. Ce fichier optionnel hérite du service web de `docker-compose.yml` par `extends` : sélectionner uniquement ce fichier, tout en gardant le fichier de base présent dans le dépôt. Ne pas charger les deux simultanément, afin d'éviter le double héritage de certaines options sur d'anciennes versions de Compose. Vérifier les deux services et les volumes dans la définition effective avant déploiement. Les variables privées se renseignent à l'exécution dans Coolify ; le fichier local n'est pas ajouté à l'image. Ne jamais enregistrer une configuration développée contenant les secrets.

- Domaine HTTPS uniquement sur `zapstick`, port 3000 et garde HTTP conservé. Aucun domaine, port hôte ou routeur public pour `whatsapp-bridge`.
- Garder le réseau propre à la ressource, avec sortie vers WhatsApp ; ne pas connecter production et previews à un réseau prédéfini partagé.
- Une seule réplique du bridge. Aucun chevauchement de deux processus pendant un remplacement ; le verrou de session constitue une protection supplémentaire.
- Volumes `whatsapp-auth` sur `/data/auth` et `whatsapp-transfers` sur `/data/transfers`, lisibles et inscriptibles par UID/GID 1001. Vérifier les noms réels créés par Coolify.
- Exclure **tout le volume de transferts** des sauvegardes, exports et snapshots hôte. Un commentaire Compose n'applique pas cette exclusion au logiciel de sauvegarde : la vérifier réellement.
- Ne pas cloner le volume ni la clé de session vers une préproduction. En cas de perte ou révocation, préférer une nouvelle association ; ne pas restaurer automatiquement d'anciennes clés Signal.

Le bridge fonctionne sans privilèges, en lecture seule hors volumes et `/tmp`. Limites initiales à mesurer : 1 CPU, 768 Mio, 128 processus, `/tmp` de 64 Mio. Le service borne l'entrée à 4 Mio, réserve sa capacité avant admission et limite les transferts à 100 Mio ; validité absolue de dix minutes.

Pour associer sur Coolify, utiliser une console privée administrateur du serveur, arrêter le bridge et lancer la commande `run --rm --no-deps ... npm run pair` avec **le même projet Compose et les mêmes volumes effectifs que le déploiement**. Ne pas lancer un clone arbitraire qui créerait de nouveaux volumes. Redémarrer ensuite avec `WHATSAPP_BOT_ENABLED=true`, mais les deux commutateurs publics et le son privé à `false` pendant les tests.

## Trois essais sur Android

Utiliser un compte destinataire distinct du bot. La commande `sample` prépare un transfert temporaire et affiche son lien privé ; elle **n'envoie aucun message WhatsApp automatiquement**. Ouvrir ce lien avec le compte destinataire puis toucher soi-même **Envoyer**. Ne pas partager ni journaliser le lien.

Depuis le répertoire du service dans le conteneur ou sur la machine locale, préparer trois échantillons hors collection. Ce générateur Node fonctionne hors ligne, sans compte, connexion ou envoi WhatsApp, et sans encodeur WebP local :

```sh
node src/fixtures.mjs --output /tmp/zapstick-fixtures
```

Dans le conteneur déjà démarré :

```sh
npm run sample -- --visual /tmp/zapstick-fixtures/static.webp --locale fr
npm run sample -- --visual /tmp/zapstick-fixtures/animated.webp --locale fr
```

Sans Docker, depuis `services/whatsapp-bridge`, remplacer `npm run sample -- ...` par `node --env-file=../../.env.whatsapp.local src/sample.mjs ...`.

Vérifier réception comme **sticker natif**, animation attendue, ajout aux favoris, réenvoi depuis les favoris et transfert vers une autre conversation. Refaire après redémarrage du bridge. Tester aussi expiration, même message reçu deux fois et code réclamé par deux expéditeurs : pas de doublon automatique ni de réponse à un numéro fourni par le navigateur.

Après réussite standard, activer seulement le son privé (`WHATSAPP_BOT_SOUND_ENABLED=true` puis recréer le bridge, ou variable de processus du parcours sans Docker). Le site reste désactivé. Préparer alors :

```sh
npm run sample -- --visual /tmp/zapstick-fixtures/animated.webp --sound /tmp/zapstick-fixtures/sound.wav --locale fr
```

Vérifier lecture du son, synchronisation et conservation du son après favori puis réenvoi natif. Noter Android, WhatsApp stable/bêta et version exacte, Baileys et FFmpeg. Un accusé technique ou une vidéo reçue ne valide pas un sticker sonore natif. En cas d'échec, laisser le son public désactivé.

## Ouverture et exploitation

Après validation standard, passer `WHATSAPP_BRIDGE_ENABLED=true` côté site. Le son public reste désactivé jusqu'à son test spécifique ; il exige ensuite les deux commutateurs sonores à `true`. Vérifier le bouton dans le résultat et la fiche d'un sticker, les huit langues et le retour depuis WhatsApp sans perte du rendu.

`/health/live` vérifie le processus privé. `/internal/v1/status`, authentifié, donne au BFF disponibilité réelle du compte et capacité. Une déconnexion ne doit ni entraîner une boucle de redémarrages ni rendre le site indisponible. `/api/health` vérifie le site et n'atteste pas que WhatsApp est connecté.

Les journaux du bridge sont bornés à trois fichiers de 5 Mio ; aucun contenu de message, média, numéro, code, QR ou secret n'y est ajouté. Les transferts sont supprimés à expiration, annulation ou fin ; des traces minimales sans média ni destinataire restent au maximum 24 heures. L'arrêt accorde 30 secondes pour cesser l'admission et sauvegarder l'état. Un envoi à accusé inconnu ne repart pas automatiquement.

Pour désactiver ou revenir en arrière : couper d'abord le commutateur public, conserver les téléchargements locaux, arrêter proprement le bridge puis revenir à une image validée avec schéma compatible. Ne pas supprimer les volumes avec `down -v`. Pour révoquer, déconnecter l'appareil dans **WhatsApp Business → Appareils connectés**, puis arrêter le bridge. Ne pas rétablir une session révoquée par une ancienne sauvegarde.

### Réassocier après une révocation

Relancer simplement `pair` sur l'ancien stockage ne suffit pas : ses credentials restent marqués comme enregistrés, même si WhatsApp les refuse. La même procédure s'applique si le QR a été scanné par erreur avec le compte personnel : le bridge refuse de devenir disponible lorsque le compte associé ne correspond pas au numéro configuré. Garder le bot arrêté, choisir un **stockage d'authentification vierge** et une nouvelle `WHATSAPP_AUTH_KEY`, puis refaire l'association privée avant de redémarrer une seule instance.

- Docker/Coolify : remplacer uniquement le volume monté sur `/data/auth` par un nouveau volume vide. Avec Compose, utiliser par exemple `whatsapp-auth-v2:/data/auth` et déclarer `whatsapp-auth-v2:` dans `volumes:` ; avec Coolify, configurer le stockage équivalent dans la ressource privée.
- Node local : définir `WHATSAPP_AUTH_DIR` vers un nouveau dossier privé sous `services/whatsapp-bridge/.data`, sans modifier l'ancien dossier pendant son utilisation.

Conserver le volume des transferts et sa `WHATSAPP_TRANSFER_KEY` tant que des demandes restent à traiter ou à expirer. L'ancien stockage d'authentification doit rester hors service et protégé ; son nettoyage est une opération administrateur distincte. Ne jamais faire tourner simultanément deux copies de la même session.

Références : [association WhatsApp](https://faq.whatsapp.com/878854700132604/?cms_platform=android&locale=en_US), [session Baileys](https://baileys.wiki/authentication/session-management), [Compose Coolify](https://coolify.io/docs/applications/builds/docker-compose), [stockage Coolify](https://coolify.io/docs/applications/configuration/persistent-storage), [santé Coolify](https://coolify.io/docs/applications/configuration/health-checks), [remplacement des conteneurs Coolify](https://coolify.io/docs/applications/deployments/rolling-updates).


## Modifier un sticker reçu par le bot

Configurer `WHATSAPP_SITE_URL=https://zapstick.clairdev.com` à l’exécution du **service privé**. Hors création `/create`, le bot accepte un sticker natif récent envoyé dans une conversation individuelle et répond par un lien `https://…/fr#edit=…`. Le fragment n’est pas envoyé lors de l’ouverture initiale de la page. Un texte libre, `aide`, `help`, `/aide` ou `/help` affiche les commandes. Les groupes, propres messages, réactions, vues uniques et historiques sont ignorés.

La réservation précède le téléchargement : **5 liens actifs par expéditeur**, dix minutes absolues, 20 travaux simultanés et 100 Mio partagés avec les transferts habituels. Une demande échouée libère sa réservation ; un lien prêt reste consultable plusieurs fois jusqu’à expiration. Les WebP entrants conservent leur taille d’origine (2048 px par côté et 80 millions de pixels cumulés maximum), avec 1 Mio et six secondes maximum ; le fichier audio joint est limité à 512 Kio. Le format 512 × 512 est imposé à l’export, jamais à l’import. Cette limite d’import est distincte des 500 Kio de l’export animé. Une longueur de fichier absente reste bornée au téléchargement et vérifiée par SHA-256 ; un média expiré (404/410) déclenche une seule demande de remise en ligne au téléphone de l’expéditeur. Les sons natifs Ogg/Opus, M4A/AAC, MP3, WAV et WebM sont décodés localement, sans supposer un unique conteneur. Seules les six premières secondes sont conservées, puis le WAV PCM16 et l’animation sont alignés ensemble à la milliseconde ; aucun décalage de début n’est ajouté. Le fichier source temporaire privé est effacé après décodage, y compris en cas d’erreur. Les téléchargements passent par le déchiffrement Baileys avec vérification SHA-256, hôte WhatsApp fixe, durée et mémoire bornées. Le champ sonore expérimental 26 est décodé uniquement pour les objets StickerMessage, via une WeakMap.

Les médias temporaires se trouvent sous `reverse-media/` dans **le même volume privé des transferts** : les exclure également des sauvegardes hôte. Le balayage existant les efface à expiration et récupère les réservations après incident ; le verrou SQLite protège les deux sens. Les index expéditeur, événement et lien sont des HMAC, sans numéro, code, message ni média dans les journaux. La garde commune ci-dessous limite les réponses ; les imports de liens restent limités à six par minute et par expéditeur, vingt globalement.

Contrat privé : `GET /internal/v1/reverse/<token>` avec le Bearer de service habituel. Le token canonique contient 43 caractères base64url. Réponse JSON, quatre Mio maximum : `{version:1,kind,expiresAt,visual:{mime:"image/webp",data:"…base64…"},sound?:{mime:"audio/wav",data:"…base64…",duration}}`. Aucune identité ne figure dans la réponse. Expiration ou token inconnu : 404 `not_found`. Le parcours public doit passer par le BFF, jamais exposer le Bearer privé.

## Créer directement dans la conversation

`/create` ouvre une création privée pendant dix minutes au total. Le premier sticker fixe, animé ou sonore fournit uniquement le visuel : son audio initial est ignoré. Ensuite un vocal, un fichier audio (MP3, M4A, OGG, WAV, AAC, WebM, jusqu’à 8 Mio) ou un autre sticker sonore fournit le son. Un nouvel audio remplace le précédent, sans changer le visuel ; un second sticker muet est refusé avec une explication. Les six premières secondes du son sont décodées localement. `/end` renvoie le sticker natif ; sans son ajouté, il est muet. `/cancel` annule, un nouveau `/create` recommence. L’envoi habituel « Sticker ZAP … » reste indépendant.

Le rendu WebP utilise Sharp/libvips pour conserver le compositing des animations puis ajuste à 512 × 512 avec transparence. Fixe sans son : 100 Kio maximum ; animé : 500 Kio et six secondes maximum. Un visuel fixe avec son devient une animation qui tient la pose. Si le son dépasse l’animation, sa dernière pose est prolongée ; si le son est plus court, il est complété par du silence jusqu’à la fin du visuel. L’audio final passe par le même encodeur Opus et le même transport natif que le site. Le décodage et l’encodage sont sérialisés avec les autres travaux ; aucun second socket WhatsApp n’est ouvert.

Les brouillons restent uniquement en mémoire (un par expéditeur, vingt au total), sans survie au redémarrage. Les fichiers de rendu sont créés dans un répertoire privé de `/tmp`, effacés après réussite ou échec. La file ordonnée est bornée à vingt-quatre événements et conserve l’ordre visuel → audio → `/end`, même en cas d’envoi rapproché. Un envoi dont l’accusé est inconnu n’est jamais recommencé automatiquement.

La protection commune ignore les doublons pendant deux minutes. Par expéditeur : rafale de huit entrées puis une entrée toutes les deux secondes ; une aide toutes les trente secondes ; six réponses de parcours puis une toutes les trois secondes. Les quotas d’aide sont séparés pour ne pas bloquer une création normale. Globalement : rafale de quatre-vingts entrées puis deux par seconde, quarante réponses puis une par seconde. Les excès sont ignorés silencieusement, sans nouvelle réponse « trop de demandes » à chaque message. Les identités en mémoire sont des HMAC ; alias téléphone/LID regroupés, tables bornées et purgées.

## Langue et présentation du bot

Le bot choisit une langue par défaut à partir du numéro fourni par WhatsApp : +33 français, +55 portugais brésilien, +34 espagnol, +49 allemand, +86 chinois simplifié, +81 japonais et +7 russe. Un choix explicite avec `/lang` est prioritaire ; sinon le numéro est prioritaire sur une langue reprise du site, puis l’anglais sert de repli. Les identifiants LID ne sont jamais interprétés comme des numéros : le bot utilise leur alias téléphone joint au message ou la correspondance locale déjà présente dans sa session, sans recherche d’annuaire. Si WhatsApp ne fournit aucun numéro, le repli reste disponible.

`/lang` affiche les huit choix ; `/lang en`, `/lang fr`, `/lang pt-BR`, `/lang es`, `/lang de`, `/lang zh-CN`, `/lang ja` et `/lang ru` mémorisent la préférence, y compris après redémarrage. Une réception valide depuis le site peut fournir une préférence secondaire sans remplacer un choix explicite. La préférence contient uniquement un code langue, son origine (choix ou site), un horodatage et un identifiant HMAC ; elle expire trente jours après sa dernière définition et suit la fusion des alias téléphone/LID. Les préférences enregistrées avant la distinction d’origine sont conservées comme des choix explicites. Le choix ne modifie ni n’efface une création en cours.

Toutes les réponses de création, d’aide, d’erreur et d’édition sont traduites. Les commandes utilisent les astérisques simples de WhatsApp (`*/create*`) pour le gras. Le message de bienvenue ajoute l’adresse HTTPS configurée dans `WHATSAPP_SITE_URL`. Les liens d’édition s’ouvrent dans la langue du bot ; une langue inconnue revient à l’anglais.

## Menus par sondage

`/lang` envoie un sondage WhatsApp natif à réponse unique avec les huit langues. Un vote valide mémorise la préférence explicite et confirme dans la langue choisie. `/lang fr` et les autres commandes directes restent disponibles. `/menu` ou un texte libre hors création affichent quatre actions : créer un sticker, modifier sur le site, afficher l’aide et changer la langue. Le menu d’accueil contient également le lien du site. `/help` conserve l’aide complète ; `/edit` demande le sticker à ouvrir sur le site. Les menus sont traduits dans les huit langues.

Chaque expéditeur a un seul sondage actif, valable dix minutes et utilisable une seule fois. Un nouveau sondage remplace le précédent ; une action directe ou l’envoi d’un média invalide le menu devenu inutile. Un vieux vote ou le changement d’un vote déjà traité ne relance jamais l’action. Le choix « Modifier sur le site » quitte une éventuelle création temporaire ; le prochain sticker reprend le parcours de lien d’édition habituel.

Le secret de sondage et les options sont chiffrés dans `bot_polls` avec la clé privée des transferts, supprimés après choix ou expiration et limités à 128 sondages actifs. Les index d’expéditeur et de message sont des HMAC. Le contexte survit à un redémarrage sans conserver l’historique WhatsApp. La lecture des votes utilise le déchiffrement Baileys pour le seul sondage connu de cet expéditeur, avec vérification des identités PN/LID et du SHA-256 du libellé sélectionné. Les votes modifiés, étrangers ou à plusieurs choix sont ignorés. La file et l’anti-spam habituels protègent aussi les sondages ; un accusé d’envoi inconnu n’entraîne pas de renvoi automatique. Si le sondage ne peut pas être préparé, les commandes textuelles sont proposées.

## Cadence et pauses du transport

Tous les envois utilisent une seule file, y compris les stickers sonores, les textes, les sondages et leurs réponses de repli. La file accepte seize opérations au maximum. Une garde appliquée à notre appel `relayMessage` réserve chaque envoi avant sa remise au fournisseur : trois secondes au moins entre deux réservations, vingt réservations par minute et 240 par heure, avec cinq secondes d'attente après connexion. Une attente de cadence dépassant quinze secondes est refusée ; les expirations et annulations interrompent l'attente. Une remise sans accusé reste incertaine et n'est jamais réessayée automatiquement.

Les budgets et les pauses sont chiffrés dans `auth.sqlite`, sous le verrou de session existant ; aucun numéro, texte, média ou secret n'est ajouté aux diagnostics. Les codes numériques de déconnexion et d'échec de remise sont journalisés comme `whatsapp_guard_connection_failed_403`, par exemple. Ce sont des observations techniques, pas la preuve du motif d'une sanction.

Les codes 401/440, 403/411/463 et 429 imposent une pause persistante ; une fermeture 500 conserve également une pause technique. Trois échecs de remise consécutifs en une minute suspendent les envois. Le budget de connexion est de huit tentatives en quinze minutes, conservé après redémarrage, avec délai exponentiel de deux à trente secondes ; une brève connexion réussie ne réinitialise pas ce budget. Ces seuils sont des choix prudents de Zapstick, pas des quotas ou garanties publiés par WhatsApp.

Pour suspendre explicitement le service : `WHATSAPP_BRIDGE_PAUSED=true` à l'exécution du service privé, ou `WHATSAPP_BOT_PAUSED=true` avec le Compose optionnel. Le service HTTP et son nettoyage restent actifs, mais aucun socket WhatsApp n'est créé. Cette pause est mémorisée : retirer seulement la variable ne reprend pas la connexion.

L'administrateur peut inspecter ou gérer cette garde **hors ligne, après arrêt du service qui possède la session** :

```sh
docker compose --env-file .env.whatsapp.local -f docker-compose.whatsapp.yml run --rm whatsapp-bridge npm run safety -- status
docker compose --env-file .env.whatsapp.local -f docker-compose.whatsapp.yml run --rm whatsapp-bridge npm run safety -- pause
```

Après résolution du problème et vérification du statut du compte, retirer la variable de pause puis utiliser `npm run safety -- resume` dans cette même console privée. La reprise exige un terminal interactif et une confirmation explicite ; elle n'ouvre aucun socket et conserve les budgets d'envoi. Un compte encore bloqué doit rester en pause. La commande d'association respecte aussi les pauses : elle n'est pas un moyen de les contourner.

Ces protections n'autorisent pas un client non officiel et ne garantissent pas l'absence de blocage. Elles ne simulent ni frappe humaine, ni faux échanges, et ne modifient pas les textes avec des caractères invisibles. Les principes de cadence et d'arrêt sont inspirés de [baileys-antiban](https://github.com/kobie3717/baileys-antiban) ; son wrapper `sendMessage` ne couvre pas directement nos remises `relayMessage`, d'où la garde locale commune.
