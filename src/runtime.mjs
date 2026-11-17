import {createEngine,createCompositionKit} from '../.build/NexusEngine/src/index.js';
import {hashRegistryValue} from '../.build/NexusEngine/src/core-domains/composition/kits/composition-registry-kit/registry.js';
import {createSpatialKit} from '../.build/NexusEngine/src/core-domains/spatial/kits/spatial-kit/index.js';
import {createVectorMathKit} from '../.build/NexusEngine/src/core-domains/spatial/kits/vector-math-kit.js';
import {createWorldDomain} from '../.build/NexusEngine/src/core-domains/world/world-domain.js';
import {createSceneKit} from '../.build/NexusEngine/src/core-domains/world/scene/kits/scene-kit/index.js';

import {generateStarWindow,tuning} from './endless.mjs';

const hz=60,dt=1/hz,launchTicks=180,barrier=[25,17], baseSpeed=43, nominalMax=83;
const finite=Number.isFinite;
const validArray=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(finite);
const clone=structuredClone;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(a,m)=>[a[0]*m,a[1]*m,a[2]*m];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>scale(a,1/Math.max(1e-12,Math.hypot(...a)));
const between=(a,b,t)=>add(scale(a,1-t),scale(b,t));
const move=(a,b,s)=>a+clamp(b-a,-s,s);
const msg=x=>{throw TypeError('Starline scene: '+x);};
const kitFactories={
  'scene-lifecycle-kit':()=>createSceneKit({transitionHistoryLimit:48}),'spatial-vector-math-kit':createVectorMathKit,
  'spatial-contract-kit':createSpatialKit,'world-state-kit':()=>createWorldDomain({childDomains:false})
};

