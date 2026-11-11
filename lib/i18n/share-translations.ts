import type {Locale} from './config';

export const shareSources = [
  'Partager Zapstick',
  'Crée tes stickers WhatsApp avec Zapstick ✨',
  'Lien copié. À toi de le partager !',
  'Copie ce lien manuellement.',
  'Sélectionner un média',
] as const;
const messages: Record<Locale, readonly string[]> = {
  fr: shareSources,
  en: ['Share Zapstick', 'Create your WhatsApp stickers with Zapstick ✨', 'Link copied. Share it with your friends!', 'Copy this link manually.', 'Select media'],
  'pt-BR': ['Compartilhar Zapstick', 'Crie suas figurinhas do WhatsApp com o Zapstick ✨', 'Link copiado. Agora é só compartilhar!', 'Copie este link manualmente.', 'Selecionar mídia'],
  es: ['Compartir Zapstick', 'Crea tus stickers de WhatsApp con Zapstick ✨', 'Enlace copiado. ¡Compártelo con tus amigos!', 'Copia este enlace manualmente.', 'Seleccionar archivo'],
  de: ['Zapstick teilen', 'Erstelle deine WhatsApp-Sticker mit Zapstick ✨', 'Link kopiert. Teile ihn mit deinen Freunden!', 'Kopiere diesen Link manuell.', 'Medium auswählen'],
  'zh-CN': ['分享 Zapstick', '用 Zapstick 制作你的 WhatsApp 贴纸 ✨', '链接已复制，快分享给朋友吧！', '请手动复制此链接。', '选择媒体'],
  ja: ['Zapstickをシェア', 'Zapstickで自分だけのWhatsAppスタンプを作ろう ✨', 'リンクをコピーしました。友達にシェアしよう！', 'このリンクを手動でコピーしてください。', 'メディアを選択'],
  ru: ['Поделиться Zapstick', 'Создавай свои стикеры для WhatsApp с Zapstick ✨', 'Ссылка скопирована. Поделись с друзьями!', 'Скопируй эту ссылку вручную.', 'Выбрать файл'],
};

export const shareTranslations: Record<Locale, Record<string, string>> = Object.fromEntries(Object.entries(messages).map(([locale, values]) => {
  if (values.length !== shareSources.length) throw new Error(`Invalid sharing translations: ${locale}`);
  return [locale, Object.fromEntries(shareSources.map((source, index) => [source, values[index]]))];
})) as Record<Locale, Record<string, string>>;
