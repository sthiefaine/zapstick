import {SUPPORTED_LOCALES,type Locale} from './config';
const rows=[
 ['Écouter {name}','Play {name}','Ouvir {name}','Escuchar {name}','{name} anhören','播放{name}','{name}の音を再生','Послушать {name}'],
 ['Couper le son de {name}','Mute {name}','Silenciar {name}','Silenciar {name}','{name} stummschalten','将{name}静音','{name}を消音','Выключить звук {name}'],
 ['Mettre les animations en pause','Pause animations','Pausar animações','Pausar animaciones','Animationen pausieren','暂停动画','アニメーションを一時停止','Приостановить анимации'],
 ['Lire les animations','Play animations','Reproduzir animações','Reproducir animaciones','Animationen abspielen','播放动画','アニメーションを再生','Воспроизвести анимации'],
 ['Crédits des médias','Media credits','Créditos dos arquivos','Créditos de los medios','Mediennachweise','媒体来源','メディアのクレジット','Источники медиа'],
 ['Impossible de lire ce son.','Unable to play this sound.','Não foi possível reproduzir este som.','No se puede reproducir este sonido.','Dieser Ton kann nicht abgespielt werden.','无法播放此声音。','この音声を再生できません。','Не удалось воспроизвести звук.'],
] as const;
export const homeSoundTranslations=Object.fromEntries(
 SUPPORTED_LOCALES.map((locale,index)=>[
  locale, Object.fromEntries(rows.map(row=>[row[0],row[index]])),
 ]),
) as Record<Locale,Record<string,string>>;
