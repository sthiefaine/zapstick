import {latinCopy} from './bot-copy-latin.mjs';
import {asianCopy} from './bot-copy-asian.mjs';

const en = {
  help: `👋 *Welcome to Zapstick!*

*Edit on the website*
Send me a sticker to get its editing link: up to 5 active links, valid for 10 min.

*Create in this chat*
1. */create* — start, then send a still, animated or sound sticker. I keep its visual and remove its original sound.
2. Optional: send a voice message, audio file or sound sticker to add its audio.
3. */end* — get your sticker. No added audio? It stays silent.

To change the sound, send another audio. Only the first 6 seconds are used.
*/cancel* — cancel · */help* — help
*/lang* — choose your language

Coming from the website? Send the prefilled “Sticker ZAP …” message.`,
  languageChosen: '✅ English selected.\n*/help* for the commands.',
  languagePrompt: '*Choose your language*\nSend one of these commands:',
  busy: 'The bot is busy. Please try again in a moment.',
  newCreation: '✨ *New sticker*\nSend a still, animated or sound sticker. I keep its visual and remove its original sound.\n\n*/cancel* to cancel · draft valid for 10 min.',
  cancelled: 'Creation cancelled.\n*/create* to start again, or send a sticker to get its editing link.',
  noCreation: 'No creation in progress.\n*/create* to start.',
  missingVisual: 'Send a still or animated sticker first, then */end*.',
  noDraftEnd: 'No creation in progress.\nSend */create*, then your sticker.',
  visualPrompt: 'Send a still, animated or sound sticker to choose the visual.\n*/cancel* to cancel.',
  promptSilent: 'Your visual is ready, without sound.\nSend a voice message, audio file or sound sticker to add audio.\n*/end* to receive it silently · */cancel* to cancel.',
  promptSound: 'Your visual and sound are ready.\nTo change the sound, send another audio.\n*/end* to receive your sticker · */cancel* to cancel.',
  visualFirst: 'Visual first 🙂 Send a still or animated sticker. You can add sound next.',
  soundUnavailable: 'Adding sound is temporarily unavailable.\n*/end* to receive your sticker without sound.',
  stickerWithoutSound: 'This sticker has no sound. Your visual is unchanged.\nSend a voice message, audio file or sound sticker, or */end* to finish.',
  visualReady: '✅ *Visual ready — original sound removed.*\n\nSend a voice message, audio file or sound sticker to add audio.\nOr */end* to receive it without sound.',
  soundReady: '✅ *Sound ready* ({duration} s, max 6 s).\n*/end* to receive your sticker.\nTo change the sound, send another audio. */cancel* to cancel.',
  invalidSoundSaved: 'I couldn’t read this audio. Try a voice message or an MP3, M4A, OGG or WAV file up to 8 MB.\nYour visual and last valid sound are kept. */end* to finish.',
  invalidSoundSilent: 'I couldn’t read this audio. Try a voice message or an MP3, M4A, OGG or WAV file up to 8 MB.\nYour visual is kept without sound. */end* to finish.',
  invalidVisual: 'I couldn’t read this sticker. Send a still or animated sticker up to 6 seconds.\n*/cancel* to cancel.',
  deliveryUnknown: 'Sending has started, but confirmation is taking longer. Check the chat before starting again with */create*.',
  sendFailed: 'I couldn’t finish the sticker. Your draft is kept for 10 min in total: try */end* again, or */cancel* to cancel.',
  reverseUnavailable: 'Sticker editing is temporarily unavailable.',
  reverseLimit: 'You already have 5 active links. Try again after they expire (10 min).',
  reverseBusy: 'Too many requests. Please try again in a moment.',
  reverseReady: '*Edit your sticker*\n{link}\nTemporary link (up to 10 min).',
  reverseInvalid: 'I couldn’t prepare this sticker. Send a sticker up to 6 seconds, with or without sound.',
};