function resolveSceneSet(input){
  if(!input||typeof input!=='object')msg('scene set missing');
  const files=Array.isArray(input)?input:[input.root??input.starline,input.menu??input.orbit,input.legs?.[0],input.legs?.[1],input.legs?.[2]];
  if(files.length!==5||files.some(x=>x?.schema!=='starline.scene/1'||typeof x?.id!=='string'||!/^[a-z][a-z0-9-]+$/.test(x.id)))msg('five valid .nexus documents required');
  const byId=new Map(files.map(x=>[x.id,x]));
  if(byId.size!==files.length)msg('duplicate scene ID');
  const r=files.find(x=>x.kind==='root');
  if(!r)msg('root missing');
  const seen=new Set(),active=new Set();
  const walk=(node)=>{
    if(active.has(node.id))msg('composition child cycle at '+node.id);
    if(seen.has(node.id))msg('repeated child '+node.id);
    seen.add(node.id);active.add(node.id);
    if(node.children!==undefined&&!Array.isArray(node.children))msg('children must be IDs');
    for(const c of node.children??[]){if(!byId.has(c))msg('missing child scene '+c);walk(byId.get(c));}
    active.delete(node.id);
  };
  walk(r);
  if(seen.size!==5||r.children?.length!==4||!Array.isArray(r.kits)||!['scene-lifecycle-kit','spatial-vector-math-kit'].every(x=>r.kits.includes(x)))msg('required scene/flight Kit declarations missing');
  const menu=byId.get(r.children[0]),legs=r.children.slice(1).map(id=>byId.get(id));
  if(menu.kind!=='menu'||!validArray(menu.planet?.position,3)||!finite(menu.planet?.radius)||menu.planet.radius<=0||!finite(menu.orbitRadius)||menu.orbitRadius<=menu.planet.radius)msg('invalid orbit scene');
  for(const [i,l] of legs.entries()){
    if(l.kind!=='leg'||l.children?.length||typeof l.label!=='string'||typeof l.star!=='string'||!Array.isArray(l.points)||l.points.length<4||l.points.some(p=>!validArray(p,3)))msg('invalid leg '+l.id);
    if(i>0&&l.points[0].some((v,k)=>v!==legs[i-1].points.at(-1)[k]))msg('mismatched leg endpoint');
    if(!Array.isArray(l.gas)||l.gas.length>1500||l.gas.some(p=>!finite(p.at)||p.at<0||p.at>1||!Array.isArray(p.alternatives)||!p.alternatives.length||p.alternatives.some(c=>!validArray([c.x,c.y],2)||Math.abs(c.x)>barrier[0]||Math.abs(c.y)>barrier[1]||!['main','safe','risk'].includes(c.branch))||new Set(p.alternatives.map(c=>c.branch)).size!==p.alternatives.length))msg('invalid gas chain');
    const s=l.sling;
    if(!validArray([s?.at,s?.x,s?.y,s?.length,s?.radius,s?.side],6)||s.at<.2||s.at>.8||s.length<=0||s.radius<=0||![1,-1].includes(s.side))msg('invalid sling');
  }
  return {root:r,menu,legs};
}
function bezier(a,b,c,d,t){
  const z=1-t;
  return add(add(scale(a,z*z*z),scale(b,3*z*z*t)),add(scale(c,3*z*t*t),scale(d,t*t*t)));
}
function tangent(a,b,c,d,t){
  const z=1-t;
  return norm(add(add(scale(sub(b,a),z*z),scale(sub(c,b),2*z*t)),scale(sub(d,c),t*t)));
}
function transported(forward,lastUp){
  const up=norm(sub(lastUp,scale(forward,dot(lastUp,forward))));
  const right=norm(cross(up,forward));return {forward,up:norm(cross(forward,right)),right};
}
function createRoute(set,{origin=0,up:seamUp=[0,1,0],epoch=0}={}){
  const {menu,legs}=set;
  const all=legs.flatMap((l,i)=>i?l.points.slice(1):l.points);
  const samples=[], joins=[origin];
  const legSpans=new Set(legs.map((_,i)=>legs.slice(0,i+1).reduce((n,l)=>n+l.points.length-1,0)));
  let length=origin,p0=all[0],up=seamUp;
  for(let i=0;i<all.length-1;i++){
    const a=all[i],d=all[i+1],b=add(a,scale(sub(d,all[i-1]??a),1/6)),
      c=sub(d,scale(sub(all[i+2]??d,a),1/6));
    for(let k=i?1:0;k<=96;k++){
      const t=k/96,p=bezier(a,b,c,d,t),f=tangent(a,b,c,d,t),frame=transported(f,up);
      length+=Math.hypot(...sub(p,p0));p0=p;up=frame.up;
      samples.push({dist:length,position:p,...frame});
    }
    if(legSpans.has(i+1))joins.push(length);
  }
  function sample(distance){
    const dist=clamp(distance,origin,length);let lo=0,hi=samples.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(samples[mid].dist<=dist)lo=mid;else hi=mid;}
    const a=samples[lo],b=samples[hi],t=(dist-a.dist)/Math.max(1e-12,b.dist-a.dist);
    return {position:between(a.position,b.position,t),...transported(norm(between(a.forward,b.forward,t)),norm(between(a.up,b.up,t)))};
  }
  const placed=(frame,x,y)=>add(frame.position,add(scale(frame.right,x),scale(frame.up,y)));
  const unique=epoch?'sector-'+epoch+'-':'';
  const gates=joins.map((dist,i)=>({id:unique+(i?'gate-'+legs[i-1].id:'start-gate'),dist,position:sample(dist).position,leg:Math.max(0,i-1),label:i?legs[i-1].star:'Launch Gate'}));
  const groups=[];
  const slings=legs.map((leg,i)=>{
    const start=joins[i],span=joins[i+1]-start;
    leg.gas.forEach(({at,alternatives},n)=>{
      const d=start+span*at;
      groups.push({id:unique+leg.id+'-gas-'+n,dist:d,leg:i,alternatives:alternatives.map(({branch,x,y})=>({
        id:unique+leg.id+'-gas-'+n+'-'+branch,dist:d,x,y,position:placed(sample(d),x,y),branch,leg:i
      }))});
    });
    const {at,x,y,length:zone,radius,side}=leg.sling,d=start+span*at,frame=sample(d);
    return {id:unique+leg.id+'-sling',dist:d,position:placed(frame,x,y),planet:placed(frame,side*(radius+28),-18),radius,
      entry:d-zone/2,exit:d+zone/2,x,y,leg:i,label:leg.label+' Sling'};
  });
  groups.sort((a,b)=>a.dist-b.dist);
  function autoplay(s,{branch='risk'}={}){
    let target=[0,0];
    const sling=slings[s.leg]??slings[0];
    const next=groups.find(g=>g.dist>=s.distance-1.5&&g.leg===s.leg);
    if(next&&next.dist-s.distance<120){
      const p=next.alternatives.find(a=>a.branch===branch)??next.alternatives[0];target=[p.x,p.y];
    }
    if(s.distance>=sling.entry-76&&s.distance<=sling.exit&&(!next||Math.abs(next.dist-s.distance)>(epoch===0?18:Math.max(18,s.speed*.55)))){
      target=[sling.x,sling.y];
    }
    return {x:clamp((target[0]-s.offset[0])*.19,-1,1),y:clamp((target[1]-s.offset[1])*.19,-1,1)};
  }
  return {origin,length,epoch,sample,groups,pickUps:groups.flatMap(g=>g.alternatives),gates,slings,joins,
    legs:legs.map((l,i)=>({id:l.id,label:l.label,star:l.star,start:joins[i],end:joins[i+1]})),autoplay,menuPlanet:clone(menu.planet)};
}

