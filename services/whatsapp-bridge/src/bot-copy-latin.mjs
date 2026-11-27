export const latinCopy = {
  'pt-BR': {
    help: `👋 Crie e edite figurinhas com o Zapstick.

🔗 Editar no site
Envie uma figurinha e receba um link de edição. Até 5 links ativos, válidos por 10 min.

✨ Criar aqui
*/create* — começar
1. Envie uma figurinha estática, animada ou com som. Vou usar só a imagem, sem o som original.
2. Se quiser, envie um áudio de voz, um arquivo de áudio ou outra figurinha com som. Vou usar só o áudio dela.
3. */end* — receber a figurinha, com o áudio adicionado ou sem som.

Para trocar o áudio, envie outro. Uso os primeiros 6 segundos.
*/cancel* — cancelar
*/help* — ver esta ajuda
*/lang* — escolher o idioma

Para receber uma figurinha criada no site, envie a mensagem “Sticker ZAP …” já preenchida.`,
    languageChosen: 'Idioma alterado para português do Brasil.\n*/help* para ver os comandos.',
    languagePrompt: 'Escolha o idioma do bot:',
    busy: 'O bot está ocupado. Tente novamente daqui a pouco.',
    newCreation: '✨ Nova figurinha\nEnvie uma figurinha estática, animada ou com som. Vou usar só a imagem, sem o som original.\n\n*/cancel* para cancelar · criação válida por 10 min.',
    cancelled: 'Criação cancelada.\n*/create* para começar de novo, ou envie uma figurinha para receber um link de edição.',
    noCreation: 'Nenhuma criação em andamento.\n*/create* para começar.',
    missingVisual: 'Falta a imagem: envie primeiro uma figurinha estática ou animada, depois */end*.',
    noDraftEnd: 'Nenhuma criação em andamento.\nDigite */create* e envie sua figurinha.',
    visualPrompt: 'Envie uma figurinha estática, animada ou com som para escolher a imagem.\n*/cancel* para cancelar.',
    promptSilent: 'Sua imagem está pronta, sem som.\nEnvie um áudio de voz, um arquivo de áudio ou uma figurinha com som para adicionar o áudio.\n*/end* para receber sem som · */cancel* para cancelar.',
    promptSound: 'Sua imagem e seu áudio estão prontos.\n*/end* para receber a figurinha com esse áudio.\nEnvie outro áudio para trocar · */cancel* para cancelar.',
    visualFirst: 'Primeiro, a imagem 🙂 Envie uma figurinha estática ou animada. Depois você pode adicionar o áudio.',
    soundUnavailable: 'Não é possível adicionar áudio no momento.\n*/end* para receber sua figurinha sem som.',
    stickerWithoutSound: 'Essa figurinha não tem som. Sua imagem anterior foi mantida.\nEnvie um áudio de voz, um arquivo de áudio ou uma figurinha com som.\n*/end* para finalizar.',
    visualReady: '✅ Imagem pronta, som original removido.\n\nEnvie um áudio de voz, um arquivo de áudio ou uma figurinha com som para adicionar o áudio.\nOu */end* para receber essa imagem sem som.',
    soundReady: '✅ Áudio pronto ({duration} s, máximo de 6 s).\n*/end* para receber sua figurinha.\nEnvie outro áudio para trocar ou */cancel* para cancelar.',
    invalidSoundSaved: 'Não consegui ler esse áudio. Tente um áudio de voz ou um arquivo MP3, M4A, OGG ou WAV de até 8 MB.\nSua imagem e o último áudio válido foram mantidos. */end* para finalizar.',
    invalidSoundSilent: 'Não consegui ler esse áudio. Tente um áudio de voz ou um arquivo MP3, M4A, OGG ou WAV de até 8 MB.\nSua imagem foi mantida, sem som. */end* para finalizar.',
    invalidVisual: 'Não consegui ler essa figurinha. Envie uma figurinha estática ou animada de até 6 segundos.\n*/cancel* para cancelar.',
    deliveryUnknown: 'O envio começou, mas a confirmação está demorando. Confira a conversa antes de tentar de novo com */create*.',
    sendFailed: 'Não consegui finalizar a figurinha. Sua criação fica salva por 10 min no total. Tente */end* novamente ou */cancel* para cancelar.',
    reverseUnavailable: 'A edição de figurinhas está indisponível no momento.',
    reverseLimit: 'Você já tem 5 links ativos. Tente novamente quando expirarem, em até 10 min.',
    reverseBusy: 'Muitas solicitações. Tente novamente daqui a pouco.',
    reverseReady: 'Edite sua figurinha:\n{link}\nLink temporário, válido por até 10 min.',
    reverseInvalid: 'Não consegui preparar essa figurinha. Envie uma figurinha de até 6 segundos, com ou sem som.',
  },
  es: {
    help: `👋 Crea y edita tus stickers con Zapstick.

🔗 Editar en la web
Envía un sticker y recibe su enlace de edición. Hasta 5 enlaces activos, válidos durante 10 min.

✨ Crear aquí
*/create* — empezar
1. Envía un sticker estático, animado o con sonido. Usaré solo su imagen, sin el sonido original.
2. Si quieres, envía una nota de voz, un archivo de audio u otro sticker con sonido. Usaré solo su audio.
3. */end* — recibir tu sticker, con el audio añadido o sin sonido.

Para cambiar el audio, envía otro. Uso los primeros 6 segundos.
*/cancel* — cancelar
*/help* — ver esta ayuda
*/lang* — elegir el idioma

Para recibir un sticker creado en la web, envía el mensaje «Sticker ZAP …» que aparece preparado.`,
    languageChosen: 'Idioma cambiado a español.\n*/help* para ver los comandos.',
    languagePrompt: 'Elige el idioma del bot:',
    busy: 'El bot está ocupado. Inténtalo de nuevo en un momento.',
    newCreation: '✨ Nuevo sticker\nEnvía un sticker estático, animado o con sonido. Usaré solo su imagen, sin el sonido original.\n\n*/cancel* para cancelar · creación válida durante 10 min.',
    cancelled: 'Creación cancelada.\n*/create* para empezar de nuevo, o envía un sticker para recibir su enlace de edición.',
    noCreation: 'No hay ninguna creación en curso.\n*/create* para empezar.',
    missingVisual: 'Falta la imagen: envía primero un sticker estático o animado y después */end*.',
    noDraftEnd: 'No hay ninguna creación en curso.\nEscribe */create* y envía tu sticker.',
    visualPrompt: 'Envía un sticker estático, animado o con sonido para elegir la imagen.\n*/cancel* para cancelar.',
    promptSilent: 'Tu imagen está lista, sin sonido.\nEnvía una nota de voz, un archivo de audio o un sticker con sonido para añadir su audio.\n*/end* para recibirlo sin sonido · */cancel* para cancelar.',
    promptSound: 'Tu imagen y tu audio están listos.\n*/end* para recibir el sticker con ese audio.\nEnvía otro audio para cambiarlo · */cancel* para cancelar.',
    visualFirst: 'Primero, la imagen 🙂 Envía un sticker estático o animado. Después podrás añadir el audio.',
    soundUnavailable: 'No se puede añadir audio en este momento.\n*/end* para recibir tu sticker sin sonido.',
    stickerWithoutSound: 'Ese sticker no tiene sonido. He conservado tu imagen anterior.\nEnvía una nota de voz, un archivo de audio o un sticker con sonido.\n*/end* para terminar.',
    visualReady: '✅ Imagen lista, sonido original eliminado.\n\nEnvía una nota de voz, un archivo de audio o un sticker con sonido para añadir su audio.\nO */end* para recibir esta imagen sin sonido.',
    soundReady: '✅ Audio listo ({duration} s, máximo de 6 s).\n*/end* para recibir tu sticker.\nEnvía otro audio para cambiarlo o */cancel* para cancelar.',
    invalidSoundSaved: 'No he podido leer ese audio. Prueba con una nota de voz o un archivo MP3, M4A, OGG o WAV de hasta 8 MB.\nTu imagen y el último audio válido se han conservado. */end* para terminar.',
    invalidSoundSilent: 'No he podido leer ese audio. Prueba con una nota de voz o un archivo MP3, M4A, OGG o WAV de hasta 8 MB.\nTu imagen se ha conservado, sin sonido. */end* para terminar.',
    invalidVisual: 'No he podido leer ese sticker. Envía uno estático o animado de hasta 6 segundos.\n*/cancel* para cancelar.',
    deliveryUnknown: 'El envío ha comenzado, pero la confirmación tarda. Revisa la conversación antes de volver a intentarlo con */create*.',
    sendFailed: 'No he podido terminar el sticker. Tu creación se conserva durante 10 min en total. Vuelve a probar con */end* o usa */cancel* para cancelar.',
    reverseUnavailable: 'La edición de stickers no está disponible en este momento.',
    reverseLimit: 'Ya tienes 5 enlaces activos. Inténtalo de nuevo cuando caduquen, en un máximo de 10 min.',
    reverseBusy: 'Hay demasiadas solicitudes. Inténtalo de nuevo en un momento.',
    reverseReady: 'Edita tu sticker:\n{link}\nEnlace temporal, válido durante un máximo de 10 min.',
    reverseInvalid: 'No he podido preparar ese sticker. Envía uno de hasta 6 segundos, con o sin sonido.',
  },
  de: {
    help: `👋 Erstelle und bearbeite Sticker mit Zapstick.

🔗 Auf der Website bearbeiten
Sende einen Sticker und erhalte einen Bearbeitungslink. Bis zu 5 aktive Links, jeweils 10 Min. gültig.

✨ Hier erstellen
*/create* — starten
1. Sende einen statischen, animierten oder vertonten Sticker. Ich nutze nur sein Bild, ohne den Originalton.
2. Optional: Sende eine Sprachnachricht, Audiodatei oder einen anderen Sticker mit Ton. Davon nutze ich nur den Ton.
3. */end* — deinen Sticker erhalten, mit dem hinzugefügten Ton oder stumm.

Für einen anderen Ton sende einfach einen neuen. Ich nutze die ersten 6 Sekunden.
*/cancel* — abbrechen
*/help* — diese Hilfe anzeigen
*/lang* — Sprache wählen

Für einen Sticker von der Website sende die vorbereitete Nachricht „Sticker ZAP …“.`,
    languageChosen: 'Sprache auf Deutsch geändert.\n*/help* zeigt dir die Befehle.',
    languagePrompt: 'Wähle die Sprache des Bots:',
    busy: 'Der Bot ist gerade beschäftigt. Versuche es gleich noch einmal.',
    newCreation: '✨ Neuer Sticker\nSende einen statischen, animierten oder vertonten Sticker. Ich nutze nur sein Bild, ohne den Originalton.\n\n*/cancel* zum Abbrechen · Entwurf 10 Min. gültig.',
    cancelled: 'Erstellung abgebrochen.\nMit */create* neu starten oder einen Sticker senden, um einen Bearbeitungslink zu erhalten.',
    noCreation: 'Du hast keinen aktiven Entwurf.\nMit */create* starten.',
    missingVisual: 'Das Bild fehlt noch: Sende zuerst einen statischen oder animierten Sticker und danach */end*.',
    noDraftEnd: 'Du hast keinen aktiven Entwurf.\nSende */create* und danach deinen Sticker.',
    visualPrompt: 'Sende einen statischen, animierten oder vertonten Sticker, um das Bild auszuwählen.\n*/cancel* zum Abbrechen.',
    promptSilent: 'Dein Bild ist bereit, ohne Ton.\nSende eine Sprachnachricht, Audiodatei oder einen Sticker mit Ton, um den Ton hinzuzufügen.\n*/end* für den stummen Sticker · */cancel* zum Abbrechen.',
    promptSound: 'Dein Bild und dein Ton sind bereit.\n*/end* für den Sticker mit diesem Ton.\nSende einen anderen Ton zum Ersetzen · */cancel* zum Abbrechen.',
    visualFirst: 'Zuerst das Bild 🙂 Sende einen statischen oder animierten Sticker. Danach kannst du den Ton hinzufügen.',
    soundUnavailable: 'Ton kann gerade nicht hinzugefügt werden.\n*/end* für deinen Sticker ohne Ton.',
    stickerWithoutSound: 'Dieser Sticker hat keinen Ton. Dein bisheriges Bild bleibt erhalten.\nSende eine Sprachnachricht, Audiodatei oder einen Sticker mit Ton.\nMit */end* abschließen.',
    visualReady: '✅ Bild bereit, Originalton entfernt.\n\nSende eine Sprachnachricht, Audiodatei oder einen Sticker mit Ton, um den Ton hinzuzufügen.\nOder */end* für dieses Bild ohne Ton.',
    soundReady: '✅ Ton bereit ({duration} Sek., höchstens 6 Sek.).\n*/end* für deinen Sticker.\nSende einen anderen Ton zum Ersetzen oder */cancel* zum Abbrechen.',
    invalidSoundSaved: 'Ich konnte diesen Ton nicht lesen. Versuche eine Sprachnachricht oder eine MP3-, M4A-, OGG- oder WAV-Datei bis 8 MB.\nDein Bild und der letzte gültige Ton bleiben erhalten. Mit */end* abschließen.',
    invalidSoundSilent: 'Ich konnte diesen Ton nicht lesen. Versuche eine Sprachnachricht oder eine MP3-, M4A-, OGG- oder WAV-Datei bis 8 MB.\nDein Bild bleibt erhalten, ohne Ton. Mit */end* abschließen.',
    invalidVisual: 'Ich konnte diesen Sticker nicht lesen. Sende einen statischen oder animierten Sticker mit höchstens 6 Sekunden Länge.\n*/cancel* zum Abbrechen.',
    deliveryUnknown: 'Der Versand wurde gestartet, aber die Bestätigung lässt auf sich warten. Prüfe den Chat, bevor du mit */create* neu beginnst.',
    sendFailed: 'Ich konnte den Sticker nicht fertigstellen. Dein Entwurf bleibt insgesamt 10 Min. erhalten. Versuche */end* erneut oder brich mit */cancel* ab.',
    reverseUnavailable: 'Die Sticker-Bearbeitung ist gerade nicht verfügbar.',
    reverseLimit: 'Du hast bereits 5 aktive Links. Versuche es nach deren Ablauf erneut, spätestens in 10 Min.',
    reverseBusy: 'Zu viele Anfragen. Versuche es gleich noch einmal.',
    reverseReady: 'Bearbeite deinen Sticker:\n{link}\nTemporärer Link, höchstens 10 Min. gültig.',
    reverseInvalid: 'Ich konnte diesen Sticker nicht vorbereiten. Sende einen Sticker mit höchstens 6 Sekunden Länge, mit oder ohne Ton.',
  },
};
