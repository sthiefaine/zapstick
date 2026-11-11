export const dynamic='force-dynamic';
export function GET(){return Response.json({status:'ok',service:'zapstick'},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});}
