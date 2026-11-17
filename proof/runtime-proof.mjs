import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createGame} from '../src/runtime.mjs';

const files=['starline','orbit-menu','leg-aurora','leg-ember','leg-glass'];
const docs=await Promise.all(files.map(async n=>JSON.parse(await fs.readFile(new URL('../scenes/'+n+'.nexus',import.meta.url)))));
const report=(check,fields)=>console.log(JSON.stringify({check,...fields}));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const pct=(d,q)=>d[Math.min(d.length-1,Math.floor(d.length*q))];
const degrees=(a,b)=>Math.acos(Math.min(1,Math.max(-1,a.reduce((s,v,i)=>s+v*b[i],0))))*180/Math.PI;
const exact=(s,g)=>{assert.equal(s.phase,'results');assert.equal(s.distance,g.route.length);assert.equal(s.splitTicks.length,3);assert.equal(s.events.filter(e=>e.kind==='gate').at(-1)?.id,g.route.gates.at(-1).id);
  assert.equal(s.grades.length,3);assert.equal(s.score,s.banked);assert.equal(new Set(s.collected).size,s.collected.length);};
function run(g,branch='risk'){g.start();const s=g.stepBatch(18000,v=>g.route.autoplay(v,{branch}));exact(s,g);return s;}
const risk=createGame(docs),safe=createGame(docs);
const r=run(risk),s=run(safe,'safe');
assert(r.collected.some(a=>a.endsWith('-risk')));assert(s.collected.some(a=>a.endsWith('-safe')));assert(r.score>s.score);
assert.deepEqual(r.grades,['clean','clean','clean']);
const route=risk.route;
const baselines=[['risk',r,risk],['safe',s,safe]].map(([branch,result,g])=>({branch,score:result.score,collected:result.collected.length,
  clean:result.grades,maxSpeed:result.maxSpeed,ticks:result.tick,hash:hash(result),transitions:g.evidence().transitions.map(t=>t.toSceneId)}));
report('normal gameplay, both routes, real Nexus transitions',{legs:route.legs,baselines});
const centered=createGame(docs);centered.start();const low=centered.stepBatch(18000);
exact(low,centered);assert(low.grades.includes('missed'));const off=createGame(docs);off.start();const offState=off.stepBatch(18000,()=>({x:1,y:1}));exact(offState,off);
const misses=offState.events.filter(e=>e.kind==='miss');assert.equal(misses.length,44);assert.equal(new Set(misses.map(e=>e.id)).size,44);
report('center safe completion and miss handling',{ticks:low.tick,score:low.score,grades:low.grades,deliberateOffLineMisses:misses.length});
const saveStage=createGame(docs);saveStage.start();saveStage.stepBatch(2400,v=>saveStage.route.autoplay(v));
const save=saveStage.snapshot();await fs.writeFile(new URL('./runtime-example-save.json',import.meta.url),JSON.stringify(save,null,2)+'\n');
const reopened=createGame(docs);assert.deepEqual(reopened.load(save),saveStage.state());
for(let i=0;i<900;i++){const input=saveStage.route.autoplay(saveStage.state());assert.deepEqual(saveStage.step(input),reopened.step(input));}
assert.deepEqual(saveStage.snapshot(),reopened.snapshot());
report('fresh save load and exact 900-tick replay',{savedTick:save.state.tick,saveHash:hash(save),replayHash:hash(saveStage.snapshot())});
let tmp=structuredClone(docs);tmp[0].kits.push('starline-no-such-kit');
assert.throws(()=>createGame(tmp),/unknown-kit/);
tmp=structuredClone(docs);tmp[1].children=[tmp[0].id];
assert.throws(()=>createGame(tmp),/child cycle/);
tmp=structuredClone(docs);tmp[0].children[1]='missing-leg';
assert.throws(()=>createGame(tmp),/missing child/);
report('authoring missing kit, child and cycle rejected',{ok:true});
const jointSamples=route.joins.slice(1,-1).map(distance=>({distance,forwardDeg:degrees(route.sample(distance-.75).forward,route.sample(distance+.75).forward),
  upDeg:degrees(route.sample(distance-.75).up,route.sample(distance+.75).up)}));
