import type {Locale} from '@/lib/i18n/config';
import {privacySections,legalSections} from './content';

export const privacyUiSources = [
 'Confidentialité et données',
 'Effacer les données de cet appareil',
 'Effacer la collection et les préférences ?',
 'Cette action supprime les médias, packs, favoris et préférences enregistrés par Zapstick dans ce navigateur. Les sauvegardes et fichiers déjà téléchargés ne sont pas supprimés. Cette action ne peut pas être annulée.',
 'Annuler',
 'Effacement…',
 'Tout effacer',
 'Les données locales ont été effacées.',
 'Impossible d’effacer les données. Réessaie.',
 'Impossible d’effacer les données locales. Réessaie.',
 'L’effacement a été interrompu. Réessaie.',
 'Impossible de lire la collection locale.',
 'Retour à Zapstick',
 'Confidentialité',
 'Mentions légales',
 'Comprendre ce qui reste sur ton appareil et ce qui est transmis aux services externes.',
 'Informations sur l’éditeur et l’utilisation du service.',
 'Éditeur et contact',
 'Éditeur',
 'Pays',
 'Contact confidentialité',
 'Ressources sur la protection des données',
 'Cookies et préférences — CNIL',
 'Exercer ses droits — CNIL',
 'Adresser une réclamation à la CNIL',
 'Ouvrir l’atelier',
 'Adresse de l’éditeur',
 'Statut juridique',
 'Immatriculation',
 'Direction de la publication',
] as const;

