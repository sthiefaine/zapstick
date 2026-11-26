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
    title: 'Quand tu ajoutes un son',
    body: 'Le montage du son d’origine d’une vidéo, des fichiers audio importés et des enregistrements se fait dans ton navigateur. L’accès au microphone est demandé uniquement quand tu appuies sur un bouton d’enregistrement. Le son ajouté à un sticker est conservé sur cet appareil et inclus dans les sauvegardes. L’effacement local arrête le microphone et les lectures audio ; les sauvegardes et fichiers déjà téléchargés restent sur ton appareil jusqu’à leur suppression. Pour un lien audio direct, ton navigateur télécharge le son auprès de son hébergeur, qui reçoit ton adresse IP. Pour MyInstants, le serveur Zapstick récupère la page publique et le fichier audio, puis te le transmet sans l’enregistrer durablement ; MyInstants reçoit alors l’adresse IP du serveur.',
  },
  {
    title: 'Tes fichiers restent sur ton appareil',
    body: 'Les images, vidéos, stickers, noms, favoris et packs sont conservés dans IndexedDB, dans ton navigateur. La collection n’est pas envoyée automatiquement au serveur Zapstick. Tu peux la modifier, l’exporter ou la supprimer dans l’app. La réception sur WhatsApp, si tu la demandes, transfère uniquement le sticker choisi et son mix sonore éventuel.',
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
    body: 'Pour un lien X, ton navigateur contacte FxTwitter pour trouver le média, puis son hébergeur pour le télécharger. Les aperçus de médias et les liens externes contactent aussi leurs sites respectifs. Ces services reçoivent notamment ton adresse IP et le lien demandé ; leurs règles de confidentialité et leurs éventuels transferts internationaux s’appliquent. Pour une publication publique Instagram ou TikTok, le serveur Zapstick utilise son service Cobalt privé pour récupérer le média, puis le transmet à ton navigateur, sans enregistrement durable. La plateforme et son hébergeur reçoivent alors l’adresse IP du serveur et le lien demandé. Les tickets d’accès au média expirent après 90 secondes ; aucun compte ni cookie personnel n’est transmis.',
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
  {
    title: 'Quand tu reçois un sticker sur WhatsApp',
    body: 'Quand cette fonction est activée et que tu appuies sur « Recevoir sur WhatsApp », seul le WebP final et son mix sonore éventuel sont transférés temporairement au serveur Zapstick. Le bot utilise ton message et ton identifiant WhatsApp pour répondre dans cette conversation. Le code expire après dix minutes ; les copies temporaires sont supprimées après traitement ou expiration. Des états techniques et empreintes de déduplication, sans média ni numéro en clair, peuvent rester jusqu’à vingt-quatre heures après la fin du transfert. L’effacement local tente d’annuler les transferts connus ; hors connexion, leur expiration reste applicable. Les copies déjà remises à WhatsApp ne sont pas supprimées par cet effacement et suivent le fonctionnement de WhatsApp.',
  },
  {title:"Quand tu envoies un sticker au bot",body:"Quand tu envoies un sticker au bot pour le modifier, Zapstick récupère ce sticker et son son éventuel auprès de WhatsApp. Une copie temporaire est conservée sur le serveur pendant dix minutes au maximum, puis effacée automatiquement. Trois liens actifs sont autorisés par compte ; une empreinte de l’identifiant WhatsApp permet de faire respecter cette limite. Le lien reste privé : toute personne qui le possède peut ouvrir le média avant son expiration. Une fois le sticker ouvert, les modifications se font dans ton navigateur. Effacer les données du navigateur ne révoque pas ce lien temporaire ; son expiration reste applicable."},
] as const;

export const backgroundPrivacySection = {
    title: 'Quand tu retires un fond',
    body: 'Quand tu demandes un détourage, ton navigateur télécharge le modèle U²-Net-P depuis Hugging Face et son CDN. Ces services reçoivent l’adresse IP et la demande de téléchargement ; l’image ne leur est pas envoyée. Le modèle peut rester en cache sur cet appareil pour accélérer les prochains usages. L’effacement local supprime ce cache. Les règles de confidentialité et les éventuels transferts internationaux de ces hébergeurs s’appliquent.',
  } as const;

export const legalSections = [
  {
    title: 'Objet du service',
    body: 'Zapstick permet de créer et d’organiser des stickers à partir de tes médias. Le montage et la collection sont locaux au navigateur. La réception facultative sur WhatsApp utilise le transfert temporaire décrit dans la confidentialité. Le service n’est ni affilié à WhatsApp ni approuvé par WhatsApp ou Meta.',
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
