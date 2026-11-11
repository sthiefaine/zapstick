import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Zapstick — Bibliothèque de stickers',description:'Crée tes stickers WhatsApp, transforme tes images et GIF, et organise tous tes favoris dans tes packs.',referrer:'no-referrer',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="fr"><body>{children}</body></html>;}
