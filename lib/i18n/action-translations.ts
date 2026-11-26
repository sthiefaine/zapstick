import type {Locale} from './config';
const sources=['Confirmer la suppression','Supprimer « {name} » ?','Supprimer ces {count} stickers ?','Sélectionner','Tout sélectionner','Tout désélectionner','Supprimer ({count})'] as const;
const messages:Record<Locale,readonly string[]>={
 fr:sources,
 en:['Confirm deletion','Delete “{name}”?','Delete these {count} stickers?','Select','Select all','Deselect all','Delete ({count})'],
 'pt-BR':['Confirmar exclusão','Excluir “{name}”?','Excluir estas {count} figurinhas?','Selecionar','Selecionar tudo','Desmarcar tudo','Excluir ({count})'],
 es:['Confirmar eliminación','¿Eliminar «{name}»?','¿Eliminar estos {count} stickers?','Seleccionar','Seleccionar todo','Deseleccionar todo','Eliminar ({count})'],
 de:['Löschen bestätigen','„{name}“ löschen?','Diese {count} Sticker löschen?','Auswählen','Alle auswählen','Auswahl aufheben','Löschen ({count})'],
 'zh-CN':['确认删除','删除“{name}”？','删除这 {count} 张贴纸？','选择','全选','取消全选','删除（{count}）'],
 ja:['削除の確認','「{name}」を削除しますか？','この{count}個のスタンプを削除しますか？','選択','すべて選択','すべて選択解除','削除（{count}）'],
 ru:['Подтвердить удаление','Удалить «{name}»?','Удалить эти стикеры ({count})?','Выбрать','Выбрать всё','Снять выделение','Удалить ({count})'],
};
export const actionTranslations=Object.fromEntries(Object.entries(messages).map(([locale,values])=>[locale,Object.fromEntries(sources.map((source,index)=>[source,values[index]]))])) as Record<Locale,Record<string,string>>;
