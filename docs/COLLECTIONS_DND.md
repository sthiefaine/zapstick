# Glisser-déposer des collections

Zapstick utilise l’API classique de dnd-kit : `@dnd-kit/core` **6.3.1**, `@dnd-kit/sortable` **10.0.0**, `@dnd-kit/utilities` **3.2.2**. Les trois versions sont épinglées dans `package.json` et le lockfile. Elles sont sous licence MIT. Aucun modèle, CDN, service d’inférence ou autre fichier distant n’est nécessaire pour le glisser-déposer : le code est servi avec Zapstick.

Les contraintes de dépendances publiées acceptent React `>=16.8.0`, donc React 19.2.6 ; Sortable 10 demande Core `^6.3.0`. Ce contrat de versions ne vaut pas certification spécifique à Next 16 : la validation réelle doit couvrir compilation, hydratation, clavier et tactile dans l’application. La documentation officielle désigne désormais cette API comme « Legacy » ; la nouvelle API `@dnd-kit/react` 0.x n’est pas utilisée.

## Contrat d’intégration

- Le tableau et ses hooks vivent dans un composant `'use client'`. `DndContext` fournit un `id` stable et unique ainsi que les capteurs partagés. Le typage installé expose `accessibility.announcements`, `accessibility.screenReaderInstructions` et `accessibility.restoreFocus`.
- `useSensors(useSensor(MouseSensor, …), useSensor(TouchSensor, …), useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}))` permet les trois modes d’entrée. Les valeurs de départ choisies pour Zapstick peuvent être : distance souris 8 px ; appui tactile de 250 ms, tolérance 5 px. Il s’agit de choix UX, à ajuster après essai mobile. Pour chaque capteur, contrainte de distance et contrainte de délai sont mutuellement exclusives.
- Une poignée focusable reçoit les `listeners`, `attributes` et `setActivatorNodeRef` de `useSortable`. La carte reçoit `setNodeRef` et sa transformation via `CSS.Transform.toString(transform)` de Utilities. Les boutons de menu ou de lecture restent utilisables sans commencer un déplacement.
- Préserver le défilement tactile normal en dehors de la poignée ; ne pas appliquer `touch-action: none` au tableau entier. Les activations lentes doivent être annulées si le doigt se déplace au-delà de la tolérance avant le délai.
- Chaque liste possède son `SortableContext` ; `items` reprend exactement les IDs dans l’ordre rendu. Les IDs des collections et des médias sont stables et distincts. La stratégie de tri doit correspondre à la disposition réelle (`rectSortingStrategy` pour une grille, `verticalListSortingStrategy` pour une liste verticale).
- `DragOverlay` reste monté ; seul son enfant est conditionnel. L’aperçu est un composant visuel, sans second `useSortable` portant le même ID. Cette séparation est recommandée pour déplacer une carte entre conteneurs ou à travers une zone défilante.
- Les flèches réordonnent, Espace/Entrée saisissent et déposent, Échap annule. Traduire les annonces et instructions du lecteur d’écran ; elles doivent correspondre aux touches réellement actives. Une action explicite « Déplacer vers… » complète le geste, y compris pour les listes vides et les utilisateurs qui ne glissent pas.
- Ne persister que les mouvements terminés valides. `over === null` et l’annulation conservent l’état précédent. Les opérations en cours, la sélection de plusieurs cartes et les cibles vides doivent être testées séparément.

## Sources primaires

- [Installation de l’API classique](https://dndkit.com/legacy/introduction/installation/).
- [Versions et dépendances Core 6.3.1](https://github.com/clauderic/dnd-kit/blob/@dnd-kit/core@6.3.1/packages/core/package.json), [Sortable 10.0.0](https://github.com/clauderic/dnd-kit/blob/@dnd-kit/sortable@10.0.0/packages/sortable/package.json).
- [Sortable, useSensors et sortableKeyboardCoordinates](https://dndkit.com/legacy/presets/sortable/overview/), [useSortable](https://dndkit.com/legacy/presets/sortable/usesortable/).
- [MouseSensor](https://dndkit.com/legacy/api-documentation/sensors/mouse/), [TouchSensor](https://dndkit.com/legacy/api-documentation/sensors/touch/), [KeyboardSensor](https://dndkit.com/legacy/api-documentation/sensors/keyboard/).
- [DragOverlay et conteneurs défilants](https://dndkit.com/legacy/api-documentation/draggable/drag-overlay/), [accessibilité](https://dndkit.com/legacy/guides/accessibility/).
- [Licence MIT du projet](https://github.com/clauderic/dnd-kit/blob/@dnd-kit/core@6.3.1/LICENSE).
