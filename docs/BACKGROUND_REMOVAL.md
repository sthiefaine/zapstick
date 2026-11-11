# Détourage local

Le bouton « Retirer le fond » utilise le modèle généraliste léger **U²-Net-P** et **ONNX Runtime Web 1.31.1**. Les images et les frames d’animation restent dans le navigateur ; aucun service d’inférence ne les reçoit. Le détourage est automatique, avec une qualité variable selon le sujet, le contraste et les détails fins. Il prend en charge les images fixes et les animations préparées localement en WebP par l’atelier. Le modèle traite les frames séparément : les contours peuvent varier légèrement entre deux images.

## Chargement et confidentialité

Le montage de l’interface ne télécharge ni modèle, ni moteur d’inférence. Une action explicite déclenche le téléchargement du modèle, puis le chargement du worker et du moteur local :

- Modèle : `BritishWerewolf/U-2-Netp`, révision `7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8`, **4 574 861 octets**. URL épinglée dans `lib/stickers/background-removal-core.ts`. Taille et SHA-256 sont vérifiées avant chaque utilisation, y compris depuis le cache.
- WASM : **14 848 852 octets**, module de démarrage **24 738 octets**, plus environ 75 Ko de JavaScript. Ces fichiers sont servis par Zapstick, sous `/vendor/onnx/1.31.1/`. Le premier usage représente environ **19,5 Mo** hors compression et dépend du cache du navigateur.
- Seul le modèle appelle un domaine tiers : `huggingface.co`, avec redirection vers son CDN (vérifié le 11 novembre 2026 : `us.aws.cdn.hf.co`). Les noms d’hôtes du CDN Hugging Face peuvent évoluer. Ces services reçoivent l’IP et la demande de téléchargement, avec leurs règles de confidentialité et transferts internationaux. Les requêtes n’envoient ni cookie ni référent et ne contiennent aucune image.

Le modèle est conservé dans le cache dédié `zapstick-background-model-v1` quand le navigateur le permet. Les fichiers du moteur peuvent aussi être conservés par le cache HTTP ordinaire du navigateur. Les images fixes et les animations partagent le même cache et la même exclusion des opérations concurrentes. `clearBackgroundModelCache()` annule les deux types d’opération, attend les écritures éventuelles puis supprime le cache dédié : un téléchargement interrompu ne le recrée pas après l’effacement. L’effacement général appelle cette fonction.

## Limites et arrêt

Les JPG, PNG et WebP fixes sont inspectés avant décodage : maximum 20 Mo et 16 millions de pixels. Les dimensions de sortie sont limitées à 1024 pixels sur le grand côté. Le modèle travaille en 320 × 320 ; le masque est rééchantillonné sur la sortie et conserve la transparence existante. Le worker utilise un seul thread WASM, sans WebGPU, sans COOP/COEP, avec une seule opération active. Un appareil peu doté en mémoire peut néanmoins refuser l’inférence.

Pour les animations, le moteur reçoit un WebP de **512 × 512**, préparé sans texte, émojis ni transformation de cadrage par l’atelier. La durée admise est de **0,25 à 6 secondes**. Les entrées à 12 images/s sont acceptées ; le moteur choisit au plus **48 frames à 8 images/s**, fusionne les répétitions d’une même frame et réattribue les durées à la milliseconde pour conserver exactement la durée totale et le nombre de lectures. Ce rééchantillonnage peut déplacer une transition d’environ une frame de sortie. La sortie est un vrai WebP animé de 512 × 512 avec alpha progressif, et non une image fixe renommée.

Les frames WebP sont décodées séquentiellement avec `parseWebpAnimation` / `decodeWebpFrames` et `createImageBitmap`, sans dépendre d’ImageDecoder. Le worker garde une seule session ONNX pour toute l’animation. Une surface d’entrée, une surface de masque et une surface de résultat sont réutilisées ; les Tensor d’entrée et toutes les sorties d’inférence sont libérés après chaque frame. Les frames RGB/RGBA ne sont jamais accumulées dans un tableau. Seuls les octets WebP déjà compressés sont conservés pour l’assemblage final, avec une limite de **12 Mo** pour l’entrée et la sortie. Les frames complètement transparentes restent transparentes sans inférence.

L’arrêt du worker interrompt réellement le calcul. Une annulation, le remplacement de la source ou le démontage du contrôle coupe aussi le téléchargement en cours. Le délai total est plafonné à **180 secondes pour une image fixe** et **360 secondes pour une animation**, téléchargement inclus. Une erreur ne remplace jamais la source ; le résultat n’est rendu qu’une fois le PNG ou le WebP animé entièrement terminé. La source et les overlays restent gérés séparément par l’atelier pour permettre la restauration.

## API d’intégration

`BackgroundRemovalControl` reçoit `blob`, `disabled?`, `onResult(blob)` et `onBusyChange?(busy)`. Le bouton Annuler reste actif pendant le travail. Son style utilise les classes `background-removal-control`, `background-removal-actions`, `background-removal-note`, `background-removal-status` et les boutons existants. Les traductions sont isolées dans `lib/i18n/background-translations.ts`.

