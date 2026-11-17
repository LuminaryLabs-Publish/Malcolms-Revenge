// Optional game-owned mechanics. This kit consumes committed events; it neither
// mutates Nexus gameplay state nor requests synthetic pickups or combat hits.
const clone=structuredClone,cap=(x,a,b)=>Math.min(b,Math.max(a,x));
const counters=()=>({gas:0,dodges:0,clears:0,boostTicks:0,damage:0});
const passInt=p=>Number.isSafeInteger(p)&&p>=12&&p<=20;
const emptyKeys=['gas','dodges','clears','boostTicks','damage'];
const contractNames={gas:'Collect gas',dodges:'Dodge a volley',clears:'Clear a hostile',boostTicks:'Use fuel boost'};
const planFor=(star,pass)=>{
  let kinds=['gas','dodges','clears','boostTicks'];
  const kind=kinds[(star+(pass>=17?Math.floor(star/4):0))%kinds.length];
  const rise=pass>=17?Math.min(3,Math.floor(star/5)):0;
  const target=kind==='gas'?5+rise:kind==='boostTicks'?72+rise*24:1;
  return {star,kind,label:contractNames[kind],target,progress:0,complete:false};
};
export function createArcadeKit({pass=12,tuning={}}={}){
  if(!passInt(pass))throw RangeError('Arcade pass must be 12 through 20');
  let a,request=false;
  const cfg=(key,fallback,min,max)=>Number.isFinite(tuning[key])?cap(tuning[key],min,max):fallback;
  const drain=cfg('drain',.3,.15,.65);
  const makeContract=(star)=>{const c=planFor(star,pass);if(c.kind==='gas')c.target=cfg('contractGas',5,3,9)+Math.min(3,Math.floor(star/5));return c;};
  function reset(){
    request=false;
    a={pass,shield:100,fuel:pass>=13?28:0,bonusScore:0,bankedBonus:0,dodges:0,clears:0,hits:0,shieldBreaks:0,
      boostActive:false,boostTicks:0,rechargeTicks:0,brokenTicks:0,lastTick:null,gameSeq:0,enemySeq:0,
      stars:0,sector:counters(),contract:pass>=15?makeContract(0):null,contractsWon:0,contractStreak:0,mastery:0,
      tier:1,perfectSectors:0,bankHistory:[],events:[],seq:0};
    return state();
  }
  const addEvent=(kind,data={})=>{
    a.events.push({seq:++a.seq,tick:a.lastTick,kind,...data});
    if(a.events.length>24)a.events.shift();
  };
  const bonus=(n,kind)=>{
    if(!n)return;
    a.bonusScore+=n;
    addEvent(kind,{points:n});
  };
  function state(){return clone(a);}
  function input(base={}){
    request=pass>=13&&(base.boost===true||base.driveBoost===true)&&a.fuel>=drain&&a.brokenTicks===0&&a.shield>0;
    return {...base,driveBoost:request};
  }
  function combat(e){
    if(e.kind==='encounter-hit'){
      a.hits++;a.sector.damage++;
      const before=a.shield;
      const damage=cfg('shieldDamage',26,12,48)+(pass>=17?Math.min(14,Math.floor(a.stars/3)*2):0);
      a.shield=cap(a.shield-damage,0,100);
      a.rechargeTicks=300;
      addEvent('shield-hit',{shield:a.shield,damage:before-a.shield});
      if(a.shield<=0&&before>0){a.brokenTicks=210;a.shieldBreaks++;addEvent('shield-break');}
    }else if(e.kind==='encounter-dodge'){
      a.dodges++;a.sector.dodges++;
      if(pass>=14)bonus(cfg('dodgeReward',120,65,240),'dodge-bonus');
      if(pass>=16&&a.shield>=60)a.mastery++;
    }else if(e.kind==='encounter-cleared'){
      a.clears++;a.sector.clears++;
      if(pass>=14)bonus((a.shield<=50?140:0)+cfg('clearReward',300,180,500),'clear-bonus');
      if(pass>=16)a.mastery+=3;
    }
  }
  function updateContract(){
    if(!a.contract)return;
    a.contract.progress=a.sector[a.contract.kind];
    if(!a.contract.complete&&a.contract.progress>=a.contract.target){
      a.contract.complete=true;
      addEvent('contract-ready',{label:a.contract.label,star:a.contract.star});
    }
  }
  function bank(star){
    if(star<=a.stars)return;
    updateContract();
    if(a.contract?.complete){
      a.contractsWon++;a.contractStreak++;
      const streakBonus=pass>=19?Math.min(5,a.contractStreak-1)*cfg('streakReward',60,25,110):0;
      bonus(cfg('contractReward',420,270,640)+streakBonus,'contract-banked');
    }else a.contractStreak=0;
    if(pass>=16&&a.sector.damage===0&&a.sector.clears>0){a.perfectSectors++;a.mastery+=4;}
    if(pass>=16){
      const tier=Math.min(10,1+Math.floor(a.mastery/cfg('masteryStep',9,6,14)));
      if(tier>a.tier){a.tier=tier;addEvent('mastery-tier',{tier});}
    }
    if(pass>=20&&a.contract?.complete&&a.sector.clears&&a.sector.damage===0){
      bonus(cfg('aceReward',650,400,1000),'ace-sector');
    }
    a.bankedBonus=a.bonusScore;
    if(pass>=18){
      a.bankHistory.push({star,bankedBonus:a.bankedBonus,contract:a.contract?.complete===true,
        shield:a.shield,fuel:a.fuel,mastery:a.mastery,damage:a.sector.damage});
      if(a.bankHistory.length>12)a.bankHistory.shift();
    }
    a.stars=star;a.sector=counters();
    a.contract=pass>=15?makeContract(star):null;
    addEvent('sector-banked',{star,bankedBonus:a.bankedBonus,tier:a.tier});
  }
  function step(game,encounter){
    if(!Number.isSafeInteger(game?.tick)||game.tick<0)return state();
    if(a.lastTick!==null&&game.tick<a.lastTick)reset();
    if(!['run','results'].includes(game.phase)||game.tick===a.lastTick)return state();
    a.lastTick=game.tick;
    if(a.rechargeTicks>0)a.rechargeTicks--;
    if(a.brokenTicks>0){
      a.brokenTicks--;
      if(!a.brokenTicks){a.shield=28;addEvent('shield-restored',{shield:a.shield});}
    }else if(a.rechargeTicks===0&&a.shield<100)a.shield=cap(a.shield+cfg('recharge',.35,.22,.66),0,100);
    const work=(encounter?.events??[]).filter(e=>Number.isSafeInteger(e.seq)&&e.seq>a.enemySeq).sort((x,y)=>x.seq-y.seq);
    for(const e of work)if(e.seq>a.enemySeq){a.enemySeq=e.seq;combat(e);}
    const race=(game.events??[]).filter(e=>Number.isSafeInteger(e.seq)&&e.seq>a.gameSeq).sort((x,y)=>x.seq-y.seq);
    for(const e of race){
      if(e.seq<=a.gameSeq)continue;
      a.gameSeq=e.seq;
      if(e.kind==='pickup'){
        a.sector.gas++;
        if(pass>=13)a.fuel=cap(a.fuel+(e.branch==='risk'?cfg('riskFuel',11,8,17):cfg('safeFuel',8,4,12)),0,100);
      }
      if(e.kind==='gate'&&e.id!=='start-gate'&&!e.id?.endsWith('-start-gate'))bank(e.star??a.stars+1);
    }
    a.boostActive=game.phase==='run'&&request;
    if(a.boostActive){a.fuel=cap(a.fuel-drain,0,100);a.boostTicks++;a.sector.boostTicks++;}
    updateContract();
    return state();
  }
  function snapshot(){return {schema:'starline.arcade/1',pass,state:state()};}
  function load(save){
    const s=save?.state;
    if(save?.schema!=='starline.arcade/1'||save?.pass!==pass||s?.pass!==pass||!Number.isFinite(s.shield)||s.shield<0||s.shield>100||
       !Number.isFinite(s.fuel)||s.fuel<0||s.fuel>100||!Array.isArray(s.events)||s.events.length>24||!Array.isArray(s.bankHistory)||s.bankHistory.length>12||
       !emptyKeys.every(k=>Number.isSafeInteger(s.sector?.[k])&&s.sector[k]>=0))throw Error('Invalid arcade snapshot');
    a=clone(s);request=false;return state();
  }
  reset();
  return Object.freeze({reset,input,step,state,snapshot,load});
}
