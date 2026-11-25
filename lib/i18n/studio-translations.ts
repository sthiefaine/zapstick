import {SUPPORTED_LOCALES,type Locale} from './config';

// French, English, Brazilian Portuguese, Spanish, German, Chinese, Japanese, Russian.
type Row=readonly [string,string,string,string,string,string,string,string];
const rows:readonly Row[]=[
 ['Durée','Duration','Duração','Duración','Dauer','时长','長さ','Длительность'],
 ['Durée de la piste {number}','Track {number} duration','Duração da faixa {number}','Duración de la pista {number}','Dauer von Spur {number}','音轨 {number} 时长','トラック {number}の長さ','Длительность дорожки {number}'],
 ['À la suite de la piste 1','After track 1','Depois da faixa 1','Después de la pista 1','Nach Spur 1','接在音轨 1 后','トラック1の後に配置','После дорожки 1'],
 ['Pistes audio','Audio tracks','Faixas de áudio','Pistas de audio','Audiospuren','音轨','音声トラック','Аудиодорожки'],
 ['Piste {number}','Track {number}','Faixa {number}','Pista {number}','Spur {number}','音轨 {number}','トラック {number}','Дорожка {number}'],
 ['Sélectionner la piste {number}','Select track {number}','Selecionar a faixa {number}','Seleccionar la pista {number}','Spur {number} auswählen','选择音轨 {number}','トラック {number} を選択','Выбрать дорожку {number}'],
 ['Ajouter un son','Add audio','Adicionar áudio','Añadir audio','Audio hinzufügen','添加音频','音声を追加','Добавить звук'],
 ['Ajouter un son à la piste {number}','Add audio to track {number}','Adicionar áudio à faixa {number}','Añadir audio a la pista {number}','Audio zu Spur {number} hinzufügen','向音轨 {number} 添加音频','トラック {number} に音声を追加','Добавить звук в дорожку {number}'],
 ['Décalage de la piste {number}','Track {number} offset','Deslocamento da faixa {number}','Desfase de la pista {number}','Zeitversatz von Spur {number}','音轨 {number} 的偏移','トラック {number} のタイミング調整','Смещение дорожки {number}'],
 ['Couper la piste {number}','Mute track {number}','Silenciar a faixa {number}','Silenciar la pista {number}','Spur {number} stummschalten','静音音轨 {number}','トラック {number} を消音','Выключить дорожку {number}'],
 ['Réactiver la piste {number}','Unmute track {number}','Ativar a faixa {number}','Activar la pista {number}','Spur {number} einschalten','取消音轨 {number} 的静音','トラック {number} の消音を解除','Включить дорожку {number}'],
 ['Source de la piste {number}','Track {number} source','Origem da faixa {number}','Fuente de la pista {number}','Quelle für Spur {number}','音轨 {number} 的来源','トラック {number} の音声ソース','Источник дорожки {number}'],
 ['Réglages de la piste {number}','Track {number} settings','Ajustes da faixa {number}','Ajustes de la pista {number}','Einstellungen für Spur {number}','音轨 {number} 的设置','トラック {number} の設定','Настройки дорожки {number}'],
 ['Réinitialiser la piste {number}','Reset track {number}','Redefinir a faixa {number}','Restablecer la pista {number}','Spur {number} zurücksetzen','重置音轨 {number}','トラック {number} をリセット','Сбросить дорожку {number}'],
 ['Retirer le son de la piste {number}','Remove audio from track {number}','Remover o áudio da faixa {number}','Quitar el audio de la pista {number}','Audio aus Spur {number} entfernen','移除音轨 {number} 的音频','トラック {number} の音声を削除','Удалить звук из дорожки {number}'],
 ['Début de l’extrait de la piste {number}','Track {number} clip start','Início do trecho da faixa {number}','Inicio del fragmento de la pista {number}','Ausschnittbeginn von Spur {number}','音轨 {number} 的片段起点','トラック {number} のクリップ開始','Начало фрагмента дорожки {number}'],
 ['Volume de la piste {number}','Track {number} volume','Volume da faixa {number}','Volumen de la pista {number}','Lautstärke von Spur {number}','音轨 {number} 的音量','トラック {number} の音量','Громкость дорожки {number}'],
 ['Agrandir l’aperçu','Expand preview','Ampliar prévia','Ampliar vista previa','Vorschau vergrößern','放大预览','プレビューを拡大','Увеличить предпросмотр'],
 ['Réduire l’aperçu','Shrink preview','Reduzir prévia','Reducir vista previa','Vorschau verkleinern','缩小预览','プレビューを縮小','Уменьшить предпросмотр'],
 ['Agrandir','Expand','Ampliar','Ampliar','Vergrößern','放大','拡大','Увеличить'],
 ['Réduire','Shrink','Reduzir','Reducir','Verkleinern','缩小','縮小','Уменьшить'],
 ['Tu peux ajouter jusqu’à deux pistes audio.','You can add up to two audio tracks.','Você pode adicionar até duas faixas de áudio.','Puedes añadir hasta dos pistas de audio.','Du kannst bis zu zwei Audiospuren hinzufügen.','最多可以添加两条音轨。','音声トラックは2つまで追加できます。','Можно добавить до двух аудиодорожек.'],
];

