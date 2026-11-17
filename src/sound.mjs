// Original procedural sound design. No clips, image assets, network, or saved audio required.
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const midi=n=>440*Math.pow(2,(n-69)/12);
const META={version:1,source:'Original Web Audio synthesis',samples:'none external'};
const hitColors={pickup:1,launch:2,gate:3,results:4,sling:5,miss:6,
 'encounter-warning':7,'encounter-volley':8,'encounter-shot':9,'encounter-shot-hit':10,
 'encounter-hit':11,'encounter-cleared':12,'encounter-dodge':13,'encounter-start':14};
function random(seed=561786){let x=seed>>>0;return()=>((x=(Math.imul(1664525,x)+1013904223)>>>0)/4294967296);}
function proceduralNoise(ctx,seconds=1.8,seed=891){
 const n=Math.ceil(ctx.sampleRate*seconds),b=ctx.createBuffer(1,n,ctx.sampleRate),a=b.getChannelData(0),r=random(seed);
 let prev=0;
 for(let i=0;i<n;i++){
  prev=.80*prev+(r()*2-1)*.20;
  const fade=Math.min(1,i/(.02*ctx.sampleRate),(n-1-i)/(.02*ctx.sampleRate));
  a[i]=prev*fade;
 }
 return b;
}
function panTo(ctx,node,target,value=0){
 const p=typeof ctx.createStereoPanner==='function'?ctx.createStereoPanner():null;
 if(!p){node.connect(target);return;}
 p.pan.value=clamp(Number.isFinite(value)?value:0,-1,1);node.connect(p);p.connect(target);
}
function makeSynth(ctx,destination,{volume=.76,start=0,stop=null}={}){
 const master=ctx.createGain();master.gain.value=volume;master.connect(destination);
 const limiter=ctx.createDynamicsCompressor();
 limiter.threshold.value=-17;limiter.knee.value=18;limiter.ratio.value=3.4;limiter.attack.value=.009;limiter.release.value=.18;
 limiter.connect(master);
 const ambient=ctx.createGain(),effects=ctx.createGain(),engine=ctx.createGain();
 ambient.gain.value=.7;effects.gain.value=.86;engine.gain.value=1;
 [ambient,effects,engine].forEach(x=>x.connect(limiter));
 const noise=proceduralNoise(ctx),bedNodes=[];
 const tail=ctx.createDelay(1),feedback=ctx.createGain(),tailLP=ctx.createBiquadFilter();
 tail.delayTime.value=.155;feedback.gain.value=.20;tailLP.type='lowpass';tailLP.frequency.value=1230;
 tail.connect(tailLP);tailLP.connect(feedback);feedback.connect(tail);tailLP.connect(effects);
 const engineGain=ctx.createGain(),engineFilter=ctx.createBiquadFilter();
 engineGain.gain.value=.06;engineFilter.type='lowpass';engineFilter.frequency.value=126;engineFilter.Q.value=.53;
 engineFilter.connect(engineGain);engineGain.connect(engine);
 function startNode(source,t=start){source.start(t);if(stop!==null)source.stop(stop);bedNodes.push(source);}
 const motor=ctx.createOscillator(),rumble=ctx.createOscillator(),motorMix=ctx.createGain(),rumbleMix=ctx.createGain();
 motor.type='sawtooth';motor.frequency.value=43;motorMix.gain.value=.36 * .19;
 rumble.type='triangle';rumble.frequency.value=28;rumbleMix.gain.value=.31*.24;
 motor.connect(motorMix);motorMix.connect(engineFilter);rumble.connect(rumbleMix);rumbleMix.connect(engineFilter);startNode(motor);startNode(rumble);
 const windy=ctx.createBufferSource(),band=ctx.createBiquadFilter(),windGain=ctx.createGain();
 windy.buffer=noise;windy.loop=true;band.type='bandpass';band.frequency.value=219;band.Q.value=.47;windGain.gain.value=.10;
 windy.connect(band);band.connect(windGain);windGain.connect(engineGain);startNode(windy);
 const padD=ctx.createGain();padD.gain.value=.092;padD.connect(ambient);
 [
   [midi(43),.13,-.3,.104,1],
   [midi(50),.092,.55,.143,.47],
   [midi(55),.070,-.57,.173,.67],
   [midi(58),.042,.38,.091,.18],
   [midi(62),.04,-.24,.069,.82]
 ].forEach(([f,level,pos,swell,phase],i)=>{
   const a=ctx.createOscillator(),g=ctx.createGain(),filt=ctx.createBiquadFilter(),lfo=ctx.createOscillator(),lfoDepth=ctx.createGain();
   a.type=i===0?'triangle':'sine';a.frequency.value=f;
   filt.type='lowpass';filt.frequency.value=i===0?174:660;filt.Q.value=.42;
   g.gain.value=level*.64; a.connect(filt);filt.connect(g);panTo(ctx,g,padD,pos);
   lfo.type='sine';lfo.frequency.value=swell;lfoDepth.gain.value=level*.26;lfo.connect(lfoDepth);lfoDepth.connect(g.gain);
   if(i>0)a.detune.value=(i%2?-1:1)*2.4;
   startNode(a);startNode(lfo,start+phase*.033);
 });
 function tone(t,{f=220,to=f,length=.15,amp=.10,shape='sine',pan=0,attack=.014,echo=0,filter=0}={}){
   const osc=ctx.createOscillator(),noiseFilter=filter?ctx.createBiquadFilter():null,g=ctx.createGain();
   length=Math.max(.03,length);
   osc.type=shape;osc.frequency.setValueAtTime(Math.max(22,f),t);
   if(f!==to)osc.frequency.exponentialRampToValueAtTime(Math.max(22,to),t+length*.86);
   g.gain.setValueAtTime(.00008,t);g.gain.exponentialRampToValueAtTime(Math.max(.00009,amp),t+Math.min(attack,length*.27));
   g.gain.exponentialRampToValueAtTime(.00008,t+length);
   if(noiseFilter){noiseFilter.type='lowpass';noiseFilter.frequency.value=filter;osc.connect(noiseFilter);noiseFilter.connect(g);}
   else osc.connect(g);
   panTo(ctx,g,effects,pan);
   if(echo>0){const wet=ctx.createGain();wet.gain.value=echo;g.connect(wet);wet.connect(tail);}
   osc.start(t);osc.stop(t+length+.012);
 }
 function puff(t,{length=.22,amp=.14,hz=650,to=hz,pan=0,bpass=true,Q=.7,attack=.018}={}){
   const s=ctx.createBufferSource(),gain=ctx.createGain(),f=ctx.createBiquadFilter();
   s.buffer=noise;s.loop=false;
   f.type=bpass?'bandpass':'lowpass';f.Q.value=Q;f.frequency.setValueAtTime(hz,t);
   f.frequency.exponentialRampToValueAtTime(to,t+length*.82);
   gain.gain.setValueAtTime(.00008,t);gain.gain.exponentialRampToValueAtTime(amp,t+Math.min(attack,length*.27));
   gain.gain.exponentialRampToValueAtTime(.00008,t+length);
   s.connect(f);f.connect(gain);panTo(ctx,gain,effects,pan);
   s.start(t,Math.min(noise.duration*.12,.17));s.stop(t+length+.013);
 }
 function cue(t,e,state={}){
  if(!e||!Object.hasOwn(hitColors,e.kind))return false;
  const x=e.offset?.[0]??state.offset?.[0]??0;
  const p=clamp(x/28,-.58,.58), v=(cfg,delay=0)=>tone(t+delay,{pan:p,...cfg}), n=(cfg,d=0)=>puff(t+d,{pan:p,...cfg});
  switch(e.kind){
  case 'pickup':{
    const combo=clamp(e.combo??state.combo??1,1,22);
    const steps=[0,3,7,10,14,17,19,22,24],f=midi(60+steps[Math.min(8,Math.floor((combo-1)*.50))]);
    v({f,to:f*1.023,length:.18,amp:.087,echo:.28,attack:.012});
    v({f:f*2.01,to:f*1.99,length:.10,amp:.026,echo:.17},.019);
    if(combo%3===0)v({f:f*1.334,length:.22,amp:.022,echo:.24},.049);
    break;
  }
  case 'miss':
    v({f:163,to:87,length:.26,amp:.038,shape:'triangle',filter:600});
    n({hz:520,to:184,length:.21,amp:.105});break;
  case 'launch':
    n({hz:174,to:680,length:1.03,amp:.28,attack:.16});
    v({f:46,to:102,length:.82,amp:.20,shape:'triangle',attack:.14,filter:710});
    v({f:165,to:330,length:.58,amp:.041,echo:.39,attack:.11},.18);break;
  case 'sling':{
    const grade=String(e.grade??'').toLowerCase();
    const clean=grade==='clean',missed=grade==='missed';
    n({hz:277,to:clean?1220:700,length:.63,amp:clean?.31:.18,attack:.074},.015);
    v({f:clean?52:66,to:clean?112:47,length:.72,amp:.19,shape:'triangle',attack:.12,filter:820,echo:.16});
    if(!missed)[0,7,12].forEach((k,i)=>v({f:midi((clean?62:57)+k),length:.42,amp:clean?.052:.033,echo:.30},.14+i*.065));
    break;
  }
  case 'gate':
    [0,7,12,16].forEach((k,i)=>v({f:midi(53+k),length:.54,amp:.063,echo:.34,attack:.02},i*.067));
    n({hz:750,to:310,length:.32,amp:.11},.06);break;
  case 'results':
    [0,4,7,12,16].forEach((k,i)=>v({f:midi(57+k),length:.82,amp:.063,echo:.37,attack:.03},i*.10));
    v({f:110,to:92,length:.9,amp:.064,attack:.06,shape:'triangle'});break;
  case 'encounter-start':
    v({f:360,to:262,length:.32,amp:.060,shape:'triangle',filter:1200,echo:.24});
    v({f:124,to:92,length:.37,amp:.035},.045);break;
  case 'encounter-warning':
    [0,.106,.222].forEach((delay,i)=>v({f:294+i*61,length:.085,amp:.066,shape:'triangle',filter:1330,echo:.12},delay));break;
  case 'encounter-volley':
    v({f:136,to:72,length:.37,amp:.27,shape:'triangle',filter:740,attack:.022});
    n({hz:984,to:282,length:.49,amp:.31,attack:.031});break;
  case 'encounter-shot':
  case 'encounter-shot-hit':
    v({f:740,to:310,length:.10,amp:.051,shape:'triangle',filter:1510,attack:.011});
    n({hz:1400,to:740,length:.10,amp:.13,attack:.009});
    if(e.kind==='encounter-shot-hit')v({f:613,to:780,length:.16,amp:.049,echo:.24},.047);
    else if(e.shielded)v({f:775,to:461,length:.109,amp:.024,echo:.12},.033);break;
  case 'encounter-hit':
    v({f:93,to:42,length:.29,amp:.24,attack:.024,shape:'triangle',filter:498});
    n({hz:482,to:192,length:.36,amp:.36,attack:.022});break;
  case 'encounter-dodge':
    n({hz:487,to:895,length:.21,amp:.12});
    v({f:290,to:385,length:.20,amp:.035,echo:.14},.032);break;
  case 'encounter-cleared':
    [0,4,9].forEach((k,i)=>v({f:midi(59+k),length:.42,amp:.064,echo:.30},i*.046));
    n({hz:503,to:340,length:.28,amp:.15});break;
  }
  return true;
 }
 function setState(s,t){
   const speed=clamp(Number.isFinite(s?.speed)?s.speed:0,0,160);
   const flight=s?.phase==='run',launch=s?.phase==='launch',moving=flight||launch;
   const boost=clamp((speed-48)/35,0,1), travel=clamp(speed/105,0,1);
   const ramp=(a,b,tau)=>a.setTargetAtTime(b,t,tau);
   ramp(engineGain.gain,flight?.28+travel*.27:launch?.22:.037,.18);
   ramp(engineFilter.frequency,flight?129+travel*188+boost*130:launch?159:107,.13);
   ramp(windGain.gain,flight?.15+travel*.17:.075,.20);
   ramp(band.frequency,218+travel*339+boost*90,.16);
   ramp(motor.frequency,flight?43+travel*22+boost*10:launch?53:42,.15);
   ramp(rumble.frequency,flight?27+travel*14:launch?31:26,.14);
   ramp(padD.gain,moving?.062+.015*boost:s?.phase==='results'?.083:.103,.57);
 }
 function gainAt(t,value){master.gain.setTargetAtTime(value,t,.19);}
 function dispose(){
   for(const node of bedNodes)try{node.stop();}catch{}
   for(const node of [master,limiter,ambient,effects,engine,tail,feedback,tailLP])try{node.disconnect();}catch{}
 }
 return {cue,setState,gainAt,dispose,master};
}
export function createSoundscape({volume=.76,muted=false}={}){
 let ctx=null,audio=null,played=0,lastUpdate=-Infinity,quiet=!!muted;
 let current={phase:'orbit',speed:0};
 volume=clamp(Number.isFinite(volume)?volume:.76,0,1);
 function wake(){
  if(!ctx){
    const C=globalThis.AudioContext??globalThis.webkitAudioContext;
    if(!C)return false;
    try{ctx=new C();audio=makeSynth(ctx,ctx.destination,{volume:quiet?0:volume,start:ctx.currentTime});audio.setState(current,ctx.currentTime);}
    catch{ctx=null;audio=null;return false;}
  }
  if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  return true;
 }
 function event(e,state=current){
   if(!ctx||!audio||ctx.state==='closed'||quiet)return false;
   const ok=audio.cue(ctx.currentTime+.004,e,state);if(ok)played++;return ok;
 }
 function update(state){
   if(!state)return;
   current={phase:state.phase,speed:state.speed,offset:state.offset,combo:state.combo};
   if(!ctx||!audio||ctx.currentTime-lastUpdate<.045)return;
   lastUpdate=ctx.currentTime;audio.setState(current,ctx.currentTime);
 }
 function setMuted(value){quiet=!!value;if(audio)audio.gainAt(ctx.currentTime,quiet?0:volume);return quiet;}
 function dispose(){
  audio?.dispose();if(ctx?.state!=='closed')ctx?.close().catch(()=>{});ctx=null;audio=null;lastUpdate=-Infinity;
 }
 return {wake,event,update,setMuted,dispose,muted:()=>quiet,info:()=>({...META,status:ctx?.state??'not-started',eventsPlayed:played,muted:quiet})};
}
function wavBytes(buffer){
 const n=buffer.length,ch=buffer.numberOfChannels,sr=buffer.sampleRate,size=n*ch*2,buf=new ArrayBuffer(44+size),v=new DataView(buf);
 const text=(a,k)=>{for(let i=0;i<a.length;i++)v.setUint8(k+i,a.charCodeAt(i));};
 const u16=(k,x)=>v.setUint16(k,x,true),u32=(k,x)=>v.setUint32(k,x,true);
 text('RIFF',0);u32(4,36+size);text('WAVE',8);text('fmt ',12);u32(16,16);u16(20,1);u16(22,ch);
 u32(24,sr);u32(28,sr*ch*2);u16(32,ch*2);u16(34,16);text('data',36);u32(40,size);
 const A=Array.from({length:ch},(_,j)=>buffer.getChannelData(j));
 for(let i=0;i<n;i++)for(let c=0;c<ch;c++){const z=clamp(A[c][i],-1,1);v.setInt16(44+2*(i*ch+c),z<0?z*32768:z*32767,true);}
 return new Uint8Array(buf);
}
export async function renderReplayAudio(events=[],duration=60,options={}){
 const O=globalThis.OfflineAudioContext??globalThis.webkitOfflineAudioContext;
 if(!O)throw Error('OfflineAudioContext is unavailable');
 if(!Array.isArray(events)||events.length>12000||!Number.isFinite(duration)||duration<=0||duration>360)throw TypeError('Unsupported replay mix');
 const rate=clamp(Math.round(options.sampleRate??24000),16000,48000),ch=options.channels===1?1:2;
 const length=Math.round(rate*duration),ctx=new O(ch,length,rate),synth=makeSynth(ctx,ctx.destination,{volume:clamp(options.volume??.76,0,1),start:0,stop:duration+.1});
 synth.master.gain.setValueAtTime(.0001,0);
 synth.master.gain.linearRampToValueAtTime(clamp(options.volume??.76,.001,1),Math.min(.16,duration*.15));
 let state=options.initialState??{phase:'run',speed:55};
 synth.setState(state,0);
 for(const e of events.filter(x=>x&&Number.isFinite(x.at)&&x.at>=0&&x.at<duration).slice().sort((a,b)=>a.at-b.at)){
   if(e.kind==='audio-state'){state={...state,...e};synth.setState(state,e.at);continue;}
   if(e.kind==='launch'){state={...state,phase:'launch'};synth.setState(state,e.at);}
   if(e.kind==='results'){state={...state,phase:'results'};synth.setState(state,e.at);}
   synth.cue(e.at+.002,e,state);
 }
 synth.master.gain.setTargetAtTime(.0001,Math.max(.1,duration-.35),.075);
 const b=wavBytes(await ctx.startRendering());
 let str='';for(let i=0;i<b.length;i+=16384)str+=String.fromCharCode(...b.subarray(i,i+16384));
 return globalThis.btoa(str);
}
