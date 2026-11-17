// Game-owned seeded scenario generation. No random global state and no retained route history.
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const scale=(a,n)=>a.map(x=>x*n);
function rng(input){
  let hash=2166136261;
  for(const c of input){hash^=c.codePointAt(0);hash=Math.imul(hash,16777619);}
  return ()=>{hash=(hash+0x6D2B79F5)|0;let t=Math.imul(hash^hash>>>15,hash|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
const adjectives=['Opal','Sable','Lumen','Pale','Kite','Nacre','Cinder','Aster','Indigo','Vesper','Glint','Viridian','Ochre','Ion','Umber','Eon'];
const nouns=['Wake','Strait','Reach','Loom','Rift','Fold','Current','Tide','Spiral','Crest','Passage','Arc','Skein','Shoal'];
const pick=(r,a)=>a[Math.floor(r()*a.length)];

export const tuning=stars=>{
  const rise=stars/(stars+10);
  return {rise,cruiseBonus:22*rise,pickupWindow:1-.19*rise};
};

export function generateStarWindow({seed,epoch,origin,frame,templates}){
  const r=rng(seed+':'+epoch);
  const varied=Math.PI/9;
  const first=frame.position;
  const horizontal=Math.hypot(frame.forward[0],frame.forward[2]);
  let heading=Math.atan2(frame.forward[0],frame.forward[2]);
  let start=first.slice();
  const legs=templates.map((leg,index)=>{
    const sector=epoch*3+index+1;
    const difficulty=tuning(sector).rise;
    const points=[start];let current=start;
    const bias=(r()-.5)*(.57+.12*difficulty);
    const span=195+r()*96;
    const stride=()=>span*(.94+.12*r());
    for(let j=0;j<7;j++){
      if(j===0&&index===0)current=add(current,scale(frame.forward,stride()));
      else{
        heading+=bias*.42+(r()-.5)*varied;
        const slope=Math.min(.19,.05+.12*difficulty)*(r()-.5)*2;
        const direction=[Math.sin(heading)*horizontal,slope,Math.cos(heading)*horizontal];
        current=add(current,scale(direction,stride()));
      }
      points.push(current);
    }
    start=current;
    const label=pick(r,adjectives)+' '+pick(r,nouns), side=r()>.5?1:-1;
    const length=15+Math.floor(difficulty*8+r()*4), phase=r()*4;
    const gas=Array.from({length},(_,i)=>{
      const t=i/(length-1), at=.075+t*.85;
      const wobble=Math.sin(t*(6+difficulty*3)+phase);
      const rise=Math.cos(t*(5+difficulty*2)+phase)*4;
      const main={branch:'main',x:side*wobble*(4+3*difficulty),y:rise};
      const safe={branch:'safe',x:side*wobble*5,y:rise};
      const risk={branch:'risk',x:side*(12+5*difficulty+wobble*5),y:rise+6};
      return {at,alternatives:i<3||i>length-4||index===0?[main]:[safe,risk]};
    });
    return {...leg,label,star:label+' '+sector,points,gas,sling:{
      ...leg.sling,at:.61+r()*.17,x:side*(8+7*difficulty+r()*2),y:(r()-.5)*(10+difficulty*8),
      radius:64+r()*33,length:112+r()*47,side
    }};
  });
  return {origin,up:frame.up.slice(),legs};
}
