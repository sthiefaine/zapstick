# Zapstick

Un atelier personnel pour collectionner des médias et créer des stickers WhatsApp. Interface en français, adaptée au mobile.

## Démarrer

Node.js 22.13+ est requis.

```sh
npm install
npm run dev
```

La version de production se construit avec `npm run build`. `npm start` lance le Worker construit.

## Fonctionnalités

- Galerie persistante dans IndexedDB, favoris, recherche, tri, vues grille et liste.
- Packs fixes ou animés : création, renommage, couleur, ajout/retrait et suppression sans perte des médias.
- Import local PNG/JPEG/WebP/GIF/MP4/WebM, jusqu’à 20 Mo.
- Import des publications X publiques par FxTwitter API v2 ; liens directs de médias X, Giphy et Tenor.
- Atelier avec zoom, rotation, texte et choix du fond. Un fond transparent conserve la transparence de la source ; il ne détoure pas automatiquement une photo.
- WebP fixe en 512 × 512, 100 Ko maximum ; GIF/vidéo vers WebP animé, 500 Ko maximum, extrait de 6 secondes maximum. Compression adaptée au poids.
- Export individuel WebP, export de sélection/pack en ZIP, sauvegarde/restauration de la collection en JSON.
- 16 illustrations vectorielles originales fournies comme collection de départ.

## Données et limites

La collection est propre au navigateur et à l’origine du site : aucun compte, stockage serveur ou synchronisation entre appareils. Exporter une sauvegarde pour la transférer ou avant de supprimer les données du navigateur. Les imports sont traités dans le navigateur ; les liens X sont transmis à FxTwitter. Le proxy média accepte seulement des hôtes explicitement autorisés, refuse les redirections et limite le téléchargement à 20 Mo.

L’import X dépend d’un service tiers et du caractère public du post. Les pages Giphy/Tenor ne sont pas résolues : utiliser un lien direct vers leur média ou importer le fichier localement. Le GIF fourni en exemple par l’utilisateur est en réalité servi en MP4 par X.

L’installation directe de packs WhatsApp requiert une intégration mobile native. Le site exporte les fichiers à importer dans une application de stickers compatible ; un ZIP ne peut pas s’installer directement dans WhatsApp. Aucune installation sur un téléphone réel n’a été vérifiée. Les packs WhatsApp attendent 3 à 30 stickers du même type.

Modifier un WebP animé dans l’atelier crée une variante fixe ; l’original animé reste exportable. GIF et MP4 peuvent être convertis en animation. Le navigateur doit prendre en charge l’encodage Canvas WebP et le décodage du format source.

## Architecture

React 19 / Vinext / Vite, Worker Cloudflare. Routes serveur `/api/import` (résolution d’un lien) et `/api/media` (téléchargement borné sur liste d’hôtes autorisés). IndexedDB conserve les objets Blob ; aucun fichier utilisateur n’est stocké dans le dépôt.

Références : [spécifications WhatsApp](https://github.com/WhatsApp/stickers/tree/main/Android), [API FxTwitter](https://docs.fxembed.com/api/introduction/).
