/** Local reaction media. Attribution and source URLs are in /memes/SOURCES.txt.
 * Keep IDs and URLs stable: the collection initializer uses them only once. */
export const HOME_MEMES = [
  {id:'dancing-cat',name:'Ça danse',src:'/memes/dancing-cat.gif',poster:'/memes/dancing-cat.webp',sourceUrl:'https://tenor.com/fr/view/lumedoallumenaria-dancing-cat-ai-ai-cat-tiktok-dancing-ai-cat-tiktok-cat-gif-15837622393601447268'},
  {id:'jumping-cat',name:'Trop content',src:'/memes/jumping-cat.gif',poster:'/memes/jumping-cat.webp',sourceUrl:'https://tenor.com/fr/view/cat-jump-happy-jumping-for-joy-jumping-gif-23625303'},
  {id:'working-cat',name:'Au boulot',src:'/memes/working-cat.gif',poster:'/memes/working-cat.webp',sourceUrl:'https://tenor.com/view/work-cat-typing-computer-cute-gif-8373772'},
  {id:'cooking-monkey',name:'Ça cuisine',src:'/memes/cooking-monkey.gif',poster:'/memes/cooking-monkey.webp',sourceUrl:'https://tenor.com/view/cook-monkey-monkey-turn-bake-monkey-monkey-bake-monkey-cook-gif-272961148911171409'},
  {id:'side-eye-dog',name:'Vraiment ?',src:'/memes/side-eye-dog.gif',poster:'/memes/side-eye-dog.webp',sourceUrl:'https://tenor.com/view/side-eye-sus-dog-gif-11510602255708878692'},
  {id:'happy-dog',name:'Bonne humeur',src:'/memes/happy-dog.gif',poster:'/memes/happy-dog.webp',sourceUrl:'https://tenor.com/view/happy-dog-dance-dancing-dog-gif-12310143'},
] as const;

export type HomeMeme = (typeof HOME_MEMES)[number];
