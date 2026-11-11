'use client';

import {useId, useState} from 'react';
import {ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Minus, Plus, Trash2} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {createEmoji, EMOJI_CHOICES, MAX_EMOJIS, MAX_TEXT_LENGTH, moveEmoji, normalizeEmojis, normalizeTextStyle, OVERLAY_COLORS, OVERLAY_FONTS, type EmojiOverlay, type OverlaySelection, type TextStyle} from '@/lib/stickers/overlays';
import styles from './text-style-controls.module.css';

export type OverlayControlProps = {
  text: string;
  textStyle?: Partial<TextStyle>;
  emojis?: readonly EmojiOverlay[];
  selectedId: OverlaySelection;
  onSelect: (id: OverlaySelection) => void;
  onChangeTextStyle: (style: TextStyle) => void;
  onChangeEmojis: (emojis: EmojiOverlay[]) => void;
  disabled?: boolean;
};
type Props = OverlayControlProps & {onChangeText: (text: string) => void; mode?: 'text' | 'emoji' | 'all'};
const FONT_NAMES = {sans: 'Simple', serif: 'Élégant', mono: 'Machine'} as const;
const DIRECTIONS = [
  {label: 'Vers la gauche', x: -10, y: 0, Icon: ArrowLeft},
  {label: 'Vers le haut', x: 0, y: -10, Icon: ArrowUp},
  {label: 'Vers le bas', x: 0, y: 10, Icon: ArrowDown},
  {label: 'Vers la droite', x: 10, y: 0, Icon: ArrowRight},
] as const;