export function createGame(sceneSet,options={}){
  const set=resolveSceneSet(clone(sceneSet)),firstRoute=createRoute(set);
  const straightLaunch=options.straightLaunch===true,endless=options.endless===true,seed=String(options.seed??'starline');
  if(seed.length>128)throw TypeError('Procedural seed too long');
  let route=firstRoute,windowSpec=null;
  const actualSpeed=options.testSpeedScale??1,diagnosticCruise=options.testCruiseSpeed??null;
  const orbitRate=options.orbitRate??.35,orbitTilt=options.orbitTilt??null;
  if(!finite(orbitRate)||orbitRate<=0||orbitRate>4||(orbitTilt!==null&&(!finite(orbitTilt)||Math.abs(orbitTilt)>1.2)))throw TypeError("Invalid orbit configuration");
  if(!finite(actualSpeed)||actualSpeed<.25||actualSpeed>10)throw TypeError('Invalid diagnostic speed scale');
  if(diagnosticCruise!==null&&(!finite(diagnosticCruise)||diagnosticCruise<baseSpeed||diagnosticCruise>nominalMax))throw TypeError('Invalid diagnostic cruise');
  const engine=createEngine({driveSequenceNodesWithTick:false,kits:[createCompositionKit()]});
  const composition=engine.n.composition.planning.validate({kits:set.root.kits},{throwOnError:true});
  for(const k of composition.order){
    if(!Object.hasOwn(kitFactories,k))msg('no installed factory for '+k);
    engine.installKit(kitFactories[k]());
  }
  const nexusScene=engine.n.scene,vec=engine.n.vectorMath;
  const sceneIds=[set.menu.id,...set.legs.map(l=>l.id)];
  for(const [i,id] of sceneIds.entries()){
    const exits={};
    if(i+1<sceneIds.length)exits.next={to:sceneIds[i+1]};
    else if(endless)exits.next={to:sceneIds[1]};
    if(i>0)exits.menu={to:sceneIds[0]};
    nexusScene.registerScene({id,entry:id+'.nexus',kind:'runtime',exits});
  }
  const sceneHash=hashRegistryValue(set);
  const initialScene=nexusScene.getState();
  let s,controls,sceneMounts=[],calls=0;
  function mount(id,reset=false){
    if(reset){
      nexusScene.loadSceneSnapshot(initialScene);
      if(!nexusScene.enterScene({sceneId:id,entryId:'starline:'+id}).accepted)throw Error('Cannot enter '+id);
    } else if(!nexusScene.requestTransition({exitId:'next',transitionId:'gate:'+id+':'+s.tick}).accepted)throw Error('Cannot transition into '+id);
    if(!nexusScene.mountScene({sceneId:id,mountId:'mount:'+id+(endless?':'+s.tick:''),hostBinding:'starline-browser',result:{sceneHash}}).accepted)throw Error('Cannot mount '+id);
    sceneMounts.push({id,tick:s.tick});if(endless&&sceneMounts.length>32)sceneMounts.shift();
  }
  function event(kind,id,position,more={}){
    const record={seq:++s.seq,kind,id,position:[...position],...more};
    s.events.push(record);if(s.events.length>64)s.events.shift();
  }
  function orbitPose(t){
    const angle=.86+t*orbitRate, r=set.menu.orbitRadius;
    const center=set.menu.planet.position;
    if(orbitTilt!==null){const a=Math.sin(angle),b=Math.cos(angle),c=Math.cos(orbitTilt),d=Math.sin(orbitTilt);return {position:add(center,[r*b,r*a*d,r*a*c]),...transported(norm([-a,b*d,b*c]),[0,1,0])};}
    return {position:add(center,[Math.cos(angle)*r,Math.sin(angle*.75)*14,Math.sin(angle)*r]),
      ...transported(norm([-Math.sin(angle)*r,Math.cos(angle*.75)*10.5,Math.cos(angle)*r]),[0,1,0])};
  }
  function reset(){
    route=firstRoute;windowSpec=null;
    const pose=orbitPose(0);
    s={phase:'orbit',tick:0,runTick:0,distance:0,speed:0,offset:[0,0],offsetVelocity:[0,0],position:pose.position,forward:pose.forward,up:pose.up,
      leg:0,score:0,banked:0,combo:0,bestCombo:0,maxSpeed:0,grades:[],events:[],collected:[],seq:0,
      branchLocks:[null,null,null],cursor:0,slingCursor:0,alignment:{total:0,count:0},boost:0,launchProgress:0,
      connector:null,splitTicks:[],...(endless?{endless:true,routeRevision:0,completedStars:0,totalCollected:0,difficulty:1}:{})};
    sceneMounts=[];mount(set.menu.id,true);return state();
  }
  function start(){
    if(s.phase!=='orbit')return state();
    const target=route.sample(0),d=Math.hypot(...sub(target.position,s.position));
    s.connector={a:s.position.slice(),b:add(s.position,scale(s.forward,d*.29)),c:sub(target.position,scale(target.forward,d*.34)),d:target.position,elapsed:0};
    if(straightLaunch){
      const portion=.42,distance=clamp(d*.28,35,60),lineStart=s.position.slice(),lineHeading=s.forward.slice();
      const a=add(lineStart,scale(lineHeading,distance));
      s.connector={a,b:add(a,scale(lineHeading,distance*(1-portion)/(3*portion))),
        c:sub(target.position,scale(target.forward,(diagnosticCruise??baseSpeed)*actualSpeed*launchTicks*dt*(1-portion)/3)),
        d:target.position,elapsed:0,lineStart,lineHeading,distance,portion};
    }
    s.phase='launch';event('launch','orbit-launch',s.position);
    return state();
  }
  function advanceLaunch(){
    const q=s.connector;
    const t=++q.elapsed/launchTicks;
    s.launchProgress=t;
    const line=q.portion!==undefined&&t<=q.portion;
    const y=q.portion===undefined?t:clamp((t-q.portion)/(1-q.portion),0,1);
    s.position=line?add(q.lineStart,scale(q.lineHeading,q.distance*t/q.portion)):bezier(q.a,q.b,q.c,q.d,y);
    const f=transported(line?q.lineHeading:tangent(q.a,q.b,q.c,q.d,y),s.up);
    s.forward=f.forward;s.up=f.up;
    s.speed=0;
    if(t>=1){
      s.phase='run';s.speed=(diagnosticCruise??baseSpeed)*actualSpeed;s.maxSpeed=s.speed;
      mount(set.legs[0].id);event('gate',route.gates[0].id,route.gates[0].position,{leg:0,speed:s.speed,score:0,combo:0});
    }
  }
  function advance(){
    s.tick++;
    if(s.phase==='orbit'){
      const p=orbitPose(s.tick*dt);s.position=p.position;s.forward=p.forward;s.up=p.up;return;
    }
    if(s.phase==='launch'){advanceLaunch();return;}
    if(s.phase!=='run')return;
    s.runTick++;
    const before=s.distance,oldOffset=s.offset.slice();
    for(let i=0;i<2;i++){
      const k=i?'y':'x',input=finite(controls[k])?clamp(controls[k],-1,1):0;
      const edge=Math.max(0,(Math.abs(s.offset[i])-barrier[i]*.78)/(barrier[i]*.22));
      const requested=input*31- (input*s.offset[i]>0?input*22*edge:0);
      s.offsetVelocity[i]=move(s.offsetVelocity[i],requested,132*dt);
      let next=s.offset[i]+s.offsetVelocity[i]*dt;
      if(Math.abs(next)>barrier[i]){next=Math.sign(next)*barrier[i];s.offsetVelocity[i]=0;}
      s.offset[i]=next;
    }
    const targetSpeed=(diagnosticCruise??Math.min(nominalMax,baseSpeed+s.leg*2.5+s.boost+(controls.driveBoost===true?17:0)+(endless?tuning(s.completedStars).cruiseBonus:0)))*actualSpeed;
    s.speed=move(s.speed,targetSpeed,(targetSpeed>s.speed?12:6)*actualSpeed*dt);
    s.maxSpeed=Math.max(s.maxSpeed,s.speed);s.boost=Math.max(0,s.boost-1.12*dt);
    const proposed=before+s.speed*dt;
    s.distance=Math.min(route.length,proposed);
    const at=d=>oldOffset.map((x,i)=>x+(s.offset[i]-x)*clamp((d-before)/Math.max(1e-12,s.distance-before),0,1));
    // Every crossed group is visited, including several groups within one high-speed tick.
    while(s.cursor<route.groups.length&&route.groups[s.cursor].dist<=s.distance){
      const group=route.groups[s.cursor++],offset=at(group.dist);
      const options=group.alternatives.filter(a=>a.branch==='main'||!s.branchLocks[group.leg]||s.branchLocks[group.leg]===a.branch);
      let chosen=null,best=Infinity;
      for(const p of options){
        const error=Math.hypot(offset[0]-p.x,offset[1]-p.y);
        if(error<= (p.branch==='risk'?4.2:7)*(endless?tuning(s.completedStars).pickupWindow:1)&&error<best){best=error;chosen=p;}
      }
      if(chosen){
        if(chosen.branch!=='main')s.branchLocks[group.leg]=chosen.branch;
        s.collected.push(chosen.id);if(endless)s.totalCollected++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);
        const points=(chosen.branch==='risk'?155:100)*Math.min(5,1+Math.floor((s.combo-1)/3));
        s.score+=points;event('pickup',chosen.id,chosen.position,{points,combo:s.combo,branch:chosen.branch,leg:group.leg});
      } else {
        const oldCombo=s.combo;s.combo=0;
        event('miss',group.id,options[0]?.position??route.sample(group.dist).position,{combo:oldCombo,leg:group.leg});
      }
    }
    const sl=route.slings[s.slingCursor];
    if(sl&&s.distance>=sl.entry&&before<=sl.exit){
      const a=Math.max(sl.entry,before),b=Math.min(sl.exit,s.distance);
      if(b>a){
        const off=at((a+b)/2),error=Math.hypot(off[0]-sl.x,off[1]-sl.y);
        s.alignment.total+=error*(b-a);s.alignment.count+=b-a;
      }
      if(s.distance>=sl.exit){
        const deviation=s.alignment.total/Math.max(1e-9,s.alignment.count),grade=deviation<=5?'clean':deviation<=14?'standard':'missed';
        const bonus=grade==='clean'?725:grade==='standard'?250:0;
        s.score+=bonus;s.boost=grade==='clean'?33:grade==='standard'?17:0;s.grades.push(grade);if(endless&&s.grades.length>18)s.grades.shift();
        if(grade==='missed')s.combo=0;
        s.slingCursor++;s.alignment={total:0,count:0};event('sling',sl.id,sl.position,{grade,bonus,leg:sl.leg});
      }
    }
    const g=route.gates[s.leg+1];
    if(g&&before<g.dist&&s.distance>=g.dist){
      s.score+=s.leg===2?1600:850;s.banked=s.score;s.splitTicks.push(s.runTick);
      if(endless){s.completedStars++;s.difficulty=s.completedStars+1;if(s.splitTicks.length>18)s.splitTicks.shift();}
      event('gate',g.id,g.position,{score:s.banked,leg:s.leg,speed:s.speed,combo:s.combo,label:g.label,...(endless?{star:s.completedStars,difficulty:s.difficulty}:{})});
      if(s.leg===2&&endless){
        const origin=route.length,seam=route.sample(origin),epoch=s.routeRevision+1;
        windowSpec=generateStarWindow({seed,epoch,origin,frame:seam,templates:set.legs});
        route=createRoute({...set,legs:windowSpec.legs},{origin,up:windowSpec.up,epoch});
        s.leg=0;s.routeRevision=epoch;s.cursor=0;s.slingCursor=0;s.collected=[];s.branchLocks=[null,null,null];
        s.distance=Math.min(route.length,proposed);mount(set.legs[0].id);
      }else if(s.leg===2){s.phase='results';event('results','finish',g.position,{score:s.score});}
      else {s.leg++;mount(set.legs[s.leg].id);}
    }
    const frame=route.sample(s.distance);
    const toV=a=>({x:a[0],y:a[1],z:a[2]});
    const pos=vec.add(toV(frame.position),toV(add(scale(frame.right,s.offset[0]),scale(frame.up,s.offset[1]))));
    s.position=[pos.x,pos.y,pos.z];
    s.forward=frame.forward;s.up=frame.up;
  }
  engine.scheduler.addPhase('starline-play').addSystem('starline-play',advance);
  function state(){const {connector,alignment,branchLocks,cursor,slingCursor,boost,seq,offsetVelocity,...publicState}=s;return clone(publicState);}
  function tick(input={}){
    if(s.phase==='results')return;
    controls=input??{};engine.tick(dt);calls++;
  }
  function step(input){tick(input);return state();}
  function snapshot(){return {schema:'starline.save/1',sceneHash,actualSpeed,diagnosticCruise,state:clone(s),nexusScene:nexusScene.getState(),sceneMounts:clone(sceneMounts),...(endless?{seed,windowSpec:clone(windowSpec)}:{}),...(straightLaunch?{straightLaunch}: {})};}
  function load(save){
    if(save?.schema!=='starline.save/1'||save.sceneHash!==sceneHash||save.actualSpeed!==actualSpeed||save.diagnosticCruise!==diagnosticCruise||Boolean(save.straightLaunch)!==straightLaunch)throw TypeError('Incompatible Starline save');
    const v=save.state;
    if(endless!==Boolean(v?.endless)||(endless&&save.seed!==seed))throw TypeError('Incompatible run type or procedural seed');
    let restoredRoute=firstRoute,restoredSpec=null;
    if(endless){
      if(!Number.isSafeInteger(v.routeRevision)||v.routeRevision<0||!Number.isSafeInteger(v.completedStars)||v.completedStars!==v.routeRevision*3+v.leg)throw TypeError('Invalid procedural checkpoint');
      if(v.routeRevision>0){
        const w=save.windowSpec;
        if(!w||!finite(w.origin)||w.origin<=0||!validArray(w.up,3))throw TypeError('Missing saved route window');
        const checked=resolveSceneSet({root:set.root,menu:set.menu,legs:w.legs});
        restoredSpec=clone(w);restoredRoute=createRoute(checked,{origin:w.origin,up:w.up,epoch:v.routeRevision});
      }
    }
    if(!v||!['orbit','launch','run','results'].includes(v.phase)||!Number.isSafeInteger(v.tick)||v.tick<0||!Number.isSafeInteger(v.runTick)||v.runTick<0||v.runTick>v.tick||
      !finite(v.distance)||v.distance<restoredRoute.origin||v.distance>restoredRoute.length||!finite(v.speed)||v.speed<0||v.speed>nominalMax*actualSpeed+1e-6||
      !validArray(v.offset,2)||!validArray(v.offsetVelocity,2)||!validArray(v.position,3)||!validArray(v.forward,3)||!validArray(v.up,3)||
      !Number.isInteger(v.leg)||v.leg<0||v.leg>2||!Number.isInteger(v.cursor)||v.cursor<0||v.cursor>restoredRoute.groups.length||
      !Number.isInteger(v.slingCursor)||v.slingCursor<0||v.slingCursor>3||!Array.isArray(v.collected)||new Set(v.collected).size!==v.collected.length||
      v.collected.some(id=>!restoredRoute.pickUps.some(p=>p.id===id))||!Array.isArray(v.events)||!Array.isArray(v.grades)||!Array.isArray(save.sceneMounts))throw TypeError('Invalid Starline save');
    const id=v.phase==='orbit'||v.phase==='launch'?set.menu.id:set.legs[v.leg].id;
    if(save.nexusScene?.currentSceneId!==id||JSON.stringify(save.nexusScene.registry)!==JSON.stringify(initialScene.registry))throw TypeError('Inconsistent saved Starline scene');
    nexusScene.loadSceneSnapshot(clone(save.nexusScene));
    s=clone(v);route=restoredRoute;windowSpec=restoredSpec;sceneMounts=clone(save.sceneMounts);return state();
  }
  function evidence(){return {sceneHash,composition:clone(composition),installedKits:Object.keys(engine.domainServiceKits).sort(),
    registeredScenes:Object.keys(nexusScene.getSceneRegistry()),sceneMounts:clone(sceneMounts),transitions:nexusScene.getTransitionLedger(),engineTicks:calls,
    residentSceneDescriptors:sceneIds.length,activeScene:nexusScene.getCurrentScene()?.id,pickUpCandidates:route.pickUps.length,gasGroups:route.groups.length,...(endless?{seed,routeRevision:s.routeRevision,origin:route.origin,completedStars:s.completedStars}:{})};}
  reset();
  return Object.freeze({start,menu:reset,retry:()=>{reset();return start();},step,state,snapshot,load,evidence,get route(){return route;},
    stepBatch(count,input=()=>({})){if(!Number.isSafeInteger(count)||count<0||count>100000)throw RangeError('Invalid batch size');
      for(let i=0;i<count&&s.phase!=='results';i++)tick(input({phase:s.phase,tick:s.tick,runTick:s.runTick,distance:s.distance,speed:s.speed,leg:s.leg,offset:s.offset.slice(),routeRevision:s.routeRevision,completedStars:s.completedStars},i));return state();}});
}
