import {pointerWithin,closestCenter,type CollisionDetection} from '@dnd-kit/core';

/** Keep the pickup tile as a pointer target. Otherwise its containing grid is
 * mistaken for the end-of-list drop zone as soon as a long press activates. */
export const collectionCollisions:CollisionDetection=args=>{
 const kind=args.active.data.current?.kind;
 const containers=args.droppableContainers.filter(container=>{
  const data=container.data.current;
  return data&&(kind==='folder'?data.kind==='folder':true);
 });
 const hits=pointerWithin({...args,droppableContainers:containers});
 if(hits.length){const exact=hits.filter(hit=>containers.find(container=>container.id===hit.id)?.data.current?.kind!=='tail');return exact.length?exact:hits;}
 return args.pointerCoordinates?[]:closestCenter({...args,droppableContainers:containers});
};
