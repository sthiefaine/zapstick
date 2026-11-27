import {createHash, timingSafeEqual} from 'node:crypto';

export const LANGUAGE_CHOICES = [
  ['en', '🇬🇧 English'], ['fr', '🇫🇷 Français'], ['pt-BR', '🇧🇷 Português (Brasil)'],
  ['es', '🇪🇸 Español'], ['de', '🇩🇪 Deutsch'], ['zh-CN', '🇨🇳 中文（简体）'],
  ['ja', '🇯🇵 日本語'], ['ru', '🇷🇺 Русский'],
].map(([locale, label]) => ({action: `lang:${locale}`, label}));
const ACTIONS = new Set(['create', 'edit', 'help', 'lang', ...LANGUAGE_CHOICES.map(choice => choice.action)]);
export const validPollChoices = choices => Array.isArray(choices) && choices.length >= 2 && choices.length <= 8
  && choices.every(choice => typeof choice?.label === 'string' && choice.label.length > 0 && choice.label.length <= 80 && ACTIONS.has(choice.action))
  && new Set(choices.map(choice => choice.label)).size === choices.length;
export const pollJid = value => typeof value === 'string' && value.length <= 160 && /^\d+(?::\d+)?@(?:s\.whatsapp\.net|lid)$/.test(value)
  ? value.replace(/:\d+(?=@)/, '') : undefined;

/** Verify the vote with the poll's private key and the authenticated voter's
 * PN/LID aliases. Labels are matched by SHA-256, never by untrusted text. */
export function decodePollChoice(sdk, event, poll) {
  if (!poll || !validPollChoices(poll.choices) || typeof sdk?.decryptPollVote !== 'function') return;
  const secret = Buffer.from(poll.secret ?? '', 'base64url');
  if (secret.length !== 32 || !Array.isArray(poll.creators)) return;
  const creators = [...new Set(poll.creators.map(pollJid).filter(Boolean))].slice(0, 2);
  const voters = [...new Set([event.recipient, ...(event.senderAliases ?? [])].map(pollJid).filter(Boolean))].slice(0, 3);
  for (const pollCreatorJid of creators) for (const voterJid of voters) {
    try {
      const vote = sdk.decryptPollVote(event.vote, {pollCreatorJid, pollMsgId: event.pollMessageId, pollEncKey: secret, voterJid});
      if (vote.selectedOptions?.length !== 1) return;
      const selected = Buffer.from(vote.selectedOptions[0]);
      if (selected.length !== 32) return;
      return poll.choices.find(choice => timingSafeEqual(createHash('sha256').update(choice.label).digest(), selected))?.action;
    } catch { /* PN/LID representation can differ between WhatsApp clients. */ }
  }
}
