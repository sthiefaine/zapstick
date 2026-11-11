# Détourage local

Le bouton « Retirer le fond » utilise le modèle généraliste léger **U²-Net-P** et **ONNX Runtime Web 1.31.1**. L’image reste dans le navigateur ; aucun service d’inférence ne la reçoit. Le détourage est automatique, avec une qualité variable selon le sujet, le contraste et les détails fins. Il concerne les images fixes, pas les GIF ou vidéos.

## Chargement et confidentialité

Le montage de l’interface ne télécharge ni modèle, ni moteur d’inférence. Une action explicite déclenche le téléchargement du modèle, puis le chargement du worker et du moteur local :

- Modèle : `BritishWerewolf/U-2-Netp`, révision `7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8`, **4 574 861 octets**. URL épinglée dans `lib/stickers/background-removal-core.ts`. Taille et SHA-256 sont vérifiées avant chaque utilisation, y compris depuis le cache.
- WASM : **14 848 852 octets**, module de démarrage **24 738 octets**, plus environ 75 Ko de JavaScript. Ces fichiers sont servis par Zapstick, sous `/vendor/onnx/1.31.1/`. Le premier usage représente environ **19,5 Mo** hors compression et dépend du cache du navigateur.
- Seul le modèle appelle un domaine tiers : `huggingface.co`, avec redirection vers son CDN (vérifié le 11 novembre 2026 : `us.aws.cdn.hf.co`). Les noms d’hôtes du CDN Hugging Face peuvent évoluer. Ces services reçoivent l’IP et la demande de téléchargement, avec leurs règles de confidentialité et transferts internationaux. Les requêtes n’envoient ni cookie ni référent et ne contiennent aucune image.

Le modèle est conservé dans le cache dédié `zapstick-background-model-v1` quand le navigateur le permet. Les fichiers du moteur peuvent aussi être conservés par le cache HTTP ordinaire du navigateur. `clearBackgroundModelCache()` annule les opérations actives, attend les écritures éventuelles puis supprime le cache dédié : un téléchargement interrompu ne le recrée pas après l’effacement. L’effacement général doit appeler cette fonction.

## Limites et arrêt

Les JPG, PNG et WebP fixes sont inspectés avant décodage : maximum 20 Mo et 16 millions de pixels. Les dimensions de sortie sont limitées à 1024 pixels sur le grand côté. Le modèle travaille en 320 × 320 ; le masque est rééchantillonné sur la sortie et conserve la transparence existante. Le worker utilise un seul thread WASM, sans WebGPU, sans COOP/COEP, avec une seule opération active. Un appareil peu doté en mémoire peut néanmoins refuser l’inférence.

L’arrêt du worker interrompt réellement le calcul. Une annulation, le remplacement de la source ou le démontage du contrôle coupe aussi le téléchargement en cours. Le délai total est limité à 180 secondes. Une erreur ne remplace jamais la source ; `onResult` n’est appelé qu’avec un PNG terminé.

## API d’intégration

`BackgroundRemovalControl` reçoit `blob`, `disabled?`, `onResult(blob)` et `onBusyChange?(busy)`. Le bouton Annuler reste actif pendant le travail. Son style utilise les classes `background-removal-control`, `background-removal-actions`, `background-removal-note`, `background-removal-status` et les boutons existants. Les traductions sont isolées dans `lib/i18n/background-translations.ts`.

`removeImageBackground(blob, {signal?, onProgress?, timeoutMs?})` peut aussi être appelé directement côté client. La progression distingue préparation, téléchargement quantifié du modèle et traitement local indéterminé.

`npm run prepare:background-runtime` copie uniquement les fichiers de moteur verrouillés et sa licence vers `public`. Cette étape est exécutée avant `npm run dev` et `npm run build:coolify`. Aucun modèle n’est téléchargé pendant le build. `public/vendor/onnx` est généré et ignoré par Git.

## Licences et sources

Les notices distribuées sont disponibles dans `public/licenses` et sur `/licenses/NOTICE.txt` :

- [U²-Net, dépôt original et licence Apache 2.0](https://github.com/xuebinqin/U-2-Net) ; [conversion ONNX et licence des poids](https://huggingface.co/BritishWerewolf/U-2-Netp).
- [ONNX Runtime, licence MIT](https://github.com/microsoft/onnxruntime/blob/v1.31.1/LICENSE) ; [documentation de déploiement Web](https://onnxruntime.ai/docs/tutorials/web/deploy.html).

Le choix exclut les poids BRIA RMBG soumis à une autorisation commerciale et n’ajoute aucune dépendance AGPL. Aucune qualité parfaite n’est annoncée.

## Validation

`node --test tests/background-removal.mjs` vérifie les limites avant décodage, le refus des animations, les masques invalides, l’absence de téléchargement pour une entrée incorrecte, l’annulation du worker, l’usage du cache sans réseau, l’effacement après une écriture engagée et les traductions complètes dans huit langues.

Une inférence réelle du fichier ONNX épinglé avec ONNX Runtime Web/WASM a été effectuée le 11 novembre 2026 sur le portrait officiel de [Grace Hopper, James S. Davis/US Navy](https://commons.wikimedia.org/wiki/File:Grace_Hopper.jpg), indiqué dans le domaine public et relié à la collection NH 96919-KN du Naval History and Heritage Command. Le fichier de test reste hors du dépôt (`/tmp/zapstick-background-test.jpg`). Le prétraitement et le masque de la production ont été utilisés : entrée `[1, 3, 320, 320]`, sortie `[1, 1, 320, 320]`, exécution et initialisation en environ 1,4 seconde sur la machine de développement. Ce temps ne préjuge pas des performances mobiles.

Le sujet est conservé, mais le modèle léger conserve aussi des fragments du drapeau derrière lui : cette limite justifie l’avertissement sur le résultat et l’action de restauration de l’original. Les contrôles unitaires ne remplacent pas la vérification du téléchargement et du résultat dans un navigateur réel. Le point d’entrée worker est compilé sous Turbopack, et les fichiers locaux du moteur répondent avec les types MIME WebAssembly/JavaScript attendus.
