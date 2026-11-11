// Store-only ZIP writer. No third-party upload is needed to export a pack.
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const b of bytes)crc=(crc>>>8)^crcTable[(crc^b)&255];return(crc^0xffffffff)>>>0;}
export async function zip(files:{name:string;blob:Blob}[]):Promise<Blob>{
  const chunks:BlobPart[]=[],central:BlobPart[]=[];let offset=0,size=0;
  for(const file of files){const name=new TextEncoder().encode(file.name),data=new Uint8Array(await file.blob.arrayBuffer()),crc=crc32(data);const head=new Uint8Array(30),v=new DataView(head.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);chunks.push(head,name,data);
  const c=new Uint8Array(46),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);central.push(c,name);size+=c.length+name.length;offset+=head.length+name.length+data.length;}
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});
}
