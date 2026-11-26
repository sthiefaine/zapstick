# Zapstick — Recevoir un sticker sur WhatsApp

Plan de développement du 26 novembre 2026. Périmètre : passerelle depuis le résultat de création et la fiche d’un sticker enregistré. L’eSIM dédiée est disponible ; l’inscription WhatsApp Business et l’association de l’appareil restent à effectuer. Ce document prépare le travail ; il n’active aucun compte ni envoi.

## Résultat attendu

1. L’utilisateur termine son sticker ou ouvre un sticker de sa collection.
2. Il touche **Recevoir sur WhatsApp**. Zapstick transfère temporairement ce résultat et prépare un code.
3. Le même bouton devient **Ouvrir WhatsApp**. Ce second appui ouvre la conversation avec le numéro Zapstick et un texte prérempli.
4. L’utilisateur touche **Envoyer** dans WhatsApp.
5. Le bot répond dans cette conversation avec le sticker natif. Le code est consommé une seule fois.

Le code expire dix minutes après l’admission du transfert, sans prolongation lors d’une nouvelle tentative. Il n’y a pas de formulaire de numéro, de compte Zapstick ou de synchronisation de collection. Le téléchargement existant reste disponible. Le texte prérempli doit être envoyé volontairement par l’utilisateur, comme le décrit l’[aide WhatsApp](https://faq.whatsapp.com/5913398998672934).

La préparation asynchrone précède un vrai lien ouvert par un appui volontaire : éviter les fenêtres ouvertes automatiquement après un upload, souvent bloquées sur mobile. Ne pas afficher « livré » à l’ouverture du lien ou au simple succès de l’API.

## Décision de faisabilité à prendre en premier

Le transport proposé est **Baileys**, appareil associé au compte dédié, dans un service privé sur Coolify. Cette bibliothèque est non officielle : compatibilité et continuité du compte ne sont pas garanties. Son utilisation nécessite d’accepter cette dépendance avant la mise en service. [Projet Baileys](https://github.com/WhiskeySockets/Baileys).

Les stickers fixes et animés disposent d’un [format WebP documenté](https://github.com/WhatsApp/stickers/blob/main/Android/README.md#sticker-art-and-app-requirements). Le son natif est un chantier distinct : un prototype public injecte manuellement un `AudioMessage` dans le champ 26 de `StickerMessage`, absent du schéma Baileys `7.0.0-rc14` étudié. Cela justifie un essai contrôlé, pas une promesse de compatibilité. [Patch figé](https://github.com/DavidRamirez206/whatsapp-sound-sticker-bot/blob/d70e1784f4ad563fcc8d91925f811aad4d097f01/src/sticker-audio-patch.js), [schéma Baileys](https://github.com/WhiskeySockets/Baileys/blob/v7.0.0-rc14/WAProto/WAProto.proto).

**Premier jalon :** activer WhatsApp Business avec l’eSIM sur le téléphone administrateur, puis tester depuis l’autre compte Android trois stickers connus : fixe, animé silencieux, animé sonore de deux à trois secondes. Les codes SMS restent dans l’application WhatsApp ; aucun OTP ne traverse Zapstick.

Le test vérifie réception native, animation, son au toucher, synchronisation, ajout aux favoris, réenvoi depuis les favoris, transfert et comportement après redémarrage du bridge. Noter les versions Android, WhatsApp stable/bêta, Baileys et FFmpeg. Un accusé d’envoi serveur ne valide pas le rendu sur téléphone.

- **GO standard** : fixe et animé reçus et réutilisables ; réponse au bon expéditeur ; reconnexion fonctionnelle.
- **GO sonore séparé** : son conservé pendant le réemploi natif sur les versions Android testées.
- Si le son échoue, ne pas remplacer discrètement par un sticker muet ou une vidéo. Garder cette capacité désactivée et proposer explicitement les téléchargements existants. La passerelle standard peut être livrée indépendamment.

Réévaluer l’API officielle si elle expose ultérieurement un format sonore approprié. Son [API publique de stickers](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/sticker-messages/) documente actuellement le WebP fixe/animé, sans champ sonore équivalent.

## Sept revues spécialisées

1. **Compatibilité WhatsApp** : format, version du transport, preuve sur Android, critères GO standard/sonore.
2. **Backend et reprise** : contrats, base SQLite, code unique, idempotence, envois et erreurs réseau.
3. **Usage mobile** : deux emplacements, appuis fiables, retour dans le navigateur, états courts et huit langues.
4. **Sécurité et confidentialité** : upload borné, capacités secrètes, abus, expiration, effacement et session privée.
5. **Coolify et exploitation** : service privé, volumes, association, santé, reconnexion et retour arrière.
6. **Pipeline média** : résultat exact de l’éditeur, mix des deux pistes, Opus, validation et isolation du patch.
7. **Qualité et lancement** : dépendances, essais de panne, critères de publication et ouverture progressive.

## Architecture retenue

```text
Navigateur : collection IndexedDB + WebP final + WAV déjà mixé
    │ upload volontaire, même origine, 4 Mio maximum
    ▼
Zapstick : garde HTTP → routes serveur Next.js
    │ réseau privé + secret de service
    ▼
whatsapp-bridge : SQLite + fichiers temporaires + worker média
    │ appareil associé, une seule instance
    ▼
WhatsApp : message entrant avec code → réponse à cet expéditeur
```

Le bridge est propriétaire de ses données. Aucun port, QR, fichier ou endpoint de téléchargement du bridge n’est public. Le site ne monte pas ses volumes. Conserver un accès réseau sortant à WhatsApp ; un réseau Docker totalement isolé couperait cette sortie.

### Contrat de transfert

Le navigateur conserve **avant le POST** un identifiant de transfert aléatoire de 128 bits et un secret de reçu indépendant de 256 bits dans un stockage local dédié, exclu des sauvegardes de collection. Cela permet de retrouver un transfert si la réponse au POST est perdue ou si le navigateur mobile est fermé. Après une réponse perdue, faire d’abord un GET sous ce reçu, puis reprendre la même demande si nécessaire ; ne pas créer d’emblée un nouvel identifiant ou code.

- `POST /api/whatsapp/transfers` : multipart avec manifeste versionné, langue, WebP final, WAV final facultatif. Secret de reçu dans `Authorization`. Réponse : identifiant, état, expiration, code et lien WhatsApp. Répéter une demande identique restitue le transfert existant ; un contenu différent pour le même identifiant produit un conflit.
- `GET /api/whatsapp/transfers/:id` : suivi sous le même secret. Identifiant inconnu ou secret incorrect : réponse indistinguable. Expiration détaillée uniquement au détenteur du reçu.
- `DELETE /api/whatsapp/transfers/:id` : annulation authentifiée et atomique tant que l’envoi n’a pas été remis au transport. Après cette remise, ne pas promettre un rappel du message.

Toutes les réponses sont `no-store`. Le code WhatsApp, aléatoire d’au moins 128 bits, est indépendant du reçu. Conserver des empreintes ; chiffrer le code seulement pour pouvoir restituer le même lien pendant sa validité. Aucun secret de suivi dans une URL.

Le code est une capacité au porteur : quelqu’un qui l’obtient avant utilisation pourrait réclamer le sticker. Le masquer dans les journaux, l’utiliser une seule fois et limiter sa durée réduit ce risque, sans supprimer le risque de divulgation par son détenteur.

### Réception et livraison

N’accepter que les nouveaux messages individuels entrants contenant le code attendu. Ignorer historiques, messages émis par le bot, groupes, diffusions et messages sans code ; ne pas répondre automatiquement à chaque entrée invalide.

La destination vient exclusivement de l’événement WhatsApp vérifié, y compris les identifiants `@lid` décrits dans la [migration Baileys](https://baileys.wiki/migration/v7). Aucun numéro destinataire n’est accepté du navigateur ou reconstruit à partir du code.

SQLite lie atomiquement le premier expéditeur au transfert, déduplique l’identifiant du message entrant et crée l’entrée d’envoi. Un seul worker média et un seul envoi natif à la fois pour le MVP.

États métier : réception → attente du code → en file → préparation → envoi → accepté par le transport ; puis confirmation de livraison lorsqu’elle est disponible. Sorties : annulé, expiré, échec ou résultat inconnu. Garder la distinction entre accepté et livré.

Un crash entre remise à WhatsApp et persistance de l’accusé peut laisser un résultat inconnu. Enregistrer l’identifiant transport, tenter une réconciliation et éviter un renvoi automatique aveugle. Ne pas promettre l’exactement-une-fois sur ce transport.

### Médias et montage audio

`Studio.save()` produit déjà le WebP final puis `Sticker.sound.blob`, un WAV rendu à la durée de l’animation terminée. Envoyer ces deux blobs seulement : pas de vidéo d’origine, de lien source, de collection, de `soundLayers` ni de paramètres à rejouer.

Le mix existant contient déjà l’extrait de chaque piste, son placement, son volume et ses fondus. Le serveur ne refait pas le montage. La piste 2 peut ainsi suivre la piste 1 tout en utilisant un extrait commençant à cinq secondes dans son fichier source.

Validation serveur avant admission à l’envoi :

- WebP RIFF valide, dimensions exactes 512 × 512, structure et sous-images bornées ; fixe ≤100 Kio, animé ≤500 Kio.
- Animation ≤6 secondes, durée brute de chaque frame ≥8 ms, nombre de frames et budget de décodage bornés. Le parseur de lecture remplace une durée nulle par 100 ms : ajouter une validation stricte des valeurs brutes, en respectant le [conteneur WebP](https://developers.google.com/speed/webp/docs/riff_container).
- WAV PCM16 réellement valide, mono/stéréo, 8–96 kHz, ≤2,4 Mio et ≤6,1 secondes ; durée sonore cohérente avec le WebP au niveau de l’arrondi des échantillons.
- Corps HTTP ≤4 Mio, manifeste ≤2 Kio, au plus deux fichiers. Ne pas se fier aux MIME, noms ou durées déclarés par le client.

Le bridge convertit le WAV en Ogg/Opus avec un profil fixé après le test Android. Conserver les silences et le timing ; ne pas appliquer de deuxième gain ou décalage. Vérifier le signal décodé après conversion, en tenant compte du préremplissage Opus. [Encodeur FFmpeg Opus](https://ffmpeg.org/ffmpeg-codecs.html#libopus-1).

Isoler l’intégration dans un adaptateur `sendSoundSticker()`. Le [patch étudié](https://github.com/DavidRamirez206/whatsapp-sound-sticker-bot/blob/d70e1784f4ad563fcc8d91925f811aad4d097f01/src/sticker-audio-patch.js) associe le son au hash du WebP : deux visuels identiques avec des sons différents pourraient se croiser. Sérialiser toute la préparation et l’émission, nettoyer l’association en `finally` et tester ce cas. Préférer une association propre à chaque message si l’adaptateur le permet.

### Limites initiales et effacement

Valeurs de départ à mesurer en préproduction : deux uploads simultanés, vingt transferts actifs au maximum, un FFmpeg à la fois, un envoi natif à la fois. Plafond dur de **100 Mio incluant médias, fichiers partiels, dérivés et réservations** ; refuser plus tôt lorsque la réserve d’une demande ne tient plus.

FFmpeg : chemins générés par le service, aucune URL ou argument utilisateur, lancement sans shell, entrée WAV explicite, protocoles bornés, sortie de diagnostic limitée, un thread et délai maximal initial de quinze secondes. Un timeout ou une annulation tue effectivement le processus.

Purger médias, codes et destinataires après la fin confirmée du traitement ou à expiration absolue des dix minutes. Contrôler l’échéance transactionnellement à la réclamation, au démarrage du traitement et avant remise au transport ; tuer aussi un FFmpeg actif à expiration. Aucun nouvel essai d’envoi après expiration. Nettoyage au démarrage, périodique et après annulation ; vérifier fichiers `.part`, orphelins, caches et états abandonnés. Ne pas conserver un JID brut en métadonnées terminales. Une purge serveur ne rappelle pas un message déjà remis à WhatsApp.

Conserver au plus 24 heures proposées des états minimaux et empreintes de déduplication sans média ni numéro. Prendre en compte SQLite/WAL, logs et caches ; vérifier la purge logique et les copies plutôt que promettre un effacement physique immédiat sur SSD. Les sauvegardes des médias temporaires et snapshots correspondants doivent être exclus ou le déploiement adapté.

Ajouter des budgets spécifiques création/suivi/expéditeur, des délais bornés et une fermeture à saturation. Le garde actuel voit le pair TCP : derrière Traefik, cette IP peut être commune. Les quotas globaux sont fiables ; un quota par IP nécessite une chaîne de proxy explicitement approuvée et un accès direct fermé. Ne pas croire arbitrairement `X-Forwarded-For`.

## Ordre de développement et livrables

### Lot 0 — Test du compte et des formats

Activer WhatsApp Business, préparer un prototype isolé, verrouiller Baileys et le patch identifié, associer le compte depuis une console privée, réaliser les essais Android décrits plus haut. Livrable : fiche de compatibilité et décision standard/sonore. Aucun bouton public avant cette preuve.

### Lot 1 — Service privé et session durable

Créer `services/whatsapp-bridge/` avec Dockerfile Node/FFmpeg, stockage SQLite, session, association privée, santé, verrou exclusif et reconnexion progressive. Deux volumes : `/data/auth` pour credentials et clés durables ; `/data/transfers` pour jobs et médias temporaires, sans sauvegarde. Remplacer le stockage de démonstration `useMultiFileAuthState` par un adaptateur durable transactionnel sauvegardant credentials **et** clés, conformément aux [recommandations Baileys](https://baileys.wiki/authentication/session-management).

Point de départ de ressources à vérifier : 1 CPU, 768 Mio mémoire, 128 processus, `/tmp` 64 Mio. Un seul processus actif et aucune session de production dans une preview. L’authentification ne doit jamais être clonée entre deux environnements actifs.

### Lot 2 — Transfert fiable et traitement borné

Implémenter les trois contrats, les capacités, l’idempotence, l’annulation, SQLite/outbox, la validation et les réservations de disque. Adapter précisément le garde HTTP : il refuse actuellement les POST, les corps et toutes les API sauf l’audio/health. Autoriser uniquement les chemins/méthodes canoniques nécessaires ; compter les octets en flux, avec contrepression, délai et arrêt sur déconnexion. Accepter un corps segmenté sous la même limite ; conserver tous les refus hors passerelle.

Ce lot peut avancer en parallèle du pipeline média dès que le contrat commun est figé. Livrable : cycle complet testé avec un faux transport, sans téléphone pour les tests automatiques.

### Lot 3 — Envoi natif et son

Brancher l’adaptateur statique/animé, puis l’option sonore validée au lot 0. Ajouter conversion Opus et vérification de synchronisation. Tester deux transferts du même WebP avec deux sons différents. L’indicateur sonore reste indépendant de celui de la passerelle.

### Lot 4 — Bouton mobile et huit langues

Créer un composant commun au résultat du Studio et à la fiche d’un sticker prêt (`isSticker:true`). Pour un média brut, conserver l’action de personnalisation avant envoi. Upload seulement au premier appui ; aucun upload au chargement d’une fiche. Figer l’identité et les blobs à cet appui : un changement de sticker ou une modification ne doit pas réutiliser le lien du résultat précédent.

États courts : « Recevoir sur WhatsApp », « Préparation… », « Ouvrir WhatsApp », « Transfert interrompu », « Code expiré », « WhatsApp momentanément indisponible ». Réutiliser le même code valide pour réouvrir. Préserver le résultat, le défilement et le reçu au retour depuis WhatsApp ; ne pas relancer l’upload automatiquement. Suspendre le suivi lorsque l’onglet est caché, espacer progressivement les requêtes et les arrêter à expiration ou état terminal. Conserver les téléchargements accessibles.

Cibles tactiles 48 px, focus visible, statut annoncé sobrement, zoom 200 %, clair/sombre et fr/en/pt-BR/es/de/zh-CN/ja/ru. Traduire aussi les erreurs et les rares réponses utiles du bot, avec la langue du transfert. Ajouter le nouveau composant à la liste inspectée par `tests/i18n.mjs` pour que ses traductions soient réellement vérifiées.

Corriger les mentions de confidentialité qui disent que les médias ne passent jamais par le serveur. Décrire l’exception volontaire, sa durée et le traitement de l’expéditeur dans les pages existantes, avec une seule précision près du bouton : « Transfert temporaire de ce sticker. » Les copies remises à WhatsApp ne relèvent pas de la purge de stockage temporaire Zapstick. L’effacement local annule au mieux les transferts connus avant d’effacer leurs reçus ; le TTL couvre une absence de réseau.

### Lot 5 — Préproduction et ouverture progressive

Tester avec un compte dédié distinct, d’abord en accès limité. Vérifier démarrage, reconnexion, disque plein, annulation, expiration et déploiement. `live` vérifie processus/stockage ; `ready` ajoute connexion WhatsApp et capacité disponible. Un bot déconnecté donne un refus temporaire de nouveaux transferts, sans arrêter le site ni provoquer une boucle de redémarrages.

Prévoir arrêt propre : suspendre l’admission, terminer ou qualifier les envois en cours, persister la session, fermer SQLite. Interdire le chevauchement de deux instances lors d’un déploiement ; un verrou côté session complète la configuration Coolify, dont le [mode de remplacement dépend du type d’application](https://coolify.io/docs/applications/deployments/rolling-updates).

Ouvrir d’abord fixe/animé, puis son uniquement après son GO. Retour arrière : désactiver l’admission et le bouton, suspendre la file, arrêter le bridge, revenir à l’image validée. Ne pas restaurer automatiquement d’anciennes clés Signal avec l’ancienne image. Les téléchargements et la création locale continuent.

### Effort prévisionnel

Ordre de grandeur : **six à dix jours de développement et de validation**, à réévaluer après le prototype Android. Ce n’est pas un engagement calendaire : le format sonore expérimental peut ajouter des investigations. Après fixation du contrat, les travaux service, transfert, média et interface peuvent avancer en parallèle ; l’ouverture publique attend la validation d’ensemble.

## Validation avant publication

- Formats : fixe, animé, son et deux pistes ; extrait à 5 s placé après la première piste ; silence initial, bord à 6 s, sauvegarde/rechargement et aucun double gain/décalage.
- Fichiers hostiles : faux MIME, RIFF tronqué, chunks débordants, frame nulle, WAV désaligné, durées divergentes et dépassement en cours de flux sans `Content-Length`.
- Reprise : double appui, réponse au POST perdue, rechargement mobile, code utilisé/expiré, deux expéditeurs concurrents, crash avant/après remise transport et accusé inconnu. Vérifier le TTL dans chaque transaction et à la reprise ; aucun retry ne le prolonge.
- Effacement : annulation avant remise, expiration pendant attente/traitement, redémarrage, fichiers partiels, disque et journaux/sauvegardes inspectés.
- Accès : mauvais reçu, code divulgué, alias de route, faux en-tête IP, groupes et anciens messages ignorés, aucun port/QR/média public, deuxième instance refusée.
- Usage : Android avec WhatsApp installé, retour après fermeture du navigateur, ordinateur/WhatsApp Web, absence de WhatsApp, réseau lent/hors ligne, huit langues et thèmes.
- Exploitation : service déconnecté avant upload, puis coupure après préparation du lien mais avant envoi du code ; reprise avec code encore valide et sans réexécuter l’historique. Tester saturation, timeout FFmpeg, redéploiement sans chevauchement et retour arrière sans doublon volontaire.
- Preuve physique : réception, favoris, réenvoi et transfert du sticker avec animation et, si activé, son conservé. Les tests de sérialisation ne remplacent pas ce contrôle.

## Fichiers de travail prévus

- Nouveau service : `services/whatsapp-bridge/` (session, SQLite, worker, média, transport, pairing, health, Dockerfile).
- Routes et contrat : `app/api/whatsapp/transfers/route.ts`, `app/api/whatsapp/transfers/[id]/route.ts`, `lib/server/whatsapp-bridge.ts` et modules de validation pure partagée.
- Interface : nouveau `components/zapstick/whatsapp-transfer.tsx`, intégration dans `studio.tsx` et `zapstick-app.tsx`, stockage des reçus et dictionnaires existants.
- Protections : `scripts/runtime-guard-server.mjs` et ses tests ; validation audio extraite de `lib/stickers/store.ts` sans dépendance IndexedDB côté serveur.
- Confidentialité : `lib/privacy/content.ts`, `lib/privacy/translations.ts`, effacement local dans `store.ts`.
- Déploiement : `docker-compose.yml`, `.env.example`, `docs/DEPLOYMENT.md`, procédure privée d’association/révocation ; variables serveur, jamais de secrets dans `NEXT_PUBLIC_*`, l’image ou Git.

## Sources vérifiées pour le plan

- [Lien de conversation avec texte prérempli — WhatsApp](https://faq.whatsapp.com/5913398998672934).
- [Exigences officielles des stickers Android](https://github.com/WhatsApp/stickers/blob/main/Android/README.md#sticker-art-and-app-requirements) ; Zapstick conserve sa propre limite de six secondes.
- [Stickers dans l’API officielle](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/sticker-messages/).
- [Baileys : versions](https://github.com/WhiskeySockets/Baileys/releases), [schéma étudié](https://github.com/WhiskeySockets/Baileys/blob/v7.0.0-rc14/WAProto/WAProto.proto), [session](https://baileys.wiki/authentication/session-management), [migration et identifiants](https://baileys.wiki/migration/v7).
- [Prototype sonore : patch figé](https://github.com/DavidRamirez206/whatsapp-sound-sticker-bot/blob/d70e1784f4ad563fcc8d91925f811aad4d097f01/src/sticker-audio-patch.js) et [envoi](https://github.com/DavidRamirez206/whatsapp-sound-sticker-bot/blob/d70e1784f4ad563fcc8d91925f811aad4d097f01/src/whatsapp/send.js).
- [Conteneur WebP](https://developers.google.com/speed/webp/docs/riff_container), [FFmpeg Opus](https://ffmpeg.org/ffmpeg-codecs.html#libopus-1).
- [Coolify Compose](https://coolify.io/docs/applications/builds/docker-compose#compose-networking), [volumes](https://coolify.io/docs/applications/configuration/persistent-storage), [déploiements](https://coolify.io/docs/applications/deployments/rolling-updates).
- [OWASP uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) et [journalisation](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).
