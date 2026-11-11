# Zapstick

Un atelier personnel pour collectionner des médias et créer des stickers WhatsApp. Interface mobile disponible en français, anglais, portugais brésilien, espagnol, allemand, chinois simplifié, japonais et russe.

## Démarrer

Node.js 22.13+ est requis.

```sh
npm ci
npm run dev
```

La version de production se construit avec `npm run build`. `npm start` lance le serveur Node.js standalone complet sur le port 3000. Le `Dockerfile` est prêt pour Coolify : voir [le guide de déploiement](docs/DEPLOYMENT.md).

## Fonctionnalités

- Interface conçue pour le mobile : atelier interactif sur un seul écran, outils intégrés, identité vert pâle, logo sticker et interactions tactiles.
- Thèmes clair, sombre et système ; huit langues avec URL propre, sélecteur de langue avec drapeaux dans le header, choix mémorisés et document traduit.
- Accessibilité : navigation au clavier, commandes alternatives aux gestes, focus visible, contraste et mode de réduction des animations.
- Confidentialité et mentions légales de Clairdev, export et effacement local de la collection et des préférences.
- Métadonnées de partage Open Graph/Twitter, image de partage, URL canoniques, hreflang, sitemap et indexation activée explicitement pour un domaine public HTTPS.
- Collection persistante dans IndexedDB, favoris, recherche et filtres. Collections de rangement personnalisées, sélection et déplacement groupés, renommage et suppression annulable sans perte de médias.
- Glisser-déposer des stickers entre collections, ordre manuel des stickers et des collections, poignées tactiles et navigation au clavier. Le rangement et l’ordre sont inclus dans les sauvegardes ; les anciennes sauvegardes restent compatibles. Import multiple de fichiers depuis la collection ou par dépôt de fichiers.
- Partage de Zapstick avec message d’invitation : partage natif, copie du lien ou lien sélectionnable. Carte d’import animée brièvement, avec respect de la réduction des animations.
- Déplacement du visuel au doigt et zoom à deux doigts, avec commandes de cadrage alternatives.
- Suppressions annulables pendant 12 secondes.
- Packs fixes ou animés : création, renommage, couleur, ajout/retrait et suppression sans perte des médias.
- Import local PNG/JPEG/WebP/GIF/MP4/WebM, jusqu’à 20 Mo.
- Import des publications X publiques par FxTwitter API v2 ; liens directs de médias X, Giphy et Tenor.
- Bouton « Coller et importer » : lecture du presse-papiers au clic et import immédiat du lien. Nécessite HTTPS ou localhost et l’autorisation du navigateur ; le collage manuel reste disponible.
- Atelier avec aperçu animé, déplacement, zoom, rotation et choix du fond. Texte déplaçable avec trois polices, couleurs et fond ; jusqu’à huit émojis déplaçables et redimensionnables, depuis la grille ou le clavier du téléphone.
- Barre de montage avec vignettes et poignées pour choisir l’extrait d’un GIF ou d’une vidéo ; sélection et aperçu au clavier également disponibles. Le mode fixe capture l’image choisie.
- Détourage des images fixes avec U²-Net-P, calculé sur l’appareil : chargement au clic, progression, annulation et rétablissement du fond original. Premier usage : environ 19 Mo de moteur et modèle ; qualité variable selon l’image. Voir [les détails et licences](docs/BACKGROUND_REMOVAL.md).
- WebP fixe en 512 × 512, 100 Ko maximum ; GIF/vidéo vers WebP animé, 500 Ko maximum, extrait de 6 secondes maximum. Compression adaptée au poids, sans marge transparente ajoutée par défaut.
- Téléchargement galerie : WebP fixe ou vrai GIF animé ; WebP animé disponible en option. Export de sélection/pack en ZIP et sauvegarde/restauration de la collection en JSON.
- Encodage GIF local dans un worker, avec progression et annulation ; compatible avec les WebP animés déjà présents dans la collection.
- Galerie et packs vides au départ. Les exemples de la première version sont retirés automatiquement au chargement et à la restauration d’une sauvegarde, sans supprimer les médias importés.

## Données et limites

La collection est propre au navigateur et à l’origine du site : aucun compte, stockage serveur ou synchronisation entre appareils. Exporter une sauvegarde pour la transférer ou avant de supprimer les données du navigateur. Les imports sont traités dans le navigateur. Les liens X sont résolus directement auprès de FxTwitter, puis le média est téléchargé directement depuis son hébergeur, sans relais par Zapstick. Les téléchargements sont limités à des hôtes explicitement autorisés et à 20 Mo. Les restrictions CORS des hébergeurs peuvent empêcher un import ; utiliser alors un fichier local.

L’import X dépend d’un service tiers et du caractère public du post. Les pages Giphy/Tenor ne sont pas résolues : utiliser un lien direct vers leur média ou importer le fichier localement. Les médias animés X peuvent être servis en MP4.

Le détourage télécharge ses poids depuis Hugging Face et son CDN uniquement lorsque demandé ; aucune photo ne leur est envoyée. Le moteur est servi par Zapstick. Les poids sont mis en cache localement et ce cache est vidé avec les données de l’app. Les fichiers animés ne sont pas détourés ; une photo statique est nécessaire. Un fond transparent seul conserve la transparence de la source sans lancer de détourage.

Pour la galerie Android, les animations sont téléchargées en GIF. Le WebP animé reste le format conservé dans la collection et peut être téléchargé séparément. Un fichier GIF garde plusieurs images dans le téléchargement ; WhatsApp peut l’envoyer comme GIF. La création d’un **sticker animé** depuis la galerie dépend de la version de WhatsApp et n’est pas garantie par Zapstick. Les images fixes peuvent être choisies via WhatsApp → Stickers → Créer. Les ZIP doivent être décompressés. Le parcours n’a pas été vérifié sur un téléphone réel ; les packs Zapstick contiennent jusqu’à 30 éléments du même type.

Modifier un WebP animé dans l’atelier crée une variante fixe ; l’original animé reste exportable. GIF et MP4 peuvent être convertis en animation. Le navigateur doit prendre en charge l’encodage Canvas WebP et le décodage du format source.

## Architecture

React 19 / TypeScript / Next.js 16, serveur Node.js standalone conteneurisé pour Coolify. L’ancien hébergement Sites a été désactivé ; les scripts historiques Sites sont séparés du parcours principal. Aucun endpoint serveur d’import : FxTwitter et les médias sont appelés directement par le navigateur avec des requêtes CORS sans identifiants. IndexedDB conserve les objets Blob ; aucun fichier utilisateur n’est stocké dans le dépôt.

## Déploiement et vérification

```sh
npm run typecheck
node --test tests/*.mjs
docker build -t zapstick .
docker run --rm -p 3000:3000 zapstick
```

Renseigner le domaine public et les coordonnées réelles de l’hébergeur dans les variables de build décrites dans [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Par défaut, l’indexation est désactivée ; la basculer explicitement après configuration du domaine HTTPS. Aucun volume serveur n’est nécessaire pour les collections.

Une collection est liée à son origine (domaine et port) : restaurer sa sauvegarde JSON pour migrer vers une nouvelle adresse. L’effacement local ne supprime pas les copies déjà téléchargées.

Références : [création depuis la galerie dans WhatsApp](https://faq.whatsapp.com/1056840314992666), [spécifications WhatsApp](https://github.com/WhatsApp/stickers/tree/main/Android), [API FxTwitter](https://docs.fxembed.com/api/introduction/).
