import type {Locale} from './config';
export const clipboardUxSources=['En attente de ton autorisation…','Annuler le collage'] as const;
const messages:Record<Locale,readonly string[]>={
 fr:clipboardUxSources,
 en:['Waiting for your permission…','Cancel pasting'],
 'pt-BR':['Aguardando sua permissão…','Cancelar colagem'],
 es:['Esperando tu permiso…','Cancelar pegado'],
 de:['Warte auf deine Erlaubnis…','Einfügen abbrechen'],
 'zh-CN':['正在等待你的授权…','取消粘贴'],
 ja:['許可を待っています…','貼り付けをキャンセル'],
 ru:['Ожидание твоего разрешения…','Отменить вставку'],
};
export const clipboardUxTranslations:Record<Locale,Record<string,string>>=Object.fromEntries(Object.entries(messages).map(([locale,values])=>{
 if(values.length!==clipboardUxSources.length)throw new Error(`Invalid clipboard translations: ${locale}`);
 return[locale,Object.fromEntries(clipboardUxSources.map((source,index)=>[source,values[index]]))];
})) as Record<Locale,Record<string,string>>;
