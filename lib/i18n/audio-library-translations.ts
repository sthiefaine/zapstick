import {SUPPORTED_LOCALES, type Locale} from './config';

type Row = readonly [string, string, string, string, string, string, string, string];
const rows: readonly Row[] = [
 ['Stickers','Stickers','Figurinhas','Stickers','Sticker','贴纸','スタンプ','Стикеры'],
 ['Mes sons','My sounds','Meus sons','Mis sonidos','Meine Sounds','我的声音','マイサウンド','Мои звуки'],
 ['Garder dans Mes sons','Save to My sounds','Salvar em Meus sons','Guardar en Mis sonidos','In Meine Sounds speichern','保存到我的声音','マイサウンドに保存','Сохранить в Мои звуки'],
 ['Son enregistré','Sound saved','Som salvo','Sonido guardado','Sound gespeichert','声音已保存','サウンドを保存しました','Звук сохранён'],
 ['Sons enregistrés : {count}','Saved sounds: {count}','Sons salvos: {count}','Sonidos guardados: {count}','Gespeicherte Sounds: {count}','已保存的声音：{count}','保存したサウンド：{count}','Сохранённых звуков: {count}'],
 ['Aucun son enregistré','No saved sounds','Nenhum som salvo','No hay sonidos guardados','Noch keine Sounds gespeichert','尚未保存声音','保存したサウンドはありません','Нет сохранённых звуков'],
 ['Nom du son','Sound name','Nome do som','Nombre del sonido','Name des Sounds','声音名称','サウンド名','Название звука'],
 ['Utiliser {name}','Use {name}','Usar {name}','Usar {name}','{name} verwenden','使用{name}','{name}を使う','Использовать {name}'],
 ['Arrêter {name}','Stop {name}','Parar {name}','Detener {name}','{name} stoppen','停止{name}','{name}を停止','Остановить {name}'],
 ['Renommer {name}','Rename {name}','Renomear {name}','Cambiar nombre de {name}','{name} umbenennen','重命名{name}','{name}の名前を変更','Переименовать {name}'],
 ['Supprimer {name}','Delete {name}','Excluir {name}','Eliminar {name}','{name} löschen','删除{name}','{name}を削除','Удалить {name}'],
 ['Ce son ne peut pas être lu dans ce navigateur.','This sound cannot be played in this browser.','Não é possível reproduzir este som neste navegador.','Este sonido no se puede reproducir en este navegador.','Dieser Sound kann in diesem Browser nicht abgespielt werden.','此浏览器无法播放该声音。','このブラウザーではこの音声を再生できません。','Этот браузер не может воспроизвести звук.'],
 ['Impossible de lire les sons enregistrés.','Saved sounds could not be loaded.','Não foi possível carregar os sons salvos.','No se pudieron cargar los sonidos guardados.','Gespeicherte Sounds konnten nicht geladen werden.','无法读取已保存的声音。','保存したサウンドを読み込めませんでした。','Не удалось загрузить сохранённые звуки.'],
 ['Impossible d’enregistrer ce son sur cet appareil.','This sound could not be saved on this device.','Não foi possível salvar este som neste aparelho.','No se pudo guardar este sonido en este dispositivo.','Dieser Sound konnte auf diesem Gerät nicht gespeichert werden.','无法在此设备上保存该声音。','この端末にサウンドを保存できませんでした。','Не удалось сохранить звук на этом устройстве.'],
 ['Enregistrement du son interrompu.','Saving the sound was interrupted.','O salvamento do som foi interrompido.','Se interrumpió el guardado del sonido.','Das Speichern des Sounds wurde unterbrochen.','声音保存已中断。','サウンドの保存が中断されました。','Сохранение звука прервано.'],
 ['La bibliothèque de sons est invalide.','The sound library is invalid.','A biblioteca de sons é inválida.','La biblioteca de sonidos no es válida.','Die Soundbibliothek ist ungültig.','声音库无效。','サウンドライブラリが無効です。','Библиотека звуков повреждена.'],
 ['Ta bibliothèque contient déjà 60 sons.','Your library already contains 60 sounds.','Sua biblioteca já contém 60 sons.','Tu biblioteca ya tiene 60 sonidos.','Deine Bibliothek enthält bereits 60 Sounds.','声音库已有60个声音。','ライブラリにはすでに60個のサウンドがあります。','В библиотеке уже 60 звуков.'],
 ['Ta bibliothèque de sons est pleine.','Your sound library is full.','Sua biblioteca de sons está cheia.','Tu biblioteca de sonidos está llena.','Deine Soundbibliothek ist voll.','声音库已满。','サウンドライブラリがいっぱいです。','Библиотека звуков заполнена.'],
];
export const audioLibraryTranslations = Object.fromEntries(SUPPORTED_LOCALES.map((locale, index) => [locale, Object.fromEntries(rows.map(row => [row[0], row[index]]))])) as Record<Locale, Record<string, string>>;