const fr = {
  help: `👋 *Bienvenue sur Zapstick !*

*Modifier sur le site*
Envoie un sticker pour obtenir son lien d’édition : 5 liens actifs maximum, valables 10 min.

*Créer ici*
1. */create* — démarre, puis envoie un sticker fixe, animé ou sonore. Je garde le visuel, sans l’audio d’origine.
2. Facultatif : envoie un vocal, un fichier audio ou un sticker sonore pour ajouter son audio.
3. */end* — reçois ton sticker. Sans audio ajouté, il reste muet.

Pour changer le son, envoie un autre audio. Seules les 6 premières secondes sont utilisées.
*/cancel* — annuler · */help* — aide
*/lang* — choisir la langue

Tu viens du site ? Envoie le message « Sticker ZAP … » prérempli.`,
  languageChosen: '✅ Français sélectionné.\n*/help* pour afficher les commandes.',
  languagePrompt: '*Choisis ta langue*\nEnvoie une de ces commandes :',
  busy: 'Le bot est occupé. Réessaie dans un instant.',
  newCreation: '✨ *Nouveau sticker*\nEnvoie un sticker fixe, animé ou sonore. Je garde le visuel, sans l’audio d’origine.\n\n*/cancel* pour annuler · création valable 10 min.',
  cancelled: 'Création annulée.\n*/create* pour recommencer, ou envoie un sticker pour obtenir son lien d’édition.',
  noCreation: 'Aucune création en cours.\n*/create* pour commencer.',
  missingVisual: 'Envoie d’abord un sticker fixe ou animé, puis */end*.',
  noDraftEnd: 'Aucune création en cours.\nEnvoie */create*, puis ton sticker.',
  visualPrompt: 'Envoie un sticker fixe, animé ou sonore pour choisir le visuel.\n*/cancel* pour annuler.',
  promptSilent: 'Ton visuel est prêt, sans son.\nEnvoie un vocal, un fichier audio ou un sticker sonore pour ajouter un son.\n*/end* pour le recevoir muet · */cancel* pour annuler.',
  promptSound: 'Ton visuel et ton son sont prêts.\nPour changer le son, envoie un autre audio.\n*/end* pour recevoir ton sticker · */cancel* pour annuler.',
  visualFirst: 'D’abord le visuel 🙂 Envoie un sticker fixe ou animé. Tu pourras ajouter le son juste après.',
  soundUnavailable: 'L’ajout de son est momentanément indisponible.\n*/end* pour recevoir ton sticker sans son.',
  stickerWithoutSound: 'Ce sticker n’a pas de son. Ton visuel est conservé.\nEnvoie un vocal, un fichier audio ou un sticker sonore, ou */end* pour terminer.',
  visualReady: '✅ *Visuel prêt, son d’origine retiré.*\n\nEnvoie un vocal, un fichier audio ou un sticker sonore pour ajouter un son.\nOu */end* pour recevoir ce visuel sans son.',
  soundReady: '✅ *Son prêt* ({duration} s, 6 s maximum).\n*/end* pour recevoir ton sticker.\nPour changer le son, envoie un autre audio. */cancel* pour annuler.',
  invalidSoundSaved: 'Je n’ai pas pu lire ce son. Essaie un vocal ou un fichier MP3, M4A, OGG ou WAV de 8 Mo maximum.\nTon visuel et le dernier son valide sont conservés. */end* pour terminer.',
  invalidSoundSilent: 'Je n’ai pas pu lire ce son. Essaie un vocal ou un fichier MP3, M4A, OGG ou WAV de 8 Mo maximum.\nTon visuel est conservé, sans son. */end* pour terminer.',
  invalidVisual: 'Je n’ai pas pu lire ce sticker. Envoie un sticker fixe ou animé de 6 secondes maximum.\n*/cancel* pour annuler.',
  deliveryUnknown: 'L’envoi a commencé, mais sa confirmation tarde. Vérifie la conversation avant de recommencer avec */create*.',
  sendFailed: 'Je n’ai pas pu terminer le sticker. Ta création est conservée pendant 10 min au total : réessaie */end*, ou */cancel* pour annuler.',
  reverseUnavailable: 'La modification de stickers est momentanément indisponible.',
  reverseLimit: 'Tu as déjà 5 liens actifs. Réessaie après leur expiration (10 min).',
  reverseBusy: 'Trop de demandes. Réessaie dans un instant.',
  reverseReady: '*Modifie ton sticker*\n{link}\nLien temporaire (10 min maximum).',
  reverseInvalid: 'Je n’ai pas pu préparer ce sticker. Envoie un sticker de 6 secondes maximum, avec ou sans son.',
};

export const botCopy = {en, fr, ...latinCopy, ...asianCopy};
export function botLocale(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  const aliases = {'en':'en','fr':'fr','pt':'pt-BR','pt-br':'pt-BR','es':'es','de':'de','zh':'zh-CN','zh-cn':'zh-CN','ja':'ja','ru':'ru'};
  return Object.hasOwn(aliases, normalized) ? aliases[normalized] : undefined;
}
export function botText(locale, key, values = {}) {
  const template = botCopy[botLocale(locale) ?? 'en']?.[key] ?? en[key];
  if (typeof template !== 'string') throw new Error('Unknown bot message.');
  return template.replace(/\{([a-zA-Z]+)\}/g, (_, name) => String(values[name] ?? ''));
}
const LANGUAGE_MENU = [
  '🇬🇧 English — */lang en*', '🇫🇷 Français — */lang fr*',
  '🇧🇷 Português (Brasil) — */lang pt-BR*', '🇪🇸 Español — */lang es*',
  '🇩🇪 Deutsch — */lang de*', '🇨🇳 中文 — */lang zh-CN*',
  '🇯🇵 日本語 — */lang ja*', '🇷🇺 Русский — */lang ru*',
].join('\n');
export const botLanguageMenu = locale => `${botText(locale, 'languagePrompt')}\n\n${LANGUAGE_MENU}`;
export const botWelcome = (locale = 'en', siteUrl) => `${botText(locale, 'help')}${siteUrl ? `\n\n🌐 ${siteUrl}` : ''}`;
