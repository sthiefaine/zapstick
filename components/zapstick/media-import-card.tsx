'use client';

import {usePreferences} from '@/components/preferences-provider';
import styles from './media-import-card.module.css';

/** A local SVG motif, never sample media. Its short entrance animation settles
 * after two breaths; pointer feedback and reduced-motion choices are respected. */
export function MediaImportCard({onChoose, disabled = false, dragActive = false}: {onChoose: () => void; disabled?: boolean; dragActive?: boolean}) {
  const {t} = usePreferences();
  return <button type="button" className={`${styles.card}${dragActive ? ` ${styles.dragActive}` : ''}`} disabled={disabled} onClick={onChoose}>
    <svg className={styles.art} viewBox="0 0 200 168" fill="none" aria-hidden="true" focusable="false">
      <g className={styles.photo} transform="rotate(-15 39 79)">
        <rect x="14" y="49" width="51" height="59" rx="12" className={styles.photoPaper}/>
        <rect x="22" y="58" width="35" height="33" rx="5" className={styles.photoWindow}/>
        <path d="m23 84 10-10 7 7 6-6 10 11" className={styles.line}/>
        <circle cx="47" cy="66" r="3" className={styles.sun}/>
        <path d="M28 99h23" className={styles.line}/>
      </g>
      <g className={styles.gif} transform="rotate(12 162 103)">
        <rect x="137" y="77" width="50" height="54" rx="12" className={styles.gifPaper}/>
        <path d="m158 87 11 7-11 7Z" className={styles.play}/>
        <text x="162" y="119" textAnchor="middle" className={styles.gifText}>GIF</text>
      </g>
      <g className={styles.sticker}>
        <path d="M78 25h46c15 0 26 11 26 26v36l-35 35H78c-15 0-26-11-26-26V51c0-15 11-26 26-26Z" className={styles.stickerPaper}/>
        <path d="M115 122v-21c0-9 6-14 15-14h20" className={styles.peel}/>
        <path d="M80 59v7m29-7v7M78 82c8 11 21 13 32 0" className={styles.face}/>
      </g>
      <path d="m161 29 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" className={styles.spark}/>
      <circle cx="35" cy="132" r="4" className={styles.dot}/>
    </svg>
    <strong>{t('Sélectionner un média')}</strong>
  </button>;
}