const excerptRows:readonly Row[]=[
 ['Déplacer la piste {number}','Move track {number}','Mover faixa {number}','Mover pista {number}','Spur {number} verschieben','移动音轨 {number}','トラック{number}を移動','Переместить дорожку {number}'],
 ['Son {number}','Sound {number}','Som {number}','Sonido {number}','Ton {number}','声音 {number}','音声{number}','Звук {number}'],
 ['Écouter le montage','Play the mix','Ouvir a montagem','Escuchar el montaje','Montage anhören','播放混音','ミックスを再生','Прослушать монтаж'],
 ['Glisse les blocs pour placer tes sons.','Drag the blocks to place your sounds.','Arraste os blocos para posicionar os sons.','Arrastra los bloques para colocar los sonidos.','Ziehe die Blöcke, um deine Sounds zu platzieren.','拖动音频块来安排声音。','ブロックをドラッグして音声を配置。','Перетаскивай блоки, чтобы расположить звуки.'],
 ['Extrait à utiliser','Choose your excerpt','Trecho a usar','Fragmento a utilizar','Ausschnitt auswählen','选择音频片段','使う音声の範囲','Нужный фрагмент'],
 ['Écouter l’extrait','Listen to excerpt','Ouvir o trecho','Escuchar el fragmento','Ausschnitt anhören','试听片段','音声を試聴','Прослушать фрагмент'],
 ['À partir de','Start at','A partir de','Desde','Ab','从','開始位置','Начиная с'],
 ['Pendant','For','Durante','Durante','Länge','持续','長さ','Длительность'],
 ['Placer le son','Place the sound','Posicionar o som','Colocar el sonido','Sound platzieren','放置声音','音声を配置','Разместить звук'],
 ['Au début','At the start','No início','Al principio','Am Anfang','在开头','最初から','В начале'],
 ['Après le son 1','After sound 1','Depois do som 1','Después del sonido 1','Nach Ton 1','在声音 1 之后','音声1の後','После звука 1'],
 ['À {time} s dans le sticker','At {time} s in the sticker','Aos {time} s no sticker','A los {time} s en el sticker','Bei {time} s im Sticker','在贴纸的第 {time} 秒','スタンプの{time}秒から','На {time} с стикера'],
 ['Changer le son et régler le volume','Change sound and volume','Trocar o som e ajustar o volume','Cambiar sonido y volumen','Sound und Lautstärke ändern','更换声音及调整音量','音声と音量を変更','Заменить звук и настроить громкость'],
];
const allRows=[...rows,...excerptRows];
export const studioSources=allRows.map(row=>row[0]);
export const studioTranslations=Object.fromEntries(SUPPORTED_LOCALES.map((locale,index)=>[locale,Object.fromEntries(allRows.map(row=>[row[0],row[index]]))])) as Record<Locale,Record<string,string>>;
