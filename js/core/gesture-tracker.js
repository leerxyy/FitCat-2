const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export function validHand(hand) { return Array.isArray(hand) && hand.length >= 21 && hand.slice(0,21).every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)); }
export function handPose(hand) {
 const tips=[8,12,16,20], extended=index=>hand[index].y<hand[index-2].y;
 const thumb = distance(hand[4],hand[5]) > distance(hand[3],hand[5])*1.15;
 if (extended(20) && thumb && [8,12,16].every(index=>!extended(index))) return 'shaka';
 if (tips.every(index=>!extended(index))) return 'fist';
 if (tips.every(extended)) return 'palm';
 return '';
}
export class GestureTracker {
 constructor(){this.reset();}
 reset(){this.pinch=false;this.previous=null;this.origin=null;this.cooldown=0;this.pose='';this.poseAt=0;this.handled='';}
 update(hand,now=performance.now()) {
  if(!validHand(hand)){this.reset();return null;}
  const point=hand[8], palm=hand[0], gap=distance(hand[4],point);
  const pinch=gap < (this.pinch ? .065 : .045), pinchStarted=pinch&&!this.pinch;this.pinch=pinch;
  const result={pointer:{x:Math.max(0,Math.min(1,1-point.x)),y:Math.max(0,Math.min(1,point.y))},pinch,pinchStarted,swipe:0,scroll:0,poseAction:''};
  if(!this.origin||now-this.origin.at>320)this.origin={x:palm.x,y:palm.y,at:now};
  const dx=palm.x-this.origin.x,dy=palm.y-this.origin.y;
  const moving=this.previous&&distance(palm,this.previous)>.012;
  if(!pinch&&now>=this.cooldown&&Math.abs(dx)>.085&&Math.abs(dx)>Math.abs(dy)*1.25){result.swipe=dx<0?1:-1;this.cooldown=now+650;this.origin={x:palm.x,y:palm.y,at:now};}
  if(!pinch&&this.previous){const delta=palm.y-this.previous.y;if(Math.abs(delta)>.004&&Math.abs(dy)>Math.abs(dx))result.scroll=Math.max(-.12,Math.min(.12,delta));}
  // Finishing a palm swipe must not immediately trigger the stationary-palm
  // shortcut and jump back to Today. A fresh pose rearms that shortcut.
  if(result.swipe||result.scroll)this.handled='palm';
  this.previous={x:palm.x,y:palm.y};
  const pose=pinch?'':handPose(hand);
  if(pose!==this.pose||moving||result.swipe){this.pose=pose;this.poseAt=now;}
  if(!pose)this.handled='';
  if(pose&&now-this.poseAt>=450&&this.handled!==pose&&now>=this.cooldown){result.poseAction=pose;this.handled=pose;this.cooldown=now+650;}
  return result;
 }
}