`removeImageBackground(blob, {signal?, onProgress?, timeoutMs?})` peut aussi être appelé directement côté client. La progression distingue préparation, téléchargement quantifié du modèle et traitement local indéterminé.

`removeAnimatedBackground(blob, {signal?, onProgress?, timeoutMs?})` reçoit le WebP préparé et renvoie un `Promise<Blob>` de type `image/webp`. La progression utilise le même `BackgroundProgress` : `{stage:'preparing'|'downloading'|'processing', percent?:number}`. Pendant le traitement animé, `processing.percent` compte les frames d’inférence terminées, encodage compris. Les erreurs `invalid-animation`, `animation-too-large` et `encoding` s’ajoutent aux codes statiques existants. Un timeout demandé au-delà de 360 secondes est plafonné.

`npm run prepare:background-runtime` copie uniquement les fichiers de moteur verrouillés et sa licence vers `public`. Cette étape est exécutée avant `npm run dev` et `npm run build:coolify`. Aucun modèle n’est téléchargé pendant le build. `public/vendor/onnx` est généré et ignoré par Git.

## Licences et sources

Les notices distribuées sont disponibles dans `public/licenses` et sur `/licenses/NOTICE.txt` :

- [U²-Net, dépôt original et licence Apache 2.0](https://github.com/xuebinqin/U-2-Net) ; [conversion ONNX et licence des poids](https://huggingface.co/BritishWerewolf/U-2-Netp).
- [ONNX Runtime, licence MIT](https://github.com/microsoft/onnxruntime/blob/v1.31.1/LICENSE) ; [documentation de déploiement Web](https://onnxruntime.ai/docs/tutorials/web/deploy.html).

Le choix exclut les poids BRIA RMBG soumis à une autorisation commerciale et n’ajoute aucune dépendance AGPL. Aucune qualité parfaite n’est annoncée.

## Validation

`node --test tests/background-removal.mjs tests/background-removal-animated.mjs` vérifie les limites avant décodage, le refus des animations par l’API statique, les masques invalides, l’absence de téléchargement pour une entrée incorrecte, l’annulation du worker, l’usage du cache sans réseau, l’effacement après une écriture engagée et les traductions complètes dans huit langues.

Les tests animés vérifient aussi le plan de 72 frames vers au plus 48 inférences, la durée totale, la concurrence entre images fixes et animations, le timeout et l’effacement pendant un calcul. Le pipeline est exercé avec un décodeur de WebP réel, un résultat d’inférence contrôlé et un encodage WebP réel : une seule session, tous les Tensor libérés, alpha intermédiaire, 512 × 512, boucle 3 et durée de 250 ms sont contrôlés après redécodage. Ce test contrôlé vérifie le pipeline ; il ne prétend pas mesurer la qualité du modèle.

Une vérification statique couvre aussi la fermeture du bitmap caméra avant la création de la session ONNX, puis le retour d’un vrai PNG avec alpha. Elle évite de garder les pixels d’une grande photo en mémoire pendant l’inférence.

Une inférence réelle du fichier ONNX épinglé avec ONNX Runtime Web/WASM a été effectuée le 11 novembre 2026 sur le portrait officiel de [Grace Hopper, James S. Davis/US Navy](https://commons.wikimedia.org/wiki/File:Grace_Hopper.jpg), indiqué dans le domaine public et relié à la collection NH 96919-KN du Naval History and Heritage Command. Le fichier de test reste hors du dépôt (`/tmp/zapstick-background-test.jpg`). Le prétraitement et le masque de la production ont été utilisés : entrée `[1, 3, 320, 320]`, sortie `[1, 1, 320, 320]`, exécution et initialisation en environ 1,4 seconde sur la machine de développement. Ce temps ne préjuge pas des performances mobiles.

Le sujet est conservé, mais le modèle léger conserve aussi des fragments du drapeau derrière lui : cette limite justifie l’avertissement sur le résultat et l’action de restauration de l’original. Les contrôles unitaires ne remplacent pas la vérification du téléchargement et du résultat dans un navigateur réel. Le point d’entrée worker est compilé sous Turbopack, et les fichiers locaux du moteur répondent avec les types MIME WebAssembly/JavaScript attendus.

Une validation animée réelle a été effectuée dans le navigateur le 11 novembre 2026 à partir d’un portrait animé de 1,2 seconde : téléchargement du modèle, inférence locale, aperçu avec transparence, création, retour en collection et téléchargements WebP/GIF. Le GIF téléchargé (`zapstick-animated-background.gif`) a été redécodé : 512 × 512, 15 frames différentes, durée totale de 1 200 ms, boucle infinie et alpha minimum 0 / maximum 255 sur chaque frame. Le WebP animé a également été téléchargé (environ 397 Ko). Les fragments résiduels du drapeau restent visibles, conformément à la limite de qualité annoncée.

Le test a également identifié un comportement d’OffscreenCanvas : le probe d’encodage doit créer son contexte 2D et dessiner avant `convertToBlob`. L’absence de contexte provoquait un échec avant toute inférence. Ce probe est désormais exercé par la suite de tests. Les échecs techniques peuvent produire un diagnostic court dans la console du thread principal, avec l’étape et le type d’erreur ; aucune image, frame ou Tensor n’y est journalisé.