/** Controlled editor: keep its props in EditOptions; the stage uses the same values. */
export function TextStyleControls({text, textStyle, emojis = [], selectedId, onSelect, onChangeText, onChangeTextStyle, onChangeEmojis, disabled = false, mode = 'all'}: Props) {
  const {t} = usePreferences(), id = useId();
  const style = normalizeTextStyle(textStyle), items = normalizeEmojis(emojis);
  const selected = mode === 'text' ? undefined : items.find(item => item.id === selectedId);
  const [customBackground, setCustomBackground] = useState('#14874d');
  const [customEmoji, setCustomEmoji] = useState(''), [emojiError, setEmojiError] = useState(false);
  function update(patch: Partial<TextStyle>) { onChangeTextStyle(normalizeTextStyle({...style, ...patch})); }
  function updateEmoji(patch: Partial<EmojiOverlay>) {
    if (!selected) return;
    onChangeEmojis(normalizeEmojis(items.map(item => item.id === selected.id ? {...item, ...patch} : item)));
  }
  function addEmoji(emoji: string) {
    const item = createEmoji(emoji, items);
    if (!item) return false;
    onChangeEmojis([...items, item]); onSelect(item.id); setEmojiError(false);
    return true;
  }
  function addCustomEmoji() {
    if (disabled || items.length >= MAX_EMOJIS) return;
    if (!addEmoji(customEmoji)) { setEmojiError(true); return; }
    setCustomEmoji('');
  }
  const backgroundMode = style.background === 'transparent' ? 'off' : style.background === '#fffdf6' ? 'light' : style.background === '#17251c' ? 'dark' : 'custom';
  const currentSize = selected ? selected.size : style.size;
  return <div className={styles.controls}>
    {mode !== 'emoji' ? <>
    <div className={styles.group}>
      <label className={styles.label} htmlFor={`${id}-text`}>{t('Texte du sticker')}</label>
      <textarea id={`${id}-text`} className={styles.textInput} rows={2} maxLength={MAX_TEXT_LENGTH} value={text} placeholder={t('Écris ton texte')} disabled={disabled} onFocus={() => onSelect('text')} onChange={event => { onChangeText(event.target.value); onSelect('text'); }}/>
    </div>
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.label}>{t('Police')}</legend>
      <div className={styles.fonts}>
        {(['sans', 'serif', 'mono'] as const).map(font => <button type="button" key={font} aria-pressed={style.font === font} className={styles.option} style={{fontFamily: OVERLAY_FONTS[font].family, fontWeight: OVERLAY_FONTS[font].weight}} onClick={() => update({font})}>{t(FONT_NAMES[font])}</button>)}
      </div>
    </fieldset>
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.label}>{t('Couleur du texte')}</legend>
      <div className={styles.colors}>
        {OVERLAY_COLORS.map(color => <button type="button" key={color} className={styles.color} style={{backgroundColor: color, color: color === '#17251c' ? '#ffffff' : '#17251c'}} aria-label={t('Couleur du texte : {color}', {color})} aria-pressed={style.color === color} onClick={() => update({color})}>{style.color === color ? <Check size={20} aria-hidden="true"/> : null}</button>)}
        <label className={styles.customColor} title={t('Couleur personnalisée')}><span className="sr-only">{t('Couleur personnalisée')}</span><input type="color" value={style.color} onChange={event => update({color: event.target.value})}/></label>
      </div>
    </fieldset>
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.label}>{t('Fond du texte')}</legend>
      <div className={styles.backgrounds}>
        {([{id: 'off', label: 'Sans fond', color: 'transparent'}, {id: 'light', label: 'Clair', color: '#fffdf6'}, {id: 'dark', label: 'Sombre', color: '#17251c'}, {id: 'custom', label: 'Couleur', color: backgroundMode === 'custom' ? style.background : customBackground}] as const).map(item => <button type="button" key={item.id} className={styles.option} aria-pressed={backgroundMode === item.id} onClick={() => update({background: item.color})}>{t(item.label)}</button>)}
      </div>
      {backgroundMode === 'custom' ? <label className={styles.backgroundColor}><span>{t('Couleur du fond du texte')}</span><input type="color" value={style.background} onChange={event => { setCustomBackground(event.target.value); update({background: event.target.value}); }}/></label> : null}
    </fieldset>
    </> : null}
    {mode !== 'text' ?
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.label}>{t('Émojis')} <span className={styles.count}>{items.length}/{MAX_EMOJIS}</span></legend>
      <div className={styles.emojiPicker}>
        {EMOJI_CHOICES.map(item => <button type="button" key={item.emoji} className={styles.emojiChoice} disabled={items.length >= MAX_EMOJIS} aria-label={t('Ajouter : {emoji}', {emoji: t(item.label)})} onClick={() => addEmoji(item.emoji)}><span aria-hidden="true">{item.emoji}</span></button>)}
      </div>
      <label className={styles.customEmojiLabel} htmlFor={`${id}-emoji`}>{t('Ton émoji')}</label>
      <div className={styles.customEmojiRow}>
        <input id={`${id}-emoji`} className={styles.customEmojiInput} type="text" maxLength={32} placeholder="😊" value={customEmoji} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="done" disabled={items.length >= MAX_EMOJIS} aria-invalid={emojiError || undefined} aria-describedby={emojiError ? `${id}-emoji-error` : undefined} onChange={event => { setCustomEmoji(event.target.value); setEmojiError(false); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); addCustomEmoji(); } }}/>
        <button type="button" className={styles.option} disabled={items.length >= MAX_EMOJIS || !customEmoji} onClick={addCustomEmoji}>{t('Ajouter l’émoji')}</button>
      </div>
      {emojiError ? <p id={`${id}-emoji-error`} className={styles.emojiError} role="alert">{t('Commence par un émoji valide.')}</p> : null}
      {items.length >= MAX_EMOJIS ? <p className={styles.note} role="status">{t('Tu peux ajouter jusqu’à 8 émojis.')}</p> : null}
      {items.length ? <div className={styles.addedEmojis} role="group" aria-label={t('Émojis sur le sticker')}>{items.map((item, index) => <button type="button" key={item.id} className={styles.emojiChoice} aria-label={t('Sélectionner l’émoji {number}', {number: index + 1})} aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}><span aria-hidden="true">{item.emoji}</span></button>)}</div> : null}
    </fieldset> : null}
    {(selected || (mode !== 'emoji' && text.trim())) ? <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.label}>{selected ? t('Émoji sélectionné') : t('Position du texte')}</legend>
      {selected && mode === 'all' ? <button type="button" className={styles.textSelection} onClick={() => onSelect('text')} disabled={!text.trim()}>{t('Sélectionner le texte')}</button> : null}
      <div className={styles.sizeRow}>
        <span>{t('Taille')}</span>
        <button type="button" className={styles.iconButton} aria-label={t('Réduire la taille')} onClick={() => selected ? updateEmoji({size: currentSize - 4}) : update({size: currentSize - 2})}><Minus size={18} aria-hidden="true"/></button>
        <input aria-label={t('Taille')} type="range" min={selected ? 32 : 24} max={selected ? 160 : 96} step="2" value={currentSize} onChange={event => selected ? updateEmoji({size: Number(event.target.value)}) : update({size: Number(event.target.value)})}/>
        <button type="button" className={styles.iconButton} aria-label={t('Augmenter la taille')} onClick={() => selected ? updateEmoji({size: currentSize + 4}) : update({size: currentSize + 2})}><Plus size={18} aria-hidden="true"/></button>
      </div>
      <div className={styles.positions} role="group" aria-label={selected ? t('Déplacer l’émoji') : t('Déplacer le texte')}>
        {DIRECTIONS.map(({label, x, y, Icon}) => <button type="button" key={label} className={styles.iconButton} aria-label={t(label)} onClick={() => { if (selected) updateEmoji(moveEmoji(selected, selected.x + x, selected.y + y)); else update({x: style.x + x, y: style.y + y}); }}><Icon size={18} aria-hidden="true"/></button>)}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.textSelection} onClick={() => selected ? updateEmoji({x: 256, y: 256}) : update({x: 256, y: 440})}>{t('Recentrer')}</button>
        {selected ? <button type="button" className={styles.remove} onClick={() => { onChangeEmojis(items.filter(item => item.id !== selected.id)); onSelect(null); }}><Trash2 size={17} aria-hidden="true"/>{t('Supprimer l’émoji')}</button> : null}
      </div>
    </fieldset> : null}
  </div>;
}
