import {createArcadeKit} from './arcade.mjs';
import {createSoundscape, renderReplayAudio} from './sound.mjs';
import {createGame} from './runtime.mjs';
import {createView} from './view.mjs';
import {createEncounterKit} from './encounter.mjs';
const scenes=SCENES, profile=PASS_PROFILE;
const $=id=>document.getElementById(id), canvas=$('scene');
const keys=new Set(),params=new URLSearchParams(location.search),proof=params.get('proof')==='1';
const fixed=1/60,clamp=(v,l,h)=>Math.min(h,Math.max(l,v));
const defaultNames=['Aurora Reach','Ember Fold','Glasswake'];
const errBox=$('bootError');let game,view,state,lastRoute,encounter,arcade,drive=null,sound=null,combat=null,combatSeq=-1,driveSeq=-1,bankStar=0,lastPhase='',lastT=performance.now(),acc=0,fx=null,fxUntil=0,shown=-1;
let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,drag=null,audio=null,master=null,personal=0;
try{personal=Number(localStorage.getItem('starline.personalBest')||0);}catch{}
document.documentElement.style.setProperty('--accent',profile.hudAccent??'#95ffdf');
document.documentElement.style.setProperty('--hud-bg',profile.hudBackground??'#050d1880');
document.documentElement.style.setProperty('--contact-opacity',String(profile.contactOpacity??1));
document.documentElement.classList.add('pass-'+profile.pass);
if(profile.cinematic)document.documentElement.classList.add('cinematic');
if(profile.hudPanels)document.documentElement.classList.add('panels');
if(profile.contractOutline)document.documentElement.classList.add("contract-outline");
if(profile.driveHighlight)document.documentElement.classList.add("drive-highlight");
if(profile.hudCompact)document.documentElement.classList.add('compact');
if(profile.highContrast)document.documentElement.classList.add('contrast');
function configureMotion(){
 document.documentElement.classList.toggle('quiet',reduced);
 $('motion').textContent=reduced?'Effects: reduced':'Effects: full';
 $('motion').setAttribute('aria-pressed',String(reduced));
 view?.configure?.({reduced,reducedMotion:reduced});
}
function awaken(){
 if(proof)return;if(sound){sound.wake();return;}if(audio)return;
 try{audio=new (window.AudioContext||window.webkitAudioContext)();master=audio.createGain();master.gain.value=.18;master.connect(audio.destination);audio.resume().catch(()=>{});}catch{}
}
function tone(freq,len=.14,kind='sine',offset=0,volume=.3){
 if(sound||!master||audio.state!=='running')return;
 const t=audio.currentTime+offset, o=audio.createOscillator(),g=audio.createGain();
 o.type=kind;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*(kind==='sine'?1.28:.74),t+len);
 g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(volume,t+.014);g.gain.exponentialRampToValueAtTime(.001,t+len);
 o.connect(g);g.connect(master);o.start(t);o.stop(t+len+.012);
}
function text(el,v){if(el.textContent!==String(v))el.textContent=v;}
function say(e,s){sound?.event(e,s);
 if(e.kind==='pickup'||e.kind==='gas'){
  const chain=e.combo??s.combo;fx=[chain>=3?chain+' GAS CHAIN':'GAS COLLECTED',false];fxUntil=s.tick+30; tone(330*Math.pow(2,Math.min(chain,16)/18),.11,'sine',0,.25);
 }else if(e.kind==='sling'){
  const grade=String(e.grade??'').toUpperCase();
  fx=[(grade?grade+' ':'')+'SLINGSHOT',/MISS/.test(grade)];fxUntil=s.tick+72;tone(155,.35,'triangle',0,.27);tone(435,.26,'sine',.08,.18);
 }else if(e.kind==='miss'||e.kind==='break'){
  fx=['CHAIN BROKEN',true];fxUntil=s.tick+39;tone(122,.16,'triangle',0,.22);
 }else if(e.kind==='gate'||e.kind==='star'){
  fx=['STAR GATE  /  SCORE BANKED',false];fxUntil=s.tick+59;tone(392,.19,'sine',0,.23);tone(587,.21,'sine',.08,.22);
 }else if(e.kind==='launch'){tone(96,.33,'triangle',0,.22);}
}
const seconds=t=>{const total=Math.floor((t??0)/60);return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');};
const numeric=(x,d=0)=>Number.isFinite(x)?x:d;
function phase(s){
 if(s.phase===lastPhase)return;
 lastPhase=s.phase;
 $('menu').hidden=s.phase!=='orbit';
 $('hud').hidden=s.phase==='orbit'||s.phase==='results'||(profile.cinematic&&s.phase==='launch');
 $('motion').hidden=!!profile.cinematic&&(s.phase==='orbit'||s.phase==='launch');
 $('results').hidden=s.phase!=='results';
 if(s.phase==='results'){
  const personalBefore=personal;personal=Math.max(personal,s.score);
  try{localStorage.setItem('starline.personalBest',String(personal));}catch{}
  const result=$('stats');result.replaceChildren();
  const entries=[['SCORE',s.score],['BEST',personal],['CHAIN',s.bestCombo],['TOP SPEED',Math.round(s.maxSpeed)],['TIME',seconds(s.runTick)]];
  for(const [label,value] of entries){const el=document.createElement('span');el.textContent=label+' '+value;result.append(el);}
  const grades=document.createElement('span');grades.textContent=(s.grades??[]).map(x=>typeof x==='object'?x.grade??x.id:x).join('  /  ').toUpperCase();result.append(grades);
  if(s.score>personalBefore)tone(662,.44,'sine',.14,.23);
 }
}
function draw(s,dt=fixed){
 phase(s);
 if(lastRoute!==game.route){if(lastRoute)view.setRoute?.(game.route);lastRoute=game.route;}
 view.render({...s,encounter:combat,arcade:drive},dt);sound?.update(s);
 if(profile.cinematic){const p=s.launchProgress??0;const fade=profile.straightLaunch?(s.phase==='launch'?clamp((p-.25)/.16,0,1):s.phase==='run'?clamp(1-(s.runTick??0)/21,0,1):0):(s.phase==='launch'?clamp(Math.min((p-.22)/.23,(.91-p)/.25),0,1):0);$('movieFade').style.opacity=String(fade);}
 if(s.phase==='orbit'||s.phase==='results')return;
 for(const e of s.events??[]){if((e.seq??0)>shown){shown=e.seq??0;say(e,s);}}
 const i=clamp(s.leg??0,0,2), l=game.route.legs[i]??scenes.legs[i];
 text($('legIndex'),s.endless?String((s.completedStars??0)+1).padStart(2,'0')+' / ∞'+(profile.showTension?'  ·  PRESSURE '+(s.difficulty??1):''):String(i+1).padStart(2,'0')+' / 03');text($('leg'),l.name??l.label??defaultNames[i]);
 text($('speed'),Math.round(numeric(s.speed)));text($('score'),String(numeric(s.score)+(drive?.bonusScore??0)).padStart(6,'0'));
 const box=$('drive');box.hidden=!drive||s.phase!=='run';if(drive){for(const e of drive.events??[])if(e.seq>driveSeq){driveSeq=e.seq;const enable=e.kind==='shield-break'||e.kind==='shield-restored'||(profile.rewardFlash&&/-bonus$/.test(e.kind))||(profile.masteryFlash&&e.kind==='mastery-tier')||(profile.bankCue&&e.kind==='sector-banked')||(profile.streakCue&&e.kind==='contract-banked')||(profile.aceCue&&e.kind==='ace-sector');if(enable){const label=e.kind.startsWith('shield')?e.kind.replace('-',' ').toUpperCase():e.kind==='sector-banked'?'BANKED BONUS '+e.bankedBonus:e.kind==='mastery-tier'?'MASTERY TIER '+e.tier:e.kind==='ace-sector'?'ACE SECTOR +'+e.points:e.kind==='contract-banked'?'CONTRACT +'+e.points:e.kind.replace('-bonus','').toUpperCase()+' +'+e.points;fx=[label,e.kind==='shield-break'];fxUntil=s.tick+82;}}
   text($('shield'),Math.round(drive.shield));text($('fuel'),Math.floor(drive.fuel));$('shieldFill').style.width=drive.shield+'%';$('fuelFill').style.width=drive.fuel+'%';text($('contract'),drive.contract?(drive.contract.complete?'READY TO BANK':drive.contract.label.toUpperCase()+' '+drive.contract.progress+'/'+drive.contract.target):'');if(profile.bestAtCheckpoint&&drive.stars>bankStar){bankStar=drive.stars;personal=Math.max(personal,(s.banked??s.score)+drive.bankedBonus);try{localStorage.setItem('starline.personalBest',String(personal));}catch{}}
  text($('bestRun'),profile.bestAtCheckpoint&&personal>0?'BEST BANKED '+personal:'');text($('tier'),profile.masteryUI?'TIER '+drive.tier+(drive.contractStreak>0?'  •  STREAK '+drive.contractStreak:''):'');box.classList.toggle('is-boosting',drive.boostActive);}
 text($('mult'),'×'+Math.min(5,1+Math.floor(numeric(s.combo)/3)));
 text($('chain'),s.combo>0?s.combo+' IN CHAIN':'GAS CHAIN');
 text($('elapsed'),seconds(s.runTick));$('routeProgress').firstElementChild.style.width=(100*clamp(s.endless?(s.distance-l.start)/Math.max(1,l.end-l.start):s.distance/game.route.length,0,1)).toFixed(1)+'%';
 const next=game.route.slings.find(x=>x.dist>s.distance && (x.dist-s.distance)/Math.max(1,s.speed)<4);
 const aiming=$('aim');if(profile.aimCue&&combat?.enemy&&s.phase==='run'&&combat.phase!=='cleared'){const pos=s.position.map((v,i)=>v+66*s.forward[i]),a=view.project(pos);aiming.hidden=!a.visible;if(a.visible){aiming.style.left=(a.x*100)+'%';aiming.style.top=(a.y*100)+'%';aiming.classList.toggle('danger',!!combat.warning);}}else aiming.hidden=true;
 if(combat?.enemy){const e=combat.enemy;const label=combat.phase==='warning'?'DODGE THE MARKED LANE':combat.phase==='volley'?'VOLLEY':combat.phase==='tracking'?'SHIELD UP':combat.phase==='cleared'?'ENCOUNTER CLEARED':'LINE UP  /  HOLD X';text($('combatLabel'),e.label.toUpperCase()+'  ·  '+label);$('combatPanel').hidden=s.phase!=='run';$('enemyHP').firstElementChild.style.width=(100*e.hp/e.maxHP)+'%';}else $('combatPanel').hidden=true;
 text($('sling'),s.phase==='launch'?'RELAY RELEASED':next?'SLING WINDOW AHEAD':'FOLLOW THE GAS LINE');
 const ev=$('event');text(ev,fx?.[0]??'');ev.classList.toggle('show',s.tick<fxUntil);ev.classList.toggle('miss',!!fx?.[1]);
}
function controls(){
 const a=k=>keys.has(k)?1:0;
 const x=a('ArrowRight')+a('KeyD')-a('ArrowLeft')-a('KeyA');
 const y=a('ArrowUp')+a('KeyW')-a('ArrowDown')-a('KeyS');
 return {x:clamp(-(x+(drag?.x??0)),-1,1),y:clamp(y+(drag?.y??0),-1,1),fire:keys.has('KeyX')&&(!drive||drive.shield>0),boost:keys.has('KeyE')};
}
function step(input){input=arcade?.input(input)??input;game.step(input);state=game.state();if(encounter){encounter.setRoute(game.route);combat=encounter.step(state,input);for(const e of combat.events)if(e.seq>combatSeq){combatSeq=e.seq;sound?.event(e,state);if(e.kind==='encounter-warning')tone(152,.25,'triangle',0,.22);if(e.kind==='encounter-shot-hit')tone(529,.08,'sine',0,.22);if(e.kind==='encounter-hit'){fx=['SHIELD HIT',true];fxUntil=state.tick+85;tone(92,.24,'triangle',0,.3);}}}drive=arcade?.step(state,combat)??null;return state;}
function loop(now){
 const dt=clamp((now-lastT)/1000,0,.12);lastT=now;acc+=dt;
 while(acc>=fixed){step(controls());acc-=fixed;}
 draw(state,dt);requestAnimationFrame(loop);
}
function launch(){if(state.phase!=='orbit')return;awaken();game.start();state=game.state();keys.clear();draw(state);}
function orbit(){game.menu();state=game.state();combat=encounter?.reset();drive=arcade?.reset();combatSeq=driveSeq=-1;bankStar=0;keys.clear();shown=-1;fx=null;draw(state);}
function retry(){game.retry();state=game.state();combat=encounter?.reset();combatSeq=-1;keys.clear();shown=-1;fx=null;draw(state);}
$('launch').onclick=launch;$('retry').onclick=retry;$('return').onclick=orbit;
$('motion').onclick=()=>{reduced=!reduced;configureMotion();};
for(const b of [$('launch'),$('retry'),$('return'),$('motion')])b.addEventListener('pointerup',()=>b.blur());
window.addEventListener('keydown',e=>{
 if(profile.arcade&&e.code==='Escape'&&state?.phase!=='orbit'){e.preventDefault();orbit();return;}
 if(profile.sound&&e.code==='KeyM'&&!e.repeat&&sound){const flag=!sound.muted();sound.setMuted(flag);return;}
 if((e.code==='Enter'||e.code==='Space'&&state?.phase==='orbit')&&!e.repeat&&(state?.phase==='orbit'||state?.phase==='results')&&!e.target.matches?.('button')){e.preventDefault();if(state.phase==='orbit')launch();else retry();return;}
 if(/^(Arrow(Up|Down|Left|Right)|Key[WASDXE])$/.test(e.code)){e.preventDefault();keys.add(e.code);}
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
canvas.addEventListener('pointermove',e=>{
 if(state.phase==='orbit'){
  const hit=view.selectPlanet(e.clientX,e.clientY);canvas.style.cursor=hit?'pointer':'';document.querySelector('.brand').classList.toggle('hot',!!hit);return;
 }
 if(drag?.id===e.pointerId){drag.x=clamp((e.clientX-drag.at[0])/80,-1,1);drag.y=clamp((drag.at[1]-e.clientY)/80,-1,1);}
});
canvas.addEventListener('pointerdown',e=>{
 if(state.phase==='orbit'){if(view.selectPlanet(e.clientX,e.clientY))launch();return;}
 if(state.phase==='run'){drag={id:e.pointerId,at:[e.clientX,e.clientY],x:0,y:0};canvas.setPointerCapture(e.pointerId);}
});
for(const e of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(e,()=>{drag=null;});
try{
 if(profile.sound&&!proof)sound=createSoundscape({volume:.78});
 game=createGame(scenes,{orbitRate:profile.orbitRate,orbitTilt:profile.orbitTilt,straightLaunch:profile.straightLaunch,endless:profile.endless,seed:profile.seed});view=createView(canvas,game.route,profile);state=game.state();if(profile.combat){encounter=createEncounterKit({seed:profile.seed,wavesPerLeg:profile.wavesPerLeg,tracking:profile.enemyTracking});encounter.setRoute(game.route);combat=encounter.state();}if(profile.arcade){arcade=createArcadeKit({pass:profile.arcade,tuning:profile.arcadeTuning});drive=arcade.state();}configureMotion();draw(state);
 if(!proof)requestAnimationFrame(loop);
 else window.starlineProof={
  state:()=>game.state(),snapshot:()=>game.snapshot(),info:()=>view.info?.(),evidence:()=>game.evidence(),combat:()=>combat,arcade:()=>drive,renderAudio:profile.sound?(events=>renderReplayAudio(events,60)):null,
  route:()=>({length:game.route.length,gates:game.route.gates,slings:game.route.slings}),
  clickPoint:()=>view.planetScreen?.()??null,
  auto:(n=1,drawFrame=true,style='optimal')=>{const choose=s=>style==='safe'?game.route.autoplay(s,{branch:'safe'}):game.route.autoplay(s);
  if(encounter){for(let i=0;i<n;i++){const c=choose(state);if(profile.demoBoost&&state.phase==='run'&&state.runTick%680>=470&&state.runTick%680<508)c.boost=true;if(profile.demoDodge&&combat?.warning&&(combat.phase==='volley'||combat.phase==='warning'&&combat.warning.progress>.45)){
      const w=combat.warning,desired=Math.max(-26,Math.min(26,w.offset[0]+(w.offset[0]>0?-1:1)*(w.radius+12)));
      if(profile.realAim){const side=w.offset[1]<=0?16:-16;c.y=clamp((side-state.offset[1])*.42,-1,1);}else c.x=clamp((desired-state.offset[0])*.30,-1,1);
    }
    if(combat?.enemy&&(combat.phase==='recover'||!profile.demoDodge&&combat.phase==='volley')){c.fire=true;if(profile.realAim){c.x=clamp((combat.enemy.offset[0]-state.offset[0])*.48,-1,1);c.y=clamp((combat.enemy.offset[1]-state.offset[1])*.48,-1,1);}else c.aim=combat.enemy.offset;}
    step(c);}}else state=game.stepBatch(n,choose);if(drawFrame)draw(state,Math.min(.10,n*fixed));return drawFrame&&(combat||drive)?{...state,encounter:combat,arcade:drive}:state;},
  input:(input,n=1)=>{for(let i=0;i<n;i++)step(input);draw(state,Math.min(.10,n*fixed));return state;},
  keyboard:(n=1)=>{for(let i=0;i<n;i++)step(controls());draw(state,Math.min(.10,n*fixed));return state;},
  configure:settings=>view.configure?.(settings),
  launch,orbit,retry,
  restore:value=>{game.load(value);state=game.state();draw(state);return state;}
 };
}catch(err){console.error(err);errBox.hidden=false;errBox.textContent='Flight deck unavailable: '+err.message;}
