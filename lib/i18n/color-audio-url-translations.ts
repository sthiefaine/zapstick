import type {Locale} from './config';
export const colorAudioSources=[
 'Roue des couleurs','Flèches gauche et droite : teinte. Haut et bas : saturation.','Luminosité','Couleur','Code couleur hexadécimal',
 'Utilise un lien audio HTTPS valide.','Ce son est inaccessible. Importe le fichier depuis ton appareil.','Le téléchargement du son prend trop de temps.','Trop d’imports en cours. Réessaie dans un instant.','Ce lien ne contient pas de son lisible.',
] as const;
const values:Record<Locale,readonly string[]>={
 fr:colorAudioSources,
 en:['Color wheel','Left and right arrows: hue. Up and down: saturation.','Brightness','Color','Hex color code','Use a valid HTTPS audio link.','This sound is unavailable. Import the file from your device.','The audio download is taking too long.','Too many imports in progress. Try again shortly.','This link does not contain playable audio.'],
 'pt-BR':['Círculo de cores','Setas esquerda e direita: matiz. Para cima e para baixo: saturação.','Brilho','Cor','Código hexadecimal da cor','Use um link de áudio HTTPS válido.','Este som está indisponível. Importe o arquivo do seu dispositivo.','O download do áudio está demorando demais.','Muitas importações em andamento. Tente novamente em instantes.','Este link não contém um áudio reproduzível.'],
 es:['Rueda de colores','Flechas izquierda y derecha: tono. Arriba y abajo: saturación.','Brillo','Color','Código hexadecimal del color','Usa un enlace de audio HTTPS válido.','Este sonido no está disponible. Importa el archivo desde tu dispositivo.','La descarga del audio está tardando demasiado.','Hay demasiadas importaciones en curso. Inténtalo en un momento.','Este enlace no contiene audio reproducible.'],
 de:['Farbrad','Pfeile links und rechts: Farbton. Oben und unten: Sättigung.','Helligkeit','Farbe','Hexadezimaler Farbcode','Verwende einen gültigen HTTPS-Audiolink.','Dieser Ton ist nicht verfügbar. Importiere die Datei von deinem Gerät.','Das Herunterladen des Tons dauert zu lange.','Zu viele laufende Importe. Versuche es gleich erneut.','Dieser Link enthält keine abspielbare Audiodatei.'],
 'zh-CN':['色轮','左右箭头：色相。上下箭头：饱和度。','亮度','颜色','十六进制颜色代码','请使用有效的 HTTPS 音频链接。','无法访问此音频。请从设备导入文件。','音频下载耗时过长。','正在进行的导入过多，请稍后重试。','此链接不包含可播放的音频。'],
 ja:['カラーホイール','左右の矢印：色相。上下の矢印：彩度。','明るさ','色','16進数カラーコード','有効な HTTPS 音声リンクを使用してください。','この音声にはアクセスできません。端末からファイルを読み込んでください。','音声のダウンロードに時間がかかりすぎています。','読み込みが集中しています。少し待って再試行してください。','このリンクには再生可能な音声がありません。'],
 ru:['Цветовой круг','Стрелки влево и вправо: тон. Вверх и вниз: насыщенность.','Яркость','Цвет','Шестнадцатеричный код цвета','Используй действительную HTTPS-ссылку на аудио.','Этот звук недоступен. Импортируй файл с устройства.','Скачивание звука занимает слишком много времени.','Слишком много импортов. Повтори чуть позже.','По этой ссылке нет воспроизводимого аудио.'],
};
export const colorAudioTranslations=Object.fromEntries(Object.entries(values).map(([locale,texts])=>[locale,Object.fromEntries(colorAudioSources.map((source,i)=>[source,texts[i]]))])) as Record<Locale,Record<string,string>>;
