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

Configurer `WHATSAPP_SITE_URL=https://zapstick.clairdev.com` à l’exécution du **service privé**. Le bot accepte alors un sticker natif récent envoyé dans une conversation individuelle et répond par un lien `https://…/fr#edit=…`. Le fragment n’est pas envoyé lors de l’ouverture initiale de la page. `aide`, `help`, `/aide` et `/help` donnent une indication courte. Les groupes, propres messages et historiques sont ignorés.

La réservation précède le téléchargement : **3 liens actifs par expéditeur**, dix minutes absolues, 20 travaux simultanés et 100 Mio partagés avec les transferts habituels. Une demande échouée libère sa réservation ; un lien prêt reste consultable plusieurs fois jusqu’à expiration. Les WebP entrants sont limités à 500 Kio et six secondes, l’Opus à 512 Kio. L’audio est décodé en WAV PCM16 aligné sur la durée de l’animation ; aucun décalage de début n’est ajouté. Les téléchargements passent par le déchiffrement Baileys avec vérification SHA-256, hôte WhatsApp fixe, durée et mémoire bornées. Le champ sonore expérimental 26 est décodé uniquement pour les objets StickerMessage, via une WeakMap.

Les médias temporaires se trouvent sous `reverse-media/` dans **le même volume privé des transferts** : les exclure également des sauvegardes hôte. Le balayage existant les efface à expiration et récupère les réservations après incident ; le verrou SQLite protège les deux sens. Les index expéditeur, événement et lien sont des HMAC, sans numéro, code, message ni média dans les journaux. Les réponses d’aide/erreur sont limitées à deux par minute et par expéditeur, soixante globalement ; les téléchargements à six par minute et par expéditeur, vingt globalement.

Contrat privé : `GET /internal/v1/reverse/<token>` avec le Bearer de service habituel. Le token canonique contient 43 caractères base64url. Réponse JSON, quatre Mio maximum : `{version:1,kind,expiresAt,visual:{mime:"image/webp",data:"…base64…"},sound?:{mime:"audio/wav",data:"…base64…",duration}}`. Aucune identité ne figure dans la réponse. Expiration ou token inconnu : 404 `not_found`. Le parcours public doit passer par le BFF, jamais exposer le Bearer privé.
