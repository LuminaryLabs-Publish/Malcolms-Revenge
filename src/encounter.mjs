// Starline-only arcade encounter rules. The route supplies frames; this module never
// changes ship motion, scoring, the Nexus lifecycle, or browser/rendering policy.
const styles=[
  {type:'needle',label:'Needle Warden',shape:'diamond',hp:5,move:6,radius:7,telegraph:98,recovery:115},
  {type:'tram',label:'Glass Tram',shape:'bars',hp:6,move:10,radius:8.3,telegraph:102,recovery:117},
  {type:'prism',label:'Prism Kite',shape:'triangle',hp:7,move:13,radius:9.4,telegraph:94,recovery:120}
];
const cap=(n,a,b)=>Math.min(b,Math.max(a,n));
const rng=value=>{
  let x=2166136261;
  for(const c of value){x^=c.codePointAt(0);x=Math.imul(x,16777619);}
  return (x>>>0)/4294967296;
};
const clone=structuredClone;
const buildWorld=(route,d,[x,y])=>{
  const {position,up,right}=route.sample(d);
  return position.map((value,k)=>value+x*right[k]+y*up[k]);
};
const range=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

export function createEncounterKit({seed='starline-wings',wavesPerLeg=1,tracking=false}={}){
  if(typeof seed!=='string'||seed.length>128)throw TypeError('Short encounter seed required');
  if(![1,2,3].includes(wavesPerLeg))throw RangeError('Unsupported encounter waves per leg');
  let route=null,revision=0,indices=[],cursor=0,active=null,lastTick=null;
  let total=null,events=[],seq=0;
  function reset(){
    cursor=0;active=null;lastTick=null;events=[];seq=0;
    total={shotsFired:0,shotsHit:0,hitsTaken:0,clears:0,escapes:0};
    return state();
  }
  function setRoute(value){
    if(!value||typeof value.sample!=='function'||!Array.isArray(value.legs)||!value.legs.length||
      value.legs.some(l=>!Number.isFinite(l.start)||!Number.isFinite(l.end)||l.end<=l.start))throw TypeError('Encounter requires a usable Starline route');
    if(route===value)return;
    route=value;revision=Number.isSafeInteger(value.epoch)?value.epoch:0;
    active=null;cursor=0;
    indices=value.legs.flatMap((leg,i)=>Array.from({length:wavesPerLeg},(_,wave)=>{
      const id='encounter-'+revision+'-'+i+(wavesPerLeg>1?'-wave-'+wave:''),d=leg.end-leg.start;
      const fraction=wavesPerLeg===1?.34+.09*rng(seed+id+' entry'):.19+.60*wave/wavesPerLeg+.04*rng(seed+id+' entry');
      return {id,entry:leg.start+d*fraction,end:leg.start+d*(wavesPerLeg===1?.84:Math.min(.90,.19+.60*(wave+1)/wavesPerLeg-.02)),
        prototype:styles[(revision+i+wave)%styles.length],bias:rng(seed+id+' drift')*Math.PI*2};
    }));
  }
  function emit(kind,position,fields={}){
    events.push({seq:++seq,kind,position:position.slice(),...fields});
    if(events.length>24)events.shift();
  }
  function place(a,ship){
    const t=(ship.tick-a.entered)/60, p=a.prototype;
    const x=p.move*Math.sin(t*.95+a.bias);
    const y=(p.type==='tram'?5:7)*Math.sin(t*.69+a.bias*2);
    let target=[x,y];
    if(tracking){
      const chase=a.phase==='tracking'?.68:a.phase==='recover'?.53:.32;
      target=[cap(x*.62+ship.offset[0]*chase,-20,20),cap(y*.65+ship.offset[1]*chase,-13,13)];
      const age=Math.min(5,Math.max(0,ship.tick-(a.lastPlaceTick??ship.tick)));
      const ease=1-Math.pow(.89,age);
      if(a.lastPlaceTick!==undefined)target=target.map((v,i)=>a.enemy.offset[i]+(v-a.enemy.offset[i])*ease);
      a.lastPlaceTick=ship.tick;
    }
    a.enemy.offset=target;a.enemy.dist=Math.min(route.length,ship.distance+70+14*Math.cos(t*.83));
    a.enemy.position=buildWorld(route,a.enemy.dist,target);
  }
  function transition(a,phase,tick){
    a.phase=phase;a.phaseStarted=tick;
  }
  function start(marker,ship){
    const p=marker.prototype;
    active={...marker,phase:'tracking',entered:ship.tick,phaseStarted:ship.tick,cooldown:0,loops:0,warning:null,impacted:false,
      enemy:{id:marker.id,type:p.type,label:p.label,hp:p.hp,maxHP:p.hp,offset:[0,0],position:ship.position.slice(),dist:ship.distance,shielded:true}};
    place(active,ship);emit('encounter-start',active.enemy.position,{id:active.id,type:p.type});
  }
  function lock(a,ship){
    transition(a,'warning',ship.tick);a.enemy.shielded=false;a.impacted=false;a.damaged=false;
    a.warning={offset:ship.offset.slice(),position:ship.position.slice(),progress:0,shape:a.prototype.shape,radius:a.prototype.radius};
    emit('encounter-warning',a.enemy.position,{id:a.id,type:a.prototype.type,shape:a.warning.shape});
  }
  function state(){
    const a=active;
    return {phase:a?.phase??'idle',encounterId:a?.id??null,enemy:a?clone(a.enemy):null,
      warning:a?.warning?clone(a.warning):null,...total,suppressCombo:a?.damaged===true,events:clone(events)};
  }
  function step(ship,input={}){
    if(!route||ship?.phase!=='run')return state();
    if(!Number.isSafeInteger(ship.tick)||!Number.isFinite(ship.distance)||!Array.isArray(ship.offset)||ship.offset.length!==2||
       !ship.offset.every(Number.isFinite)||!Array.isArray(ship.position)||ship.position.length!==3||!ship.position.every(Number.isFinite))
      throw TypeError('Invalid deterministic ship frame');
    if(lastTick!==null&&ship.tick<lastTick)reset();
    if(ship.tick===lastTick)return state();
    lastTick=ship.tick;
    if(active?.phase==='cleared'&&ship.tick-active.phaseStarted>=75)active=null;
    if(active&&ship.distance>=active.end){
      if(active.phase!=='cleared'){total.escapes++;emit('encounter-escaped',active.enemy.position,{id:active.id});}
      active=null;
    }
    if(!active&&cursor<indices.length&&ship.distance>=indices[cursor].entry){
      while(cursor<indices.length&&ship.distance>=indices[cursor].end)cursor++;
      if(cursor<indices.length&&ship.distance>=indices[cursor].entry)start(indices[cursor++],ship);
    }
    const a=active;
    if(!a||a.phase==='cleared')return state();
    place(a,ship);
    const p=a.prototype,age=ship.tick-a.phaseStarted;
    if(a.phase==='tracking'&&age>=(wavesPerLeg>1?34:48))lock(a,ship);
    else if(a.phase==='warning'&&age>=p.telegraph){
      transition(a,'volley',ship.tick);emit('encounter-volley',a.enemy.position,{id:a.id,shape:p.shape,targetOffset:a.warning.offset.slice()});
    }else if(a.phase==='volley'&&age>=34){
      transition(a,'recover',ship.tick);a.warning=null;
    }else if(a.phase==='recover'&&age>=p.recovery){
      if(a.loops>=2){total.escapes++;emit('encounter-escaped',a.enemy.position,{id:a.id});active=null;return state();}
      a.loops++;lock(a,ship);
    }
    if(a.warning){
      const newAge=ship.tick-a.phaseStarted;
      const volley=a.phase==='volley',progress=volley?1:cap(newAge/p.telegraph,0,1);
      a.warning.progress=progress;
      a.warning.position=buildWorld(route,Math.min(route.length,ship.distance+(volley?Math.max(0,21-newAge)*2:Math.max(22,62-progress*23))),a.warning.offset);
      if(volley&&newAge>=21&&newAge<34&&!a.impacted){
        a.impacted=true;
        const laneX=Math.abs(ship.offset[0]-a.warning.offset[0]);
        const laneY=Math.abs(ship.offset[1]-a.warning.offset[1]);
        const intersection=p.type==='tram'?laneX<p.radius&&laneY<7:p.type==='prism'?laneX+laneY<p.radius*1.34:range(ship.offset,a.warning.offset)<p.radius;
        if(intersection){a.damaged=true;total.hitsTaken++;emit('encounter-hit',ship.position,{id:a.id});}
        else emit('encounter-dodge',ship.position,{id:a.id});
      }
    }
    if(input.fire===true&&ship.tick>=a.cooldown){
      a.cooldown=ship.tick+12;total.shotsFired++;
      const aim=Array.isArray(input.aim)&&input.aim.length===2&&input.aim.every(Number.isFinite)?input.aim:ship.offset;
      const hit=!a.enemy.shielded&&range(aim,a.enemy.offset)<(p.type==='tram'?6.5:5.5);
      if(hit){
        total.shotsHit++;a.enemy.hp--;emit('encounter-shot-hit',a.enemy.position,{id:a.id,hp:a.enemy.hp,from:ship.position.slice()});
        if(a.enemy.hp===0){
          a.warning=null;transition(a,'cleared',ship.tick);total.clears++;
          emit('encounter-cleared',a.enemy.position,{id:a.id,type:p.type});
        }
      }else emit('encounter-shot',a.enemy.position,{id:a.id,from:ship.position.slice(),position:a.enemy.position.slice(),aligned:range(aim,a.enemy.offset)<5.5,shielded:a.enemy.shielded});
    }
    return state();
  }
  reset();
  return Object.freeze({reset,setRoute,step,state});
}
