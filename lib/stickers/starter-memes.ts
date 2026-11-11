import type {Collection,Sticker} from './types';
import {HOME_MEMES} from './home-memes';
export const MEMES_FOLDER_ID='zapstick-memes-v1';

/** A one-time addition. User edits, deletion, ordering and restored backups win. */
export function withStarterMemes(value:Collection,localize:(source:string)=>string=source=>source,suppressed=false):Collection{
 if(value.starterMemesVersion===1)return value;
 const marked:Collection={...value,starterMemesVersion:1};
 if(suppressed||value.stickers.length+HOME_MEMES.length>2000||(value.folders?.length??0)>=200)return marked;
 const folder=value.folders?.find(item=>item.id===MEMES_FOLDER_ID),now=Date.now();
 const starters:Sticker[]=HOME_MEMES.filter(meme=>!value.stickers.some(sticker=>sticker.id===`zapstick-meme-v1-${meme.id}`)).map((meme,index)=>({id:`zapstick-meme-v1-${meme.id}`,name:localize(meme.name),packId:'',folderId:MEMES_FOLDER_ID,kind:'animated',mime:'image/gif',src:meme.src,sourceUrl:meme.sourceUrl,favorite:false,createdAt:now-index,isSticker:false}));
 return {...marked,folders:folder?value.folders:[...(value.folders??[]),{id:MEMES_FOLDER_ID,name:localize('Mèmes'),color:'#bfe8b0'}],stickers:[...value.stickers,...starters]};
}
