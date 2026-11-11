import type {Metadata} from 'next';
import {SUPPORTED_LOCALES,type Locale} from '@/lib/i18n/config';

export const SITE_NAME='Zapstick';
export const DEFAULT_SITE_URL='http://localhost:3000';
export type PublicPage='home'|'privacy'|'legal';
const descriptions:Record<Locale,string>={
 fr:'Crée des stickers WhatsApp fixes et animés à partir de photos, GIF et vidéos. Organise tes packs et garde ta collection dans ton navigateur.',
 en:'Create static and animated WhatsApp stickers from photos, GIFs and videos. Organize your packs and keep your collection in your browser.',
 'pt-BR':'Crie figurinhas estáticas e animadas para o WhatsApp a partir de fotos, GIFs e vídeos. Organize seus pacotes e guarde sua coleção no navegador.',
 es:'Crea stickers de WhatsApp estáticos y animados a partir de fotos, GIF y vídeos. Organiza tus paquetes y guarda tu colección en el navegador.',
 de:'Erstelle statische und animierte WhatsApp-Sticker aus Fotos, GIFs und Videos. Organisiere deine Pakete und speichere deine Sammlung im Browser.',
 'zh-CN':'将照片、GIF 和视频制作成静态或动态 WhatsApp 贴纸。整理贴纸包，并将收藏保存在浏览器中。',
 ja:'写真・GIF・動画から静止画やアニメーションの WhatsApp スタンプを作成。パックを整理し、コレクションをブラウザーに保存できます。',
 ru:'Создавайте статичные и анимированные стикеры WhatsApp из фотографий, GIF и видео. Организуйте наборы и храните коллекцию в браузере.',
};
const titles:Record<Locale,Record<PublicPage,string>>={
 fr:{home:'Crée tes stickers WhatsApp',privacy:'Confidentialité',legal:'Mentions légales'},
 en:{home:'Create your WhatsApp stickers',privacy:'Privacy',legal:'Legal notice'},
 'pt-BR':{home:'Crie suas figurinhas para WhatsApp',privacy:'Privacidade',legal:'Aviso legal'},
 es:{home:'Crea tus stickers de WhatsApp',privacy:'Privacidad',legal:'Aviso legal'},
 de:{home:'Erstelle deine WhatsApp-Sticker',privacy:'Datenschutz',legal:'Impressum'},
 'zh-CN':{home:'制作你的 WhatsApp 贴纸',privacy:'隐私政策',legal:'法律声明'},
 ja:{home:'WhatsApp スタンプを作成',privacy:'プライバシー',legal:'法的事項'},
 ru:{home:'Создавайте стикеры WhatsApp',privacy:'Конфиденциальность',legal:'Правовая информация'},
};
const privacyDescriptions:Record<Locale,string>={
 fr:'Découvre comment Zapstick conserve tes fichiers localement, utilise les services de médias externes et te permet d’exporter ou d’effacer tes données.',
 en:'Learn how Zapstick stores files locally, uses external media services, and lets you export or delete your data.',
 'pt-BR':'Saiba como o Zapstick armazena arquivos localmente, usa serviços de mídia externos e permite exportar ou excluir seus dados.',
 es:'Descubre cómo Zapstick guarda archivos localmente, utiliza servicios multimedia externos y permite exportar o eliminar tus datos.',
 de:'Erfahre, wie Zapstick Dateien lokal speichert, externe Mediendienste nutzt und den Export oder das Löschen deiner Daten ermöglicht.',
 'zh-CN':'了解 Zapstick 如何在本地保存文件、使用外部媒体服务，以及如何导出或删除你的数据。',
 ja:'Zapstick のローカル保存、外部メディアサービスの利用、データの書き出しや削除について説明します。',
 ru:'Узнайте, как Zapstick хранит файлы локально, использует внешние медиасервисы и позволяет экспортировать или удалить данные.',
};
const legalDescriptions:Record<Locale,string>={
 fr:'Mentions légales de Zapstick : éditeur, contact, hébergement et conditions d’utilisation du créateur de stickers.',
 en:'Zapstick legal notice: publisher, contact, hosting and terms of use for the sticker creator.',
 'pt-BR':'Aviso legal do Zapstick: responsável, contato, hospedagem e condições de uso do criador de figurinhas.',
 es:'Aviso legal de Zapstick: editor, contacto, alojamiento y condiciones de uso del creador de stickers.',
 de:'Impressum von Zapstick: Herausgeber, Kontakt, Hosting und Nutzungsbedingungen des Sticker-Erstellers.',
 'zh-CN':'Zapstick 法律声明：发布者、联系方式、托管信息和贴纸制作工具的使用条款。',
 ja:'Zapstick の運営者、連絡先、ホスティング、スタンプ作成ツールの利用条件。',
 ru:'Правовая информация Zapstick: издатель, контакты, хостинг и условия использования редактора стикеров.',
};
export const NOSCRIPT_LABEL:Record<Locale,string>={fr:'Zapstick utilise JavaScript pour créer et conserver les stickers dans ton navigateur. Active JavaScript pour utiliser l’atelier.',en:'Zapstick uses JavaScript to create and store stickers in your browser. Enable JavaScript to use the studio.','pt-BR':'O Zapstick usa JavaScript para criar e armazenar figurinhas no navegador. Ative o JavaScript para usar o editor.',es:'Zapstick utiliza JavaScript para crear y guardar stickers en tu navegador. Activa JavaScript para usar el editor.',de:'Zapstick benötigt JavaScript, um Sticker im Browser zu erstellen und zu speichern. Aktiviere JavaScript für das Studio.','zh-CN':'Zapstick 使用 JavaScript 在浏览器中制作和保存贴纸。请启用 JavaScript 以使用编辑器。',ja:'Zapstick は JavaScript を使ってブラウザーでスタンプを作成・保存します。エディターを使うには JavaScript を有効にしてください。',ru:'Zapstick использует JavaScript для создания и хранения стикеров в браузере. Включите JavaScript, чтобы пользоваться редактором.'};
export const SKIP_LABEL:Record<Locale,string>={fr:'Aller au contenu',en:'Skip to content','pt-BR':'Ir para o conteúdo',es:'Saltar al contenido',de:'Zum Inhalt springen','zh-CN':'跳至内容',ja:'本文へ移動',ru:'Перейти к содержимому'};
const ogLocales:Record<Locale,string>={fr:'fr_FR',en:'en_US','pt-BR':'pt_BR',es:'es_ES',de:'de_DE','zh-CN':'zh_CN',ja:'ja_JP',ru:'ru_RU'};
export function siteOrigin():string{
 const candidate=process.env.SITE_URL||process.env.NEXT_PUBLIC_SITE_URL||DEFAULT_SITE_URL;
 try{const url=new URL(candidate);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return DEFAULT_SITE_URL;return url.origin;}catch{return DEFAULT_SITE_URL;}
}
export function isSiteIndexable():boolean{
 const enabled=process.env.SITE_INDEXABLE??process.env.NEXT_PUBLIC_SITE_INDEXABLE;
 if(enabled!=='true')return false;
 const url=new URL(siteOrigin());
 const host=url.hostname.toLowerCase();
 return url.protocol==='https:'&&host!=='localhost'&&!/^(?:\d+\.){3}\d+$/.test(host)&&!host.includes(':')&&!['.localhost','.local','.internal','.test','.invalid'].some(suffix=>host.endsWith(suffix));
}
export function localizedPath(locale:Locale,kind:PublicPage='home'){return `/${locale}${kind==='home'?'':`/${kind}`}`;}
export function languageAlternates(kind:PublicPage='home'){
 const origin=siteOrigin();
 return Object.fromEntries([...SUPPORTED_LOCALES.map(locale=>[locale,`${origin}${localizedPath(locale,kind)}`]),['x-default',`${origin}/fr${kind==='home'?'':`/${kind}`}`]]);
}
export function pageMetadata(locale:Locale,kind:PublicPage='home'):Metadata{
 const origin=siteOrigin(),url=`${origin}${localizedPath(locale,kind)}`,title=`${titles[locale][kind]} | Zapstick`,description=(kind==='privacy'?privacyDescriptions:kind==='legal'?legalDescriptions:descriptions)[locale],indexable=isSiteIndexable();
 return {
  metadataBase:new URL(origin),title,description,applicationName:SITE_NAME,category:'utilities',referrer:'no-referrer',
  alternates:{canonical:url,languages:languageAlternates(kind)},
  robots:{index:indexable,follow:indexable,googleBot:{index:indexable,follow:indexable,'max-image-preview':'large','max-snippet':-1,'max-video-preview':-1}},
  openGraph:{type:'website',siteName:SITE_NAME,title,description,url,locale:ogLocales[locale],alternateLocale:SUPPORTED_LOCALES.filter(l=>l!==locale).map(l=>ogLocales[l]),images:[{url:`${origin}/social-card.png`,width:1200,height:630,alt:'Zapstick — GIF · WebP · Stickers'}]},
  twitter:{card:'summary_large_image',title,description,images:[`${origin}/social-card.png`]},
  icons:{icon:'/favicon.svg',shortcut:'/favicon.svg',apple:'/apple-touch-icon.png'},
  manifest:'/manifest.webmanifest',
 };
}
export function applicationSchema(locale:Locale){return {'@context':'https://schema.org','@type':'WebApplication',name:SITE_NAME,url:`${siteOrigin()}/${locale}`,description:descriptions[locale],applicationCategory:'MultimediaApplication',operatingSystem:'Web',browserRequirements:'JavaScript, IndexedDB, Canvas WebP',inLanguage:SUPPORTED_LOCALES,offers:{'@type':'Offer',price:'0',priceCurrency:'EUR'},isAccessibleForFree:true};}
export function jsonLd(value:unknown){return JSON.stringify(value).replace(/</g,'\\u003c');}