let maxLaunchStepDeg=0,maxLaunchTrackJoinDeg=0;
const cam=createGame(docs);cam.stepBatch(36);cam.start();
for(let i=0;i<181;i++){
  const prev=cam.state(),after=cam.step();
  const d=degrees(prev.forward,after.forward);maxLaunchStepDeg=Math.max(maxLaunchStepDeg,d);
  if(prev.phase!==after.phase)maxLaunchTrackJoinDeg=d;
}
assert(maxLaunchStepDeg<5&&jointSamples.every(j=>j.forwardDeg<5));
report('route frame continuity (not renderer timing)',{maxLaunchStepDeg,maxLaunchTrackJoinDeg,jointSamples});
const clustered=structuredClone(docs);
for(let i=2;i<clustered.length;i++)clustered[i].gas=[
  {at:.12000,alternatives:[{x:0,y:0,branch:'main'}]},
  {at:.12001,alternatives:[{x:0,y:0,branch:'main'}]},
  {at:.52000,alternatives:[{x:0,y:0,branch:'main'}]},
  {at:.52001,alternatives:[{x:0,y:0,branch:'main'}]}
];
for(const [label,testCruiseSpeed,testSpeedScale] of [['normal',43,1],['high',64,1],['design-max',83,1],['diagnostic-overload',83,3]]){
  const game=createGame(clustered,{testCruiseSpeed,testSpeedScale});game.start();
  const v=game.stepBatch(16000);exact(v,game);assert.equal(v.collected.length,12);
  assert.equal(v.events.filter(e=>e.kind==='gate').length,4);
  assert.equal(v.events.filter(e=>e.kind==='miss').length,0);
  report('swept speed '+label,{speed:v.maxSpeed,collected:v.collected.length,gates:v.events.filter(e=>e.kind==='gate').map(e=>({id:e.id,speed:e.speed,combo:e.combo})),ticks:v.tick});
}
for(const total of [64,256,1024]){
  const dense=structuredClone(docs);
  let remaining=total;
  for(let i=2;i<=4;i++){
    const n=Math.floor(remaining/(5-i));remaining-=n;
    dense[i].gas=Array.from({length:n},(_,j)=>({at:.05+.9*(j/(n-1)),alternatives:[{x:0,y:0,branch:'main'}]}));
  }
  const measures=[];
  // Same scene/visual setting, only real active gas groups change; timing samples include a batched API boundary.
  for(let rep=0;rep<3;rep++){
    const load=createGame(dense,{testCruiseSpeed:83});load.start();
    for(let k=0;k<5;k++)load.stepBatch(30);
    const timings=[],t0=performance.now(),from=load.state().tick;
    while(load.state().phase!=='results'){
      const a=performance.now(),before=load.state().tick,result=load.stepBatch(30),n=result.tick-before;
      timings.push((performance.now()-a)/n);
    }
    const end=load.state(),secs=(performance.now()-t0)/1000;
    assert.equal(end.collected.length,total);exact(end,load);timings.sort((a,b)=>a-b);
    measures.push({tickMeanBatchP50ms:pct(timings,.5),tickMeanBatchP95ms:pct(timings,.95),tickMeanBatchP99ms:pct(timings,.99),ticksPerSecond:(end.tick-from)/secs,liveGasGroups:load.evidence().gasGroups});
  }
  report('real gas density '+total,{repetitions:measures});
}
const cycles=Number(process.env.STARLINE_HEADLESS_CYCLES??100);
const endurance=createGame(docs),m0=[],times=[];
let ticks=0;
const t0=performance.now();
for(let i=0;i<cycles;i++){
  endurance.retry();const a=performance.now();
  const v=endurance.stepBatch(18000,state=>endurance.route.autoplay(state));exact(v,endurance);
  assert.equal(hash(v),hash(r));assert.equal(endurance.evidence().sceneMounts.length,4);
  ticks+=v.tick;times.push(performance.now()-a);
  if(i===0||(i+1)%10===0){global.gc?.();const m=process.memoryUsage();m0.push({cycle:i+1,heapUsed:m.heapUsed,rss:m.rss});}
}
times.sort((a,b)=>a-b);
report('headless real launch/play/results/retry endurance',{cycles,ticks,elapsedRealSeconds:(performance.now()-t0)/1000,simulatedHours:ticks/(60*3600),
  cycleP50ms:pct(times,.5),cycleP95ms:pct(times,.95),heapSamples:m0,forcedGC:typeof global.gc==='function',browserCycles:0});
