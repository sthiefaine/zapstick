/** Public publisher details, supplied by the site owner. No legal status is inferred. */
export const privacyConfig = {
  operatorName: process.env.NEXT_PUBLIC_SITE_OPERATOR_NAME?.trim() || 'Clairdev',
  operatorCountry: process.env.NEXT_PUBLIC_SITE_OPERATOR_COUNTRY?.trim() || 'France',
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL?.trim() || 'simonnou.thiefaine@gmail.com',
  hosting: process.env.NEXT_PUBLIC_SITE_HOSTING?.trim() || '',
  operatorAddress: process.env.NEXT_PUBLIC_SITE_OPERATOR_ADDRESS?.trim() || '',
  operatorLegalStatus: process.env.NEXT_PUBLIC_SITE_OPERATOR_LEGAL_STATUS?.trim() || '',
  operatorRegistration: process.env.NEXT_PUBLIC_SITE_OPERATOR_REGISTRATION?.trim() || '',
  publicationDirector: process.env.NEXT_PUBLIC_SITE_PUBLICATION_DIRECTOR?.trim() || '',
};

export const privacySections = [
  {
    title: 'Tes fichiers restent sur ton appareil',
    body: 'Les images, vidéos, stickers, noms, favoris et packs sont conservés dans IndexedDB, dans ton navigateur. Ils ne sont pas envoyés au serveur Zapstick. Tu peux les modifier, les exporter ou les supprimer dans l’app.',
  },
  {
    title: 'Pourquoi ces données sont utilisées',
    body: 'Les fonctions demandées — import, création, organisation et sauvegarde locale — servent à fournir le service (article 6.1.b du RGPD, lorsqu’il s’applique). Les informations de connexion nécessaires à sa sécurité relèvent de l’intérêt légitime à le protéger (article 6.1.f). Les préférences techniques appliquent tes choix, sans suivi publicitaire.',
  },
  {
    title: 'Préférences et traceurs',
    body: 'Zapstick mémorise la langue et le thème pour respecter tes choix. L’app n’intègre ni publicité ni mesure d’audience. Elle n’utilise pas de traceurs publicitaires.',
  },
  {
    title: 'Quand tu importes un lien',
    body: 'Pour un lien X, ton navigateur contacte FxTwitter pour trouver le média, puis son hébergeur pour le télécharger. Les aperçus de médias et les liens externes contactent aussi leurs sites respectifs. Ces services reçoivent notamment ton adresse IP et le lien demandé ; leurs règles de confidentialité et leurs éventuels transferts internationaux s’appliquent.',
  },
  {
    title: 'Hébergement et journaux techniques',
    body: 'L’hébergeur peut traiter des informations de connexion, comme l’adresse IP et des journaux techniques, pour fournir et sécuriser le site. Ils sont distincts de la collection locale. Les conditions et durées de conservation dépendent de l’hébergeur de cette instance.',
  },
  {
    title: 'Durée de conservation',
    body: 'La collection et les préférences restent dans le navigateur jusqu’à leur suppression, la réinitialisation du site ou l’effacement par le navigateur. Une sauvegarde téléchargée reste sur ton appareil jusqu’à ce que tu la supprimes. Les données locales ne sont pas synchronisées entre appareils.',
  },
  {
    title: 'Tes droits et tes choix',
    body: 'Tu peux exporter ta collection, corriger ses éléments et effacer les données locales depuis les réglages. Pour toute question ou demande concernant des données traitées par l’éditeur, contacte l’adresse ci-dessous. Selon la situation, les droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité prévus par le RGPD peuvent s’appliquer. Tu peux aussi adresser une réclamation à la CNIL.',
  },
] as const;

export const legalSections = [
  {
    title: 'Objet du service',
    body: 'Zapstick permet de créer et d’organiser des stickers à partir de tes médias. Le traitement et la collection sont locaux au navigateur. Le service n’est ni affilié à WhatsApp ni approuvé par WhatsApp ou Meta.',
  },
  {
    title: 'Tes contenus',
    body: 'Importe uniquement des contenus que tu es autorisé à utiliser. Tu restes responsable des médias importés et de leur partage. Zapstick ne publie pas ta collection et ne la synchronise pas avec un serveur.',
  },
  {
    title: 'Conservation et disponibilité',
    body: 'Garde une sauvegarde des éléments que tu souhaites conserver. Le navigateur peut effacer son stockage et les services externes peuvent devenir indisponibles. Les fonctions d’import et de partage dépendent aussi de ton appareil et de la version de WhatsApp.',
  },
  {
    title: 'Hébergement',
    body: 'Cette instance est déployée chez l’hébergeur choisi par son administrateur. Les coordonnées de cet hébergeur doivent être renseignées par l’éditeur dans la configuration du déploiement.',
  },
] as const;

export const privacySources = {
  cookies: 'https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi',
  rights: 'https://www.cnil.fr/fr/les-droits-pour-maitriser-vos-donnees-personnelles',
  complaint: 'https://www.cnil.fr/fr/adresser-une-plainte',
};
