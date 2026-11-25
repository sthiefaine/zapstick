import {SUPPORTED_LOCALES,type Locale} from './config';

const rows=[
 ['Découvrir Zapstick','Meet Zapstick','Conheça o Zapstick','Descubre Zapstick','Zapstick entdecken','认识 Zapstick','Zapstickを知る','Знакомство с Zapstick'],
 ['Lire le film de présentation de Zapstick','Play the Zapstick introduction','Reproduzir a apresentação do Zapstick','Reproducir la presentación de Zapstick','Zapstick-Video abspielen','播放 Zapstick 介绍视频','Zapstickの紹介動画を再生','Смотреть презентацию Zapstick'],
 ['Film de présentation de Zapstick','Zapstick introduction','Apresentação do Zapstick','Presentación de Zapstick','Zapstick-Video','Zapstick 介绍视频','Zapstickの紹介動画','Презентация Zapstick'],
 ['Impossible de lire cette vidéo.','Unable to play this video.','Não foi possível reproduzir este vídeo.','No se puede reproducir este vídeo.','Dieses Video kann nicht abgespielt werden.','无法播放此视频。','この動画を再生できません。','Не удалось воспроизвести видео.'],
] as const;

export const introTranslations=Object.fromEntries(SUPPORTED_LOCALES.map((locale,index)=>[
 locale,Object.fromEntries(rows.map(row=>[row[0],row[index]])),
])) as Record<Locale,Record<string,string>>;
