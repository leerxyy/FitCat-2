import { COLLECTIBLE_PROFILE_FRAMES, collectibleFrameAsset } from './profile-frames.js';
const spark = (x,y,size=11,delay=0) => `<path class="frame-star" style="--spark-delay:${delay}s;transform-origin:${x}px ${y}px" d="M ${x-size} ${y} Q ${x} ${y-1} ${x} ${y-size*1.7} Q ${x+1} ${y} ${x+size} ${y} Q ${x} ${y+1} ${x} ${y+size*1.7} Q ${x-1} ${y} ${x-size} ${y}Z"></path>`;
function gear(frame, x,y,r,duration,reverse=false,balance=false) {
  const size=r*2,left=x-r,top=y-r;
  return `<span class="collectible-gear${balance?' is-balance':''}" style="left:${left*100}%;top:${top*100}%;width:${size*100}%;height:${size*100}%;--gear-cycle:${duration}s;--gear-direction:${reverse?'reverse':'normal'}"><img src="${collectibleFrameAsset(frame)}" alt="" draggable="false" width="1024" height="1024" style="width:${100/size}%;left:${-left/size*100}%;top:${-top/size*100}%"></span>`;
}
export function collectibleEffectsMarkup(frame) {
  if (!COLLECTIBLE_PROFILE_FRAMES.includes(frame)) return '';
  let parts='';
  if (frame==='dragon') parts=`<g class="frame-cloud cloud-one"><path d="M 63 620 C 27 598 40 562 70 568 C 62 534 111 526 128 548 C 163 542 173 578 143 590 C 170 608 154 632 126 626"></path><path d="M 66 596 C 90 578 106 614 133 594"></path></g><g class="frame-cloud cloud-two"><path d="M 786 182 C 817 195 846 165 834 143 C 859 134 892 150 884 176 C 922 174 941 210 916 227 C 900 243 878 230 862 226"></path></g><circle class="frame-pearl" cx="796" cy="728" r="20"></circle>${spark(286,228,9,-1.5)}${spark(778,725,13,-4.1)}`;
  if (frame==='chronos') parts=`<g class="frame-chronos-outer"><circle cx="512" cy="512" r="475" stroke-dasharray="3 61"></circle><circle cx="512" cy="512" r="487" stroke-dasharray="1 127"></circle></g>${spark(907,190,10,-2.6)}${spark(260,895,8,-.5)}`;
  if (frame==='eclipse') parts=`<g class="frame-satellite"><circle cx="512" cy="512" r="458" stroke-dasharray="180 75 40 260 95 2220"></circle><circle class="frame-moon" cx="970" cy="512" r="10"></circle></g><g class="frame-satellite satellite-two"><circle cx="512" cy="512" r="442" stroke-dasharray="65 2712"></circle><circle class="frame-moon" cx="512" cy="70" r="5"></circle></g>${spark(511,93,13,-2)}${spark(149,807,10,-4)}${spark(897,565,8,-1)}`;
  if (frame==='frostcrown') parts=`<g class="frame-cloud cloud-one"><path d="M 83 632 C 11 675 65 747 128 719 C 179 701 150 658 114 680"></path><path d="M 919 628 C 990 677 954 735 905 722 C 862 703 890 666 918 681"></path></g>${spark(510,135,14,-1)}${spark(207,401,11,-4.3)}${spark(837,350,12,-2.6)}${spark(508,799,9,-.2)}`;
  if (frame==='phoenix') parts=`<g class="frame-ember ember-one"><path d="M 105 705 Q 87 682 109 662 Q 106 680 119 690 Q 121 702 105 705Z"></path><circle cx="119" cy="735" r="4"></circle></g><g class="frame-ember ember-two"><path d="M 902 416 Q 883 390 906 370 Q 900 389 914 399 Q 920 409 902 416Z"></path><circle cx="891" cy="442" r="5"></circle></g><g class="frame-ember ember-three"><circle cx="854" cy="822" r="6"></circle><circle cx="864" cy="845" r="3"></circle></g>${spark(507,141,11,-3.1)}${spark(787,886,9,-.8)}`;
  const svg=`<svg viewBox="0 0 1024 1024" aria-hidden="true">${parts}</svg>`;
  return svg+(frame==='chronos' ? gear(frame,.299,.145,.05,10.5)+gear(frame,.230,.222,.075,15.7,true)+gear(frame,.853,.406,.064,19.3)+gear(frame,.490,.789,.105,3.2,false,true) : '');
}
