import {handleWhatsAppRequest} from '@/lib/server/whatsapp-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handleWhatsAppRequest;