type TranslatedDocument={privacy:readonly (readonly [string,string])[];legal:readonly (readonly [string,string])[];ui:readonly string[]};
const documents:Record<Exclude<Locale,'fr'>,TranslatedDocument>={
 en:{
  privacy:[
   ['Your files stay on your device','Images, videos, stickers, names, favorites and packs are stored in IndexedDB in your browser. They are not sent to the Zapstick server. You can edit, export or delete them in the app.'],
   ['Why this data is used','The requested features — importing, creating, organizing and local saving — provide the service (GDPR Article 6(1)(b), where applicable). Connection information needed for security is processed on the legitimate interest of protecting the service (Article 6(1)(f)). Technical preferences apply your choices without advertising tracking.'],
   ['Preferences and tracking','Zapstick remembers your language and theme choices. The app contains no advertising or audience analytics and uses no advertising trackers.'],
   ['When you import a link','For an X link, your browser contacts FxTwitter to find the media, then its host to download it. Media previews and external links also contact their respective sites. These services receive information including your IP address and the requested link; their privacy rules and any international transfers apply.'],
   ['Hosting and technical logs','The hosting provider may process connection information, such as IP addresses and technical logs, to deliver and secure the site. This is separate from your local collection. The terms and retention periods depend on the hosting provider for this instance.'],
   ['Retention','Your collection and preferences remain in your browser until you delete them, reset the site or the browser clears its storage. A downloaded backup stays on your device until you delete it. Local data is not synchronized between devices.'],
   ['Your rights and choices','You can export your collection, correct its items and erase local data in settings. For questions or requests about data processed by the publisher, contact the address below. Depending on the situation, GDPR rights of access, rectification, erasure, restriction, objection and portability may apply. You may also lodge a complaint with the CNIL.'],
  ],
  legal:[
   ['Purpose of the service','Zapstick lets you create and organize stickers from your media. Processing and the collection are local to your browser. The service is not affiliated with or endorsed by WhatsApp or Meta.'],
   ['Your content','Import only content you are authorized to use. You remain responsible for the media you import and share. Zapstick does not publish your collection or synchronize it with a server.'],
   ['Storage and availability','Keep a backup of items you want to retain. Your browser may clear its storage and external services may become unavailable. Import and sharing features also depend on your device and WhatsApp version.'],
   ['Hosting','This instance is deployed with the hosting provider chosen by its administrator. The publisher must enter that provider’s details in the deployment configuration.'],
  ],
  ui:['Privacy and data','Erase data on this device','Erase the collection and preferences?','This deletes the media, packs, favorites and preferences stored by Zapstick in this browser. Backups and previously downloaded files are not deleted. This action cannot be undone.','Cancel','Erasing…','Erase everything','Local data has been erased.','Unable to erase data. Try again.','Unable to erase local data. Try again.','Erasure was interrupted. Try again.','Unable to read the local collection.','Back to Zapstick','Privacy','Legal notice','Understand what stays on your device and what is sent to external services.','Information about the publisher and use of the service.','Publisher and contact','Publisher','Country','Privacy contact','Data protection resources','Cookies and preferences — CNIL','Exercise your rights — CNIL','Lodge a complaint with the CNIL','Open the studio','Publisher address','Legal status','Registration','Publication director'],
 },
 'pt-BR':{
  privacy:[
   ['Seus arquivos ficam no seu dispositivo','Imagens, vídeos, stickers, nomes, favoritos e pacotes são armazenados no IndexedDB do seu navegador. Eles não são enviados ao servidor do Zapstick. Você pode editar, exportar ou excluir esses dados no app.'],
   ['Por que esses dados são usados','As funções solicitadas — importar, criar, organizar e salvar localmente — fornecem o serviço (artigo 6.1.b do RGPD, quando aplicável). As informações de conexão necessárias à segurança baseiam-se no interesse legítimo de proteger o serviço (artigo 6.1.f). As preferências técnicas aplicam suas escolhas sem rastreamento publicitário.'],
   ['Preferências e rastreamento','O Zapstick lembra suas escolhas de idioma e tema. O app não inclui publicidade nem análise de audiência e não usa rastreadores publicitários.'],
   ['Ao importar um link','Para um link do X, seu navegador acessa o FxTwitter para localizar a mídia e depois o servidor que a hospeda para baixá-la. As prévias de mídia e os links externos também acessam os respectivos sites. Esses serviços recebem informações como seu endereço IP e o link solicitado; aplicam-se suas regras de privacidade e eventuais transferências internacionais.'],
   ['Hospedagem e registros técnicos','O provedor de hospedagem pode processar informações de conexão, como endereços IP e registros técnicos, para disponibilizar e proteger o site. Esses dados são separados da coleção local. As condições e os prazos de retenção dependem do provedor desta instalação.'],
   ['Prazo de armazenamento','A coleção e as preferências permanecem no navegador até que você as exclua, redefina o site ou o navegador limpe o armazenamento. Um backup baixado fica no dispositivo até ser excluído. Os dados locais não são sincronizados entre dispositivos.'],
   ['Seus direitos e suas escolhas','Você pode exportar a coleção, corrigir seus itens e apagar os dados locais nas configurações. Para dúvidas ou solicitações sobre dados tratados pelo responsável pelo site, use o contato abaixo. Conforme o caso, podem ser aplicáveis os direitos de acesso, retificação, exclusão, restrição, oposição e portabilidade previstos no RGPD. Você também pode apresentar uma reclamação à CNIL.'],
  ],
  legal:[
   ['Finalidade do serviço','O Zapstick permite criar e organizar stickers a partir das suas mídias. O processamento e a coleção ficam no navegador. O serviço não tem vínculo com o WhatsApp ou a Meta e não é aprovado por essas empresas.'],
   ['Seu conteúdo','Importe apenas conteúdos que você tem autorização para usar. Você continua responsável pelas mídias que importa e compartilha. O Zapstick não publica sua coleção nem a sincroniza com um servidor.'],
   ['Armazenamento e disponibilidade','Mantenha um backup dos itens que deseja conservar. O navegador pode apagar o armazenamento e serviços externos podem ficar indisponíveis. As funções de importação e compartilhamento também dependem do dispositivo e da versão do WhatsApp.'],
   ['Hospedagem','Esta instalação é disponibilizada pelo provedor de hospedagem escolhido pelo administrador. O responsável pelo site deve informar os dados desse provedor na configuração de implantação.'],
  ],
  ui:['Privacidade e dados','Apagar dados deste dispositivo','Apagar a coleção e as preferências?','Isso exclui as mídias, os pacotes, os favoritos e as preferências armazenados pelo Zapstick neste navegador. Os backups e arquivos já baixados não são excluídos. Essa ação não pode ser desfeita.','Cancelar','Apagando…','Apagar tudo','Os dados locais foram apagados.','Não foi possível apagar os dados. Tente novamente.','Não foi possível apagar os dados locais. Tente novamente.','A exclusão foi interrompida. Tente novamente.','Não foi possível ler a coleção local.','Voltar ao Zapstick','Privacidade','Informações legais','Entenda o que fica no dispositivo e o que é enviado a serviços externos.','Informações sobre o responsável pelo site e o uso do serviço.','Responsável e contato','Responsável pelo site','País','Contato de privacidade','Recursos de proteção de dados','Cookies e preferências — CNIL','Exercer seus direitos — CNIL','Apresentar uma reclamação à CNIL','Abrir o estúdio','Endereço do responsável','Natureza jurídica','Registro','Responsável pela publicação'],
 },
 es:{
  privacy:[
   ['Tus archivos se quedan en tu dispositivo','Las imágenes, los vídeos, los stickers, los nombres, los favoritos y los paquetes se guardan en IndexedDB, en tu navegador. No se envían al servidor de Zapstick. Puedes editarlos, exportarlos o eliminarlos en la app.'],
   ['Por qué se utilizan estos datos','Las funciones solicitadas — importar, crear, organizar y guardar localmente — permiten prestar el servicio (artículo 6.1.b del RGPD, cuando sea aplicable). La información de conexión necesaria para la seguridad se trata por el interés legítimo de proteger el servicio (artículo 6.1.f). Las preferencias técnicas aplican tus elecciones sin seguimiento publicitario.'],
   ['Preferencias y seguimiento','Zapstick recuerda tus elecciones de idioma y tema. La app no incluye publicidad ni análisis de audiencia y no utiliza rastreadores publicitarios.'],
   ['Cuando importas un enlace','Para un enlace de X, tu navegador contacta con FxTwitter para localizar el archivo y luego con su servidor para descargarlo. Las vistas previas y los enlaces externos también contactan con sus respectivos sitios. Estos servicios reciben información como tu dirección IP y el enlace solicitado; se aplican sus normas de privacidad y las posibles transferencias internacionales.'],
   ['Alojamiento y registros técnicos','El proveedor de alojamiento puede tratar información de conexión, como direcciones IP y registros técnicos, para ofrecer y proteger el sitio. Estos datos son independientes de la colección local. Las condiciones y los plazos de conservación dependen del proveedor de esta instalación.'],
   ['Conservación','La colección y las preferencias permanecen en el navegador hasta que las elimines, restablezcas el sitio o el navegador borre su almacenamiento. Una copia descargada permanece en tu dispositivo hasta que la elimines. Los datos locales no se sincronizan entre dispositivos.'],
   ['Tus derechos y decisiones','Puedes exportar tu colección, corregir sus elementos y borrar los datos locales desde los ajustes. Para consultas o solicitudes sobre los datos tratados por el editor, utiliza el contacto indicado abajo. Según el caso, pueden aplicarse los derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad previstos por el RGPD. También puedes presentar una reclamación ante la CNIL.'],
  ],
  legal:[
   ['Finalidad del servicio','Zapstick permite crear y organizar stickers a partir de tus archivos. El procesamiento y la colección son locales al navegador. El servicio no está afiliado a WhatsApp ni cuenta con la aprobación de WhatsApp o Meta.'],
   ['Tu contenido','Importa únicamente contenido que tengas autorización para utilizar. Sigues siendo responsable de los archivos que importas y compartes. Zapstick no publica tu colección ni la sincroniza con un servidor.'],
   ['Conservación y disponibilidad','Guarda una copia de los elementos que desees conservar. El navegador puede borrar su almacenamiento y los servicios externos pueden dejar de estar disponibles. Las funciones de importación y uso compartido también dependen del dispositivo y de la versión de WhatsApp.'],
   ['Alojamiento','Esta instalación utiliza el proveedor de alojamiento elegido por su administrador. El editor debe introducir los datos de ese proveedor en la configuración del despliegue.'],
  ],
  ui:['Privacidad y datos','Borrar los datos de este dispositivo','¿Borrar la colección y las preferencias?','Esto elimina los archivos, los paquetes, los favoritos y las preferencias guardados por Zapstick en este navegador. No se eliminan las copias de seguridad ni los archivos ya descargados. Esta acción no se puede deshacer.','Cancelar','Borrando…','Borrar todo','Se han borrado los datos locales.','No se han podido borrar los datos. Inténtalo de nuevo.','No se han podido borrar los datos locales. Inténtalo de nuevo.','El borrado se ha interrumpido. Inténtalo de nuevo.','No se ha podido leer la colección local.','Volver a Zapstick','Privacidad','Aviso legal','Consulta qué se queda en tu dispositivo y qué se envía a servicios externos.','Información sobre el editor y el uso del servicio.','Editor y contacto','Editor','País','Contacto de privacidad','Recursos de protección de datos','Cookies y preferencias — CNIL','Ejercer tus derechos — CNIL','Presentar una reclamación ante la CNIL','Abrir el estudio','Dirección del editor','Forma jurídica','Registro','Dirección de publicación'],
 },
 de:{
  privacy:[
   ['Deine Dateien bleiben auf deinem Gerät','Bilder, Videos, Sticker, Namen, Favoriten und Pakete werden in IndexedDB in deinem Browser gespeichert. Sie werden nicht an den Zapstick-Server gesendet. Du kannst sie in der App bearbeiten, exportieren oder löschen.'],
   ['Wofür diese Daten verwendet werden','Die angeforderten Funktionen — Import, Erstellung, Organisation und lokale Speicherung — dienen der Bereitstellung des Dienstes (Artikel 6 Absatz 1 Buchstabe b DSGVO, soweit anwendbar). Sicherheitsrelevante Verbindungsdaten werden aufgrund des berechtigten Interesses am Schutz des Dienstes verarbeitet (Artikel 6 Absatz 1 Buchstabe f). Technische Einstellungen setzen deine Auswahl ohne Werbetracking um.'],
   ['Einstellungen und Tracking','Zapstick speichert deine Sprach- und Designauswahl. Die App enthält weder Werbung noch Reichweitenanalyse und verwendet keine Werbetracker.'],
   ['Beim Importieren eines Links','Bei einem X-Link fragt dein Browser FxTwitter nach der Mediendatei und lädt sie anschließend von deren Hostinganbieter herunter. Medienvorschauen und externe Links kontaktieren ebenfalls die jeweiligen Websites. Diese Dienste erhalten unter anderem deine IP-Adresse und den angefragten Link; ihre Datenschutzregeln und mögliche internationale Datenübermittlungen gelten.'],
   ['Hosting und technische Protokolle','Der Hostinganbieter kann Verbindungsdaten wie IP-Adressen und technische Protokolle verarbeiten, um die Website bereitzustellen und abzusichern. Diese Daten sind von deiner lokalen Sammlung getrennt. Bedingungen und Aufbewahrungsfristen richten sich nach dem Hostinganbieter dieser Instanz.'],
   ['Speicherdauer','Sammlung und Einstellungen bleiben im Browser, bis du sie löschst, die Website zurücksetzt oder der Browser seinen Speicher leert. Eine heruntergeladene Sicherung bleibt auf deinem Gerät, bis du sie löschst. Lokale Daten werden nicht zwischen Geräten synchronisiert.'],
   ['Deine Rechte und Möglichkeiten','Du kannst deine Sammlung exportieren, Einträge berichtigen und lokale Daten in den Einstellungen löschen. Bei Fragen oder Anträgen zu Daten, die der Betreiber verarbeitet, nutze die unten genannte Kontaktadresse. Je nach Situation können die DSGVO-Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und Datenübertragbarkeit gelten. Du kannst dich außerdem bei der CNIL beschweren.'],
  ],
  legal:[
   ['Zweck des Dienstes','Mit Zapstick kannst du Sticker aus deinen Medien erstellen und organisieren. Verarbeitung und Sammlung bleiben lokal im Browser. Der Dienst ist weder mit WhatsApp verbunden noch von WhatsApp oder Meta genehmigt.'],
   ['Deine Inhalte','Importiere nur Inhalte, zu deren Nutzung du berechtigt bist. Du bleibst für importierte und geteilte Medien verantwortlich. Zapstick veröffentlicht deine Sammlung nicht und synchronisiert sie nicht mit einem Server.'],
   ['Aufbewahrung und Verfügbarkeit','Sichere alle Einträge, die du behalten möchtest. Der Browser kann seinen Speicher löschen und externe Dienste können ausfallen. Import- und Freigabefunktionen hängen auch von deinem Gerät und deiner WhatsApp-Version ab.'],
   ['Hosting','Diese Instanz wird beim vom Administrator gewählten Hostinganbieter betrieben. Der Betreiber muss die Angaben dieses Anbieters in der Bereitstellungskonfiguration eintragen.'],
  ],
  ui:['Datenschutz und Daten','Daten auf diesem Gerät löschen','Sammlung und Einstellungen löschen?','Dabei werden die von Zapstick in diesem Browser gespeicherten Medien, Pakete, Favoriten und Einstellungen gelöscht. Sicherungen und bereits heruntergeladene Dateien werden nicht gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.','Abbrechen','Wird gelöscht…','Alles löschen','Die lokalen Daten wurden gelöscht.','Daten konnten nicht gelöscht werden. Versuche es erneut.','Lokale Daten konnten nicht gelöscht werden. Versuche es erneut.','Der Löschvorgang wurde unterbrochen. Versuche es erneut.','Die lokale Sammlung konnte nicht gelesen werden.','Zurück zu Zapstick','Datenschutz','Rechtliche Hinweise','Erfahre, was auf deinem Gerät bleibt und was an externe Dienste gesendet wird.','Informationen zum Betreiber und zur Nutzung des Dienstes.','Betreiber und Kontakt','Betreiber','Land','Datenschutzkontakt','Informationen zum Datenschutz','Cookies und Einstellungen — CNIL','Deine Rechte ausüben — CNIL','Beschwerde bei der CNIL einreichen','Studio öffnen','Anschrift des Betreibers','Rechtsform','Registrierung','Verantwortlich für die Veröffentlichung'],
 },
 'zh-CN':{
  privacy:[
   ['文件保留在你的设备上','图片、视频、贴纸、名称、收藏和贴纸包保存在浏览器的 IndexedDB 中，不会发送到 Zapstick 服务器。你可以在应用中编辑、导出或删除这些数据。'],
   ['这些数据的用途','你请求的导入、制作、整理和本地保存功能用于提供服务（适用时依据 GDPR 第 6 条第 1 款 b 项）。安全所需的连接信息基于保护服务的合法利益进行处理（第 6 条第 1 款 f 项）。技术偏好仅用于应用你的选择，不进行广告跟踪。'],
   ['偏好设置与跟踪','Zapstick 会记住你选择的语言和主题。应用不含广告或访问量分析，也不使用广告跟踪器。'],
   ['导入链接时','导入 X 链接时，浏览器会联系 FxTwitter 查找媒体，然后从媒体托管方下载文件。媒体预览和外部链接也会访问相应网站。这些服务会收到你的 IP 地址、请求的链接等信息，并适用其隐私规则及可能涉及的国际数据传输规则。'],
   ['托管与技术日志','托管服务商可能处理 IP 地址、技术日志等连接信息，以提供网站服务并保障安全。这些信息与本地贴纸库分开。处理条件和保存期限由当前实例的托管服务商决定。'],
   ['保存期限','贴纸库和偏好会一直保存在浏览器中，直到你主动删除、重置网站，或浏览器清除存储。下载的备份会保留在设备上，直到你删除它。本地数据不会在不同设备之间同步。'],
   ['你的权利与选择','你可以在设置中导出贴纸库、修改其中的项目，或清除本地数据。如对网站运营者处理的数据有疑问或请求，请使用下方联系方式。视具体情况，GDPR 规定的访问、更正、删除、限制处理、反对处理和数据可携带权可能适用。你也可以向法国 CNIL 提出投诉。'],
  ],
  legal:[
   ['服务用途','Zapstick 让你用自己的媒体制作和整理贴纸。处理操作和贴纸库都保留在浏览器本地。本服务与 WhatsApp 无隶属关系，也未经 WhatsApp 或 Meta 认可。'],
   ['你的内容','请仅导入你有权使用的内容。你须对导入和分享的媒体负责。Zapstick 不会发布你的贴纸库，也不会将其同步到服务器。'],
   ['保存与可用性','请备份你想保留的项目。浏览器可能清除存储，外部服务也可能无法使用。导入和分享功能还取决于你的设备及 WhatsApp 版本。'],
   ['托管','此实例部署在管理员选择的托管服务商处。网站运营者须在部署配置中填写该服务商的信息。'],
  ],
  ui:['隐私与数据','清除此设备上的数据','清除贴纸库和偏好设置？','这会删除 Zapstick 在此浏览器中保存的媒体、贴纸包、收藏和偏好设置，不会删除备份或已下载的文件。此操作无法撤销。','取消','正在清除…','全部清除','本地数据已清除。','无法清除数据，请重试。','无法清除本地数据，请重试。','清除操作已中断，请重试。','无法读取本地贴纸库。','返回 Zapstick','隐私政策','法律声明','了解哪些数据保留在设备上，以及哪些数据会发送给外部服务。','关于网站运营者及服务使用的信息。','运营者与联系方式','运营者','国家','隐私联系邮箱','数据保护资料','Cookie 与偏好设置 — CNIL','行使你的权利 — CNIL','向 CNIL 提出投诉','打开工作室','运营者地址','法律形式','注册信息','出版负责人'],
 },
 ja:{
  privacy:[
   ['ファイルは端末に保存されます','画像、動画、ステッカー、名前、お気に入り、パックはブラウザーの IndexedDB に保存されます。Zapstick のサーバーには送信されません。アプリ内で編集、書き出し、削除ができます。'],
   ['データの利用目的','要求された読み込み、作成、整理、ローカル保存の機能は、サービスの提供を目的とします（該当する場合、GDPR 第6条第1項b号）。安全確保に必要な接続情報は、サービスを保護する正当な利益に基づいて処理されます（同f号）。技術設定は広告追跡を行わず、利用者の選択を適用します。'],
   ['設定とトラッキング','Zapstick は言語とテーマの選択を記憶します。アプリには広告やアクセス解析はなく、広告トラッカーも使用しません。'],
   ['リンクを読み込むとき','X のリンクでは、ブラウザーが FxTwitter に接続してメディアを探し、そのホスティング元からダウンロードします。メディアのプレビューや外部リンクも、それぞれのサイトに接続します。これらのサービスには IP アドレスや要求したリンクなどが送信され、各サービスのプライバシー規則や、該当する国際データ移転の規則が適用されます。'],
   ['ホスティングと技術ログ','ホスティング事業者は、サイトの提供と安全確保のため、IP アドレスや技術ログなどの接続情報を処理する場合があります。これらは端末内のコレクションとは別の情報です。条件と保存期間は、このインスタンスのホスティング事業者によって異なります。'],
   ['保存期間','コレクションと設定は、利用者による削除、サイトのリセット、またはブラウザーによるストレージの消去まで保存されます。ダウンロードしたバックアップは、削除するまで端末に残ります。ローカルデータは端末間で同期されません。'],
   ['利用者の権利と選択','設定からコレクションの書き出し、項目の修正、ローカルデータの削除ができます。運営者が処理するデータについての質問や請求は、下記の連絡先へお問い合わせください。状況に応じて、GDPR に定めるアクセス、訂正、消去、処理制限、異議申立て、データポータビリティの権利が適用される場合があります。フランスの CNIL に苦情を申し立てることもできます。'],
  ],
  legal:[
   ['サービスの目的','Zapstick では、自分のメディアからステッカーを作成し、整理できます。処理とコレクションの保存はブラウザー内で行われます。本サービスは WhatsApp と提携しておらず、WhatsApp または Meta の承認を受けていません。'],
   ['利用者のコンテンツ','使用する権利のあるコンテンツだけを読み込んでください。読み込んだメディアとその共有に関する責任は利用者にあります。Zapstick はコレクションを公開せず、サーバーへの同期も行いません。'],
   ['保存と可用性','保存しておきたい項目はバックアップしてください。ブラウザーがストレージを消去したり、外部サービスが利用できなくなったりする場合があります。読み込みと共有の機能は、端末や WhatsApp のバージョンにも依存します。'],
   ['ホスティング','このインスタンスは、管理者が選択したホスティング事業者で運用されています。運営者は、その事業者の情報をデプロイ設定に入力する必要があります。'],
  ],
  ui:['プライバシーとデータ','この端末のデータを消去','コレクションと設定を消去しますか？','このブラウザーに Zapstick が保存したメディア、パック、お気に入り、設定を削除します。バックアップやダウンロード済みのファイルは削除されません。この操作は取り消せません。','キャンセル','消去中…','すべて消去','ローカルデータを消去しました。','データを消去できません。もう一度お試しください。','ローカルデータを消去できません。もう一度お試しください。','消去が中断されました。もう一度お試しください。','ローカルのコレクションを読み込めません。','Zapstick に戻る','プライバシー','法的情報','端末に残るデータと、外部サービスに送信されるデータを確認できます。','運営者とサービスの利用についての情報です。','運営者と連絡先','運営者','国','プライバシーに関する連絡先','データ保護に関する情報','Cookie と設定 — CNIL','権利の行使 — CNIL','CNIL に苦情を申し立てる','スタジオを開く','運営者の住所','法的形態','登録情報','発行責任者'],
 },
 ru:{
  privacy:[
   ['Ваши файлы остаются на устройстве','Изображения, видео, стикеры, названия, избранное и наборы хранятся в IndexedDB вашего браузера. Они не отправляются на сервер Zapstick. Вы можете изменять, экспортировать или удалять их в приложении.'],
   ['Для чего используются данные','Запрошенные функции — импорт, создание, организация и локальное сохранение — обеспечивают предоставление сервиса (статья 6(1)(b) GDPR, когда она применима). Сведения о подключении, необходимые для безопасности, обрабатываются на основании законного интереса в защите сервиса (статья 6(1)(f)). Технические настройки применяют ваш выбор без рекламного отслеживания.'],
   ['Настройки и отслеживание','Zapstick запоминает выбранные язык и тему. В приложении нет рекламы или аналитики посещаемости, и оно не использует рекламные трекеры.'],
   ['При импорте ссылки','Для ссылки X браузер обращается к FxTwitter, чтобы найти медиафайл, а затем загружает его с сервера, на котором он размещён. Предпросмотр файлов и внешние ссылки также обращаются к соответствующим сайтам. Эти сервисы получают, в частности, ваш IP-адрес и запрошенную ссылку; применяются их правила конфиденциальности и возможной международной передачи данных.'],
   ['Хостинг и технические журналы','Провайдер хостинга может обрабатывать сведения о подключении, включая IP-адреса и технические журналы, для работы и защиты сайта. Эти данные отделены от локальной коллекции. Условия и сроки хранения зависят от хостинга данного экземпляра.'],
   ['Срок хранения','Коллекция и настройки остаются в браузере, пока вы их не удалите, не сбросите сайт или браузер не очистит хранилище. Загруженная резервная копия остаётся на устройстве до её удаления. Локальные данные не синхронизируются между устройствами.'],
   ['Ваши права и возможности','В настройках можно экспортировать коллекцию, исправить её элементы и стереть локальные данные. По вопросам и запросам о данных, обрабатываемых владельцем сайта, обращайтесь по указанному ниже адресу. В зависимости от ситуации могут применяться предусмотренные GDPR права на доступ, исправление, удаление, ограничение обработки, возражение и переносимость данных. Также можно подать жалобу во французскую CNIL.'],
  ],
  legal:[
   ['Назначение сервиса','Zapstick позволяет создавать и упорядочивать стикеры из ваших медиафайлов. Обработка и хранение коллекции выполняются локально в браузере. Сервис не связан с WhatsApp и не одобрен WhatsApp или Meta.'],
   ['Ваш контент','Импортируйте только контент, который вы имеете право использовать. Вы несёте ответственность за импортируемые и публикуемые файлы. Zapstick не публикует вашу коллекцию и не синхронизирует её с сервером.'],
   ['Хранение и доступность','Создавайте резервные копии элементов, которые хотите сохранить. Браузер может очистить хранилище, а внешние сервисы могут стать недоступны. Функции импорта и обмена также зависят от устройства и версии WhatsApp.'],
   ['Хостинг','Этот экземпляр размещён у провайдера, выбранного администратором. Владелец сайта должен указать сведения о провайдере в конфигурации развёртывания.'],
  ],
  ui:['Конфиденциальность и данные','Стереть данные на этом устройстве','Стереть коллекцию и настройки?','Будут удалены медиафайлы, наборы, избранное и настройки, сохранённые Zapstick в этом браузере. Резервные копии и ранее загруженные файлы не удаляются. Это действие нельзя отменить.','Отмена','Удаление…','Стереть всё','Локальные данные стёрты.','Не удалось стереть данные. Повторите попытку.','Не удалось стереть локальные данные. Повторите попытку.','Удаление прервано. Повторите попытку.','Не удалось прочитать локальную коллекцию.','Вернуться в Zapstick','Конфиденциальность','Правовая информация','Узнайте, что остаётся на устройстве и что передаётся внешним сервисам.','Информация о владельце сайта и использовании сервиса.','Владелец и контакты','Владелец сайта','Страна','Контакт по вопросам конфиденциальности','Материалы о защите данных','Файлы cookie и настройки — CNIL','Реализация ваших прав — CNIL','Подать жалобу в CNIL','Открыть студию','Адрес владельца','Правовой статус','Регистрация','Ответственный за публикацию'],
 },
};

function translatedDocument(value:TranslatedDocument):Record<string,string>{
 if(value.privacy.length!==privacySections.length||value.legal.length!==legalSections.length||value.ui.length!==privacyUiSources.length)throw new Error('Incomplete privacy translations');
 const dictionary:Record<string,string>={};
 privacySections.forEach((source,i)=>{dictionary[source.title]=value.privacy[i][0];dictionary[source.body]=value.privacy[i][1];});
 legalSections.forEach((source,i)=>{dictionary[source.title]=value.legal[i][0];dictionary[source.body]=value.legal[i][1];});
 privacyUiSources.forEach((source,i)=>{dictionary[source]=value.ui[i];});
 return dictionary;
}
export const privacyTranslations:Record<Locale,Record<string,string>>={fr:{},en:translatedDocument(documents.en),'pt-BR':translatedDocument(documents['pt-BR']),es:translatedDocument(documents.es),de:translatedDocument(documents.de),'zh-CN':translatedDocument(documents['zh-CN']),ja:translatedDocument(documents.ja),ru:translatedDocument(documents.ru)};
