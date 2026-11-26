import {handleWhatsAppRequest} from '@/lib/server/whatsapp-bridge';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const POST = handleWhatsAppRequest;
