const PREFIX_LANGUAGES = [
  ['33', 'fr'], ['55', 'pt-BR'], ['34', 'es'], ['49', 'de'],
  ['86', 'zh-CN'], ['81', 'ja'], ['7', 'ru'],
];

/** A WhatsApp LID is an opaque identifier, never a phone number. Only the
 * authenticated phone JID supplied by WhatsApp can provide a country default. */
export function phoneLocale({recipient, senderAliases = []} = {}) {
  for (const jid of [recipient, ...senderAliases.slice(0, 8)]) {
    if (typeof jid !== 'string') continue;
    const number = /^([1-9]\d{7,14})(?::\d+)?@s\.whatsapp\.net$/.exec(jid)?.[1];
    if (!number) continue;
    return PREFIX_LANGUAGES.find(([prefix]) => number.startsWith(prefix))?.[1];
  }
}
