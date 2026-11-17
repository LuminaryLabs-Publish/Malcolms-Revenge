import {createWingTrails} from './wing-trails.mjs';
import {createFogVolume} from './fog-volume.mjs';
import {createScenery} from './scenery.mjs';
import {createCombatView} from './combat-view.mjs';
import {createDust} from './dust.mjs';
import * as T from '../vendor/three.mjs';

const vec=(p=[0,0,0])=>p?.isVector3?p.clone():new T.Vector3(...p);
const color=(hex)=>new T.Color(hex);
const U=value=>({value});
const TAU=Math.PI*2;
const plainVertex=`varying vec3 n; varying vec3 p; void main(){n=normalize(normalMatrix*normal);p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const common=`
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise2(vec2 p){vec2 f=fract(p),i=floor(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
  vec3 tone(vec3 c){return pow(max(vec3(0.),c),vec3(.78));}
`;
const PALETTES=[
  ['#07142d','#1c4071','#246b77','#64baae','#edf5af'],
  ['#190f28','#4f294e','#773850','#c16759','#75f9cc'],
  ['#0b0f2e','#2b3262','#47457d','#969ab5','#f7ce9a']
].map(p=>p.map(color));
const BASE={exposure:1,nebula:1,stroke:.83,brushLayers:4,trailLevel:.78,pickupGlow:1,guideStrength:.42,particlesPerEvent:240,particleOpacity:1,particleScale:1.0,planetStroke:1,bank:.23,cameraDamping:7,orbitDamping:3.5,reducedEffects:false,maxPixelRatio:1.4};
const m=(o)=>new T.ShaderMaterial(o);
function mesh(g,geo,mat,p){
  const r=new T.Mesh(geo,mat);if(p)r.position.copy(vec(p));g.add(r);return r;
}
function shapeMat(h,glow=.0,scale=1) {
  return m({uniforms:{ink:U(color(h)),glow:U(glow),grain:U(scale)},vertexShader:plainVertex,fragmentShader:`
    varying vec3 n,p; uniform vec3 ink; uniform float glow,grain;
    ${common}
    void main(){float l=max(0.,dot(normalize(n),normalize(vec3(-.42,.5,.75))));
    float brush=noise2(vec2(p.x*3.+p.z*1.4,p.y*9.+p.z*.9)*grain);
    vec3 c=ink*(.31+l*.62+brush*.23)+glow*ink; c+=pow(1.-abs(n.z),3.)*.24*vec3(.21,.66,.78);
    gl_FragColor=vec4(tone(c),1.);}
  `});
}
const skyVertex=`varying vec2 uvw;void main(){uvw=uv;gl_Position=vec4(position.xy,0.,1.);}`;
function sky(scene){
  const mat=m({depthTest:false,depthWrite:false,uniforms:{
    tick:U(0),basis:U(new T.Matrix3()),screen:U(1),palette:U(PALETTES[0].slice(0,4).map(v=>v.clone())),
    exposure:U(1),strength:U(1),layers:U(4),stroke:U(.83),pan:U(new T.Vector3()),ribbons:U(0),lens:U(.45)
  },vertexShader:skyVertex,fragmentShader:`
  varying vec2 uvw; uniform float tick,screen,exposure,strength,stroke; uniform int layers; uniform mat3 basis;
  uniform vec3 palette[4]; uniform vec3 pan; uniform float ribbons,lens; ${common}
  void main(){
    vec2 v=(uvw-.5)*2.; vec3 direction=normalize(basis*vec3(v.x*screen*lens,v.y*lens,-1.));
    vec2 q=vec2(atan(direction.x,direction.z),asin(direction.y));
    float seamFree=direction.x*2.30+direction.z*.71+direction.x*direction.z*1.5;
    q.x=mix(q.x,seamFree,clamp(ribbons,0.,1.));
    // Every band uses wind-sheared low frequency noise; fine brushes live inside the band, not the screen.
    float tilt=.37*sin(q.x*1.42+.77)+.13*sin(q.x*3.3)-.06;
    float ridge=abs(q.y-tilt);
    float cloud=0., brush=0., seams=0.;
    for(int i=0;i<9;i++){
      if(i>=layers) break;
      float k=float(i), qy=q.y-tilt-k*.082+.12;
      vec2 f=vec2(q.x*(2.2+k*.43)+k*8.9,tick*.006*(k+1.)+qy*(10.+k*2.4));
      float low=noise2(f+vec2(noise2(f*.54)*2.8,0.));
      float waves=exp(-abs(qy)*4.8)/(1.+k*.26);
      float scratches=noise2(vec2(q.x*(67.+k*1.9)+k*3.,qy*(143.+k*4.2)+low*.8));
      cloud+=(smoothstep(.24,.78,low)*waves)*.21;
      brush+=waves*(.04+smoothstep(.42,.72,scratches)*.11)*smoothstep(.31,.65,low);
      seams+=pow(sin((qy+low*.04)*94.+k)*.5+.5,12.)*waves*low*.018;
    }
    vec3 base=palette[0]*(.66+.35*(1.-length(v)*.22));
    float canyon=smoothstep(.10,.62,abs(v.x)+abs(v.y)*.5);
    float belt=q.y-.36*sin(seamFree*1.7)-.06*sin(seamFree*4.)+pan.x*.00005;
    float body=exp(-abs(belt)*5.1);
    float paint=noise2(vec2(seamFree*2.8+pan.z*.00017,belt*13.-tick*.013));
    float folds=pow(.5+.5*sin(belt*69.+paint*7.+seamFree*4.),9.);
    base+=ribbons*(palette[1]*body*paint*.92+palette[2]*folds*body*.17+palette[3]*body*paint*paint*.13)*(.64+.36*canyon);
    base+=palette[1]*cloud*strength*.50;
    base+=palette[2]*brush*strength*stroke*.72;
    base+=palette[3]*seams*strength*stroke*.79;
    // Quiet grain with no frame-dependent flicker.
    float grain=(hash(floor(gl_FragCoord.xy*.82))-.5)*.017;
    gl_FragColor=vec4(max(vec3(0.),tone(base*exposure)+grain),1.);
  }`});
  const root=mesh(scene,new T.PlaneGeometry(2,2),mat);root.frustumCulled=false;root.renderOrder=-100;
  return mat.uniforms;
}
function nebulas(scene){
 const r=seed(212), p=[], k=[];
 for(let i=0;i<4100;i++){
    const h=r()*2-1, a=r()*TAU, d=1450+r()*690, w=Math.sqrt(1-h*h);
    p.push(d*w*Math.cos(a),d*h,d*w*Math.sin(a));k.push(r(),r());
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('salt',new T.Float32BufferAttribute(k,2));
 const mat=m({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{pixel:U(1),clock:U(0)},
 vertexShader:`attribute vec2 salt;varying vec2 s;uniform float pixel;void main(){s=salt;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=(1.+pow(salt.x,5.)*3.3)*pixel;}`,
 fragmentShader:`varying vec2 s;uniform float clock;void main(){vec2 p=gl_PointCoord-.5;float k=exp(-26.*dot(p,p));float tip=max(0.,1.-length(p)*2.);vec3 cold=vec3(.53,.73,1.),warm=vec3(1.,.78,.48);float l=(.26+.69*pow(s.x,3.))*(.95+.05*sin(clock*.91+s.x*78.));gl_FragColor=vec4(mix(cold,warm,s.y)*l,k*tip);}`});
 const o=new T.Points(geo,mat);o.frustumCulled=false;scene.add(o);return o;
}
function seed(s){let a=s;return ()=>((a=(Math.imul(a,1664525)+1013904223)>>>0)/4294967296);}
function planet(g,p,r,tint,accent,style=0,detail=64) {
  const mat=m({uniforms:{base:U(color(tint)),accent:U(color(accent)),brush:U(1),clock:U(0),style:U(style)},vertexShader:`
   varying vec3 meshP,normalV,w;void main(){meshP=normalize(position);normalV=normalize(normalMatrix*normal);w=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`varying vec3 meshP,normalV,w;uniform vec3 base,accent;uniform float brush,clock,style;${common}
   void main(){vec3 p=normalize(meshP),n=normalize(normalV);float lon=atan(p.x,p.z),lat=asin(p.y);
    vec2 s=vec2(p.x*3.2+p.z*1.73+sin(lat*7.)*.54,lat*5.45+p.x*p.z*.82);
    float big=noise2(s)+.49*noise2(s*2.77+.8)+.2*noise2(s*9.4);
    float line=sin((lat+.11*sin(lon*3.+big)+.03*big)*37.+style*3.)*.5+.5;
    float comb=noise2(vec2(p.x*54.+p.z*37.+big*11.,lat*108.));
    float spots=noise2(vec2(p.x*13.4+p.z*9.2,lat*19.4))*.15;
    float contour=pow(1.-abs(n.z),3.7);
    vec3 wet=mix(base*.43,accent*1.5,smoothstep(.47,1.20,big*.70+line*.26+comb*.17*brush+spots));
    float beam=max(0.,dot(n,normalize(vec3(-.52,.39,.74))));
    vec3 c=wet*(.25+beam*.91)+contour*accent*.36*(.43+beam);
    gl_FragColor=vec4(tone(c),1.);}
   `});
  const assembly=new T.Group();assembly.position.copy(vec(p));g.add(assembly);
  const sphere=mesh(assembly,new T.SphereGeometry(r,detail,Math.ceil(detail*.69)),mat);
  const atmosphere=m({side:T.BackSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{tint:U(color(accent)),thick:U(0),clock:U(0)},vertexShader:`
    varying vec3 n,e;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);e=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec3 n,e;uniform vec3 tint;uniform float thick,clock;void main(){vec3 nv=normalize(n);float h=abs(dot(nv,normalize(e)));float l=pow(1.-h,mix(5.5,3.25,thick));float roll=.66+.34*sin(nv.y*18.+nv.x*2.+clock*.22);gl_FragColor=vec4(tint*(.75+.25*roll),l*(.56+thick*.28));}`});
  const air=mesh(assembly,new T.SphereGeometry(r*1.047,Math.ceil(detail*.75),Math.ceil(detail*.50)),atmosphere);
  return {assembly,sphere,air,atmosphere,uniforms:mat.uniforms};
}
function halo(g, radius, hex, intensity=.42) {
 const material=m({transparent:true,depthWrite:false,blending:T.AdditiveBlending,
 uniforms:{ink:U(color(hex)),power:U(intensity),shape:U(0)},vertexShader:`varying vec2 q;void main(){q=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`varying vec2 q;uniform vec3 ink;uniform float power,shape;
 void main(){float d=length(q);float h=exp(-d*d*6.)*max(0.,1.-d);float ray=max(0.,1.-d)*pow(max(abs(q.x),abs(q.y)),.5)*exp(-40.*min(abs(q.x),abs(q.y)));gl_FragColor=vec4(ink,(h+shape*ray*.28)*power);}`});
 return mesh(g,new T.PlaneGeometry(radius*2,radius*2),material);
}
function coreShip(scene,settings={}){
 const g=new T.Group();scene.add(g);
 const metal=shapeMat('#d9dbcd',.26),jade=shapeMat('#7ae5d1',.14),dark=shapeMat('#26344f',.17),amber=shapeMat('#ed9066',.12);
 const plan=new T.Shape();
 plan.moveTo(0,6.4);plan.lineTo(-1.23,1.95);plan.lineTo(-4.86,-2.33);plan.lineTo(-5.33,-3.12);
 plan.lineTo(-4.15,-3.78);plan.lineTo(-1.04,-2.72);plan.lineTo(0,-3.07);plan.lineTo(1.04,-2.72);
 plan.lineTo(4.15,-3.78);plan.lineTo(5.33,-3.12);plan.lineTo(4.86,-2.33);plan.lineTo(1.23,1.95);plan.closePath();
 const hi=settings.hullLevel??0; const body=mesh(g,new T.ExtrudeGeometry(plan,{depth:hi?.48:.32,bevelSize:hi?.20:.15,bevelThickness:.17,bevelSegments:hi?3:1}),metal);
 body.rotation.x=Math.PI/2;
 const glass=mesh(g,new T.SphereGeometry(1,hi?40:20,hi?25:12),dark,[0,.18,1.02]);glass.scale.set(.72,.55,2.15);
 const tail=[];
 for(const a of [-1,1]){
  const fin=mesh(g,new T.BoxGeometry(.36,.16,4),amber,[a*2.9,.03,-1.5]);fin.rotation.y=a*.68;
  const eng=mesh(g,new T.CylinderGeometry(.49,.68,2.57,8),dark,[a*1.25,.06,-2.30]);eng.rotation.x=Math.PI/2;
  const nozzle=mesh(g,new T.CylinderGeometry(.47,.47,.08,10),jade,[a*1.25,.06,-3.60]);nozzle.rotation.x=Math.PI/2;
  const h=halo(g,2.40,'#a3fdf0',.64);h.position.set(a*1.25,.03,-4.44);tail.push(h);
 }
 if(hi){
  const ceramic=shapeMat(settings.hullTint??'#65a6d0',.14,1.45), seam=shapeMat('#344660',.05,1.7), lamps=shapeMat('#8cfff3',1.3);
  glass.position.set(0,.43,1.1);
  for(const a of [-1,1]){
    const outer=mesh(g,new T.CapsuleGeometry(.31,2.65,4,9),ceramic,[a*3.20,.09,-1.34]);outer.rotation.x=Math.PI/2;outer.rotation.z=a*.42;
    for(let i=0;i<5;i++){const v=mesh(g,new T.BoxGeometry(.70,.075,.10),seam,[a*(1.35+i*.24),.07,-1.82-i*.16]);v.rotation.y=a*.29;}
    mesh(g,new T.BoxGeometry(.20,.10,1.23),lamps,[a*3.13,.14,-2.33]).rotation.y=a*.38;
    if(hi>=2)mesh(g,new T.BoxGeometry(.12,1.07,1.76),ceramic,[a*4.4,.04,-2.7]).rotation.z=a*-.21;
    if(hi>=3)mesh(g,new T.TorusGeometry(.48,.065,7,25),lamps,[a*1.25,.06,-3.66]);
    if(hi>=4)mesh(g,new T.CylinderGeometry(.22,.41,2.09,12),seam,[a*1.7,.20,-1.75]).rotation.x=Math.PI/2;
  }
 }
 if(settings.hullSpan)g.scale.x=settings.hullSpan; if(settings.hullScale)g.scale.multiplyScalar(settings.hullScale);
 return {g,tail};
}
function pickupField(scene,route) {
 const pts=route.pickUps??[], data=new Float32Array(pts.length*3), live=new Float32Array(pts.length).fill(1), hint=new Float32Array(pts.length);
 const points=new T.BufferGeometry();
 pts.forEach((p,i)=>{vec(p.position).toArray(data,i*3);hint[i]=p.branch&&/risk|hard|alt/.test(String(p.branch))?1:0;});
 points.setAttribute('position',new T.BufferAttribute(data,3));points.setAttribute('live',new T.BufferAttribute(live,1));points.setAttribute('hint',new T.BufferAttribute(hint,1));
 const mat=m({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{pixel:U(1),time:U(0),brightness:U(1),shapes:U(0)},vertexShader:`
 attribute float live,hint; varying float pickupLive,risk;uniform float pixel;
 void main(){pickupLive=live;risk=hint;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=live*clamp(pixel*470./max(1.,-p.z),7.,38.);}
 `,fragmentShader:`
 varying float pickupLive,risk;uniform float time,brightness,shapes;
 void main(){if(pickupLive<.1)discard;vec2 q=gl_PointCoord*2.-1.;float r=mix(length(q),(abs(q.x)+abs(q.y))*.86,shapes*risk);
 vec3 ink=mix(vec3(.30,1.,.76),vec3(1.,.62,.32),risk);float shell=.52*exp(-100.*pow(r-.54,2.));
 float core=1.-smoothstep(.14,.38,r);float gl=exp(-r*r*5.)*max(0.,1.-r);
 float sparkle=shapes*exp(-25.*min(abs(q.x),abs(q.y)))*max(0.,1.-length(q));
 gl_FragColor=vec4(ink+(shell+core)*.33,min(1.,(shell+core+.4*gl+sparkle*.23)*brightness));}
 `});
 const field=new T.Points(points,mat);scene.add(field);
 return {pts,live,mat,points,field};
}
function guides(scene,route){
 const a=[],aD=[];
 for(let d=(route.origin??0)+38;d<(route.length||0);d+=28){
   const t=route.sample(d),p=vec(t.position),rt=vec(t.right||[1,0,0]);
   // Quiet small outer lane calibration, not an artificial "wall".
   for(const side of [-1,1]){
    p.clone().addScaledVector(rt,side*28).toArray(a,a.length);aD.push(d);
   }
 }
 const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(a,3));geom.setAttribute('atDist',new T.Float32BufferAttribute(aD,1));
 const mat=m({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{cur:U(0),power:U(.42),px:U(1)},vertexShader:`
 attribute float atDist;varying float fade;uniform float cur,px;
 void main(){float d=atDist-cur;fade=step(-10.,d)*(1.-smoothstep(130.,450.,d));vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(px*220./max(1.,-p.z),2.,13.);}
 `,fragmentShader:`
 varying float fade;uniform float power;
 void main(){vec2 p=abs(gl_PointCoord-.5);float v=(1.-smoothstep(.06,.27,p.y))*(1.-smoothstep(.22,.49,p.x));gl_FragColor=vec4(.56,.86,.83,fade*power*v);}
 `});
 const o=new T.Points(geom,mat);scene.add(o);return o;
}
function ringAt(scene,pos,q,r,hex,thick=.25,alpha=1) {
 const mat=m({transparent:alpha<1,depthWrite:alpha>=1,uniforms:{ink:U(color(hex)),alpha:U(alpha),glow:U(0)},vertexShader:`varying vec3 p,n;void main(){p=position;n=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`varying vec3 p,n;uniform vec3 ink;uniform float alpha,glow;void main(){float k=sin(atan(p.y,p.x)*29.)*.5+.5;gl_FragColor=vec4(ink*(.54+.40*k+glow)+.12,alpha);}`});
 const a=mesh(scene,new T.TorusGeometry(r,thick,8,72),mat,pos);a.quaternion.copy(q);return a;
}
function cues(scene,route){
 const items=[], q=new T.Quaternion(), z=new T.Vector3(0,0,1);
 for(const x of route.gates||[]){
  const d=x.dist??0,t=route.sample(d),p=x.position??t.position, f=vec(t.forward).normalize();
  q.setFromUnitVectors(z,f);
  const gate=new T.Group();scene.add(gate);gate.position.copy(vec(p));
  const ring=ringAt(gate,[0,0,0],q,32,'#f3d994',.75,.92);
  ringAt(gate,[0,0,0],q,36,'#a6eee7',.19,.4);
  ringAt(gate,[0,0,0],q,38,'#d8a67d',.13,.46);
  const star=halo(gate,54,'#ffe6a4',.30);star.material.uniforms.shape.value=1;items.push({d,object:gate,ring,star,type:'gate'});
 }
 for(const x of route.slings||[]){
  const d=x.dist??0,t=route.sample(d),p=x.position??t.position, f=vec(t.forward).normalize();
  q.setFromUnitVectors(z,f);
  const g=new T.Group();scene.add(g);g.position.copy(vec(p));
  const rr=ringAt(g,[0,0,0],q,25,'#71eaeb',.42,.76);
  ringAt(g,[0,0,0],q,29,'#f6b18b',.16,.63);
  const star=halo(g,39,'#6ee9c8',.23);items.push({d,object:g,ring:rr,star,type:'sling'});
 }
 return items;
}
function motes(scene, capacity=8192){
 const geo=new T.BufferGeometry(), pos=new Float32Array(capacity*3), v=new Float32Array(capacity*3),
   born=new Float32Array(capacity).fill(-100), count=new Float32Array(capacity), life=new Float32Array(capacity), tone=new Float32Array(capacity*3);
 for(const [name,array,n] of [['position',pos,3],['drift',v,3],['born',born,1],['salt',count,1],['lifetime',life,1],['shade',tone,3]])geo.setAttribute(name,new T.BufferAttribute(array,n).setUsage(T.DynamicDrawUsage));
 const mat=m({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{clock:U(0),pixel:U(1),opacity:U(1),shape:U(1)},
 vertexShader:`attribute vec3 drift,shade;attribute float born,salt,lifetime;varying float alive,phase,seed;varying vec3 ink;uniform float clock,pixel;
   void main(){float t=clock-born;alive=step(0.,t)*(1.-step(lifetime,t));phase=clamp(t/max(lifetime,.01),0.,1.);seed=salt;ink=shade;vec4 d=modelViewMatrix*vec4(position+drift*t*(1.-.34*phase),1.);gl_Position=projectionMatrix*d;gl_PointSize=max(1.,alive*clamp((3.+salt*10.)*pixel*82./max(1.,-d.z),2.,32.));}
 `,fragmentShader:`varying float alive,phase,seed;varying vec3 ink;uniform float opacity,shape;
   void main(){if(alive<.5)discard;vec2 q=gl_PointCoord*2.-1.;float a=(seed-.5)*6.283; q=mat2(cos(a),-sin(a),sin(a),cos(a))*q;
   q.y*=mix(1.,2.38,shape);float lum=max(0.,1.-length(q));gl_FragColor=vec4(ink,lum*lum*(1.-phase)*opacity);}
 `});
 const pts=new T.Points(geo,mat);pts.frustumCulled=false;scene.add(pts);
 let cursor=0,peak=0, emitted=0, lastBurst=0, active=0;
 function reset(){born.fill(-100);geo.getAttribute('born').needsUpdate=true;cursor=0;active=0;peak=0;emitted=0;lastBurst=0;}
 function burst(event, at, clock,c,direction){
   const hex={pickup:'#92faab',miss:'#ef8a72',sling:'#8ddbf5',gate:'#fff3b2',launch:'#96fcdd',results:'#d5f0ff','encounter-start':'#b5dcff','encounter-warning':'#ffc274','encounter-volley':'#ff633e','encounter-shot':'#80efff','encounter-shot-hit':'#f4ffda','encounter-hit':'#ff5c3e','encounter-dodge':'#a9fff0','encounter-cleared':'#d6ffba','encounter-escaped':'#f5a18b'};
   const k=event.kind;
   if(!Object.hasOwn(hex,k))return;
   const rng=seed(465*Number(event.seq??emitted+1)+75),p=vec(event.position??at),col=color(hex[k]);
   const n=Math.min(capacity,Math.max(1,Math.round(c.reducedEffects?Math.min(c.particlesPerEvent,48):c.particlesPerEvent)));
   for(let j=0;j<n;j++){
    const i=(cursor++)%capacity,s=rng(), speed=2+Math.pow(rng(),.64)*(k==='pickup'?22:34),
    h=rng()*2-1, theta=rng()*TAU, w=Math.sqrt(1-h*h);
    p.toArray(pos,i*3);
    let vx=speed*w*Math.cos(theta),vy=speed*h,vz=speed*w*Math.sin(theta);
    if(c.fxShape){const dir=direction??[0,0,1];const ring=k==='sling'||k==='encounter-cleared'||k==='gate',pull=k==='pickup';const f=ring?11:pull?-17:3;vx=vx*(ring?1.35:pull?.61:.92)+f*dir[0];vy=vy*(ring?.49:pull?.45:.83)+f*dir[1];vz=vz*(ring?1.15:pull?.62:.93)+f*dir[2];}
    v.set([vx,vy,vz],i*3);
    life[i]=.42+rng()*.91;born[i]=clock;count[i]=s;tone.set([col.r*(.76+s*.32),col.g*(.76+s*.32),col.b*(.76+s*.32)],i*3);
   }
   emitted+=n;lastBurst=n;
   for(const name of ['position','drift','born','salt','lifetime','shade'])geo.getAttribute(name).needsUpdate=true;
 }
 function update(t,c,pr){
   mat.uniforms.clock.value=t;mat.uniforms.pixel.value=pr*c.particleScale;mat.uniforms.opacity.value=c.particleOpacity;mat.uniforms.shape.value=c.trailLevel;
   active=0;
   for(let j=0;j<capacity;j++)if(t-born[j]<life[j])active++;
   peak=Math.max(active,peak);
 }
 return {reset,burst,update,stats:()=>({poolCapacity:capacity,active,peak,emitted,lastBurst})};
}
function motionTicks(scene) {
 const n=88, a=new Float32Array(n*2);
 const r=seed(7613);
 for(let i=0;i<n;i++){const q=r()*TAU;a[i*2]=q;a[i*2+1]=r();}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(n*3),3));g.setAttribute('inset',new T.Float32BufferAttribute(a,2));
 const material=m({transparent:true,depthTest:false,depthWrite:false,uniforms:{clock:U(0),gain:U(0)},vertexShader:`
 attribute vec2 inset;uniform float clock,gain;varying float al,ang;
 void main(){float a=inset.x;float x=fract(inset.y+clock*.29);ang=a;al=sin(x*3.14159)*gain;float r=.54+x*.69;gl_Position=vec4(cos(a)*r,sin(a)*r,0.,1.);gl_PointSize=4.+x*18.;}`,
 fragmentShader:`varying float al,ang;void main(){vec2 q=gl_PointCoord-.5;vec2 p=vec2(cos(ang),-sin(ang));float k=exp(-pow(dot(q,vec2(-p.y,p.x))*33.,2.))*max(0.,1.-abs(dot(q,p))*2.);gl_FragColor=vec4(.87,.95,1.,al*k*.27);}`});
 const o=new T.Points(g,material);o.frustumCulled=false;o.renderOrder=200;scene.add(o);return material.uniforms;
}
function overlap(a,b){return a.length===b.length && a.every((v,i)=>v===b[i]);}
export function createView(canvas,route,settings={}){
 const config={...BASE};
 function normalized(partial){
   const p={...partial};
   for(const [k,src] of Object.entries({stroke:'strokeDepth',trailLevel:'trail',particlesPerEvent:'particles',brushLayers:'shaderLayers',reducedEffects:'reduced'}))
    if(p[src]!==undefined&&p[k]===undefined)p[k]=p[src];
   if(p.reducedMotion!==undefined&&p.reducedEffects===undefined)p.reducedEffects=p.reducedMotion;
   if(typeof p.cameraDamping==='number'&&p.cameraDamping>0&&p.cameraDamping<3)p.cameraDamping*=BASE.cameraDamping;
   return p;
 }
 Object.assign(config,normalized(settings));
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setClearColor('#0a122b',1);
 const scene=new T.Scene(), camera=new T.PerspectiveCamera(config.fov??49,1,.12,8000), ray=new T.Raycaster();
 const skyU=sky(scene), stars=nebulas(scene), ship=coreShip(scene,config);
 const wingTrails=config.wingTrails?createWingTrails(T,scene,config):null;
 const particles=motes(scene,config.particlePool??8192), velocityOverlay=motionTicks(scene), combatView=config.combat?createCombatView(T,scene):null, routeRoot=new T.Group();scene.add(routeRoot);
 let p0=route.sample(0), initial=vec(p0.position), startForward=vec(p0.forward), startUp=vec(p0.up||[0,1,0]), startRight=vec(p0.right||[1,0,0]);
 const center=route.menuPlanet?.position?vec(route.menuPlanet.position):initial.clone().addScaledVector(startRight,-68).addScaledVector(startForward,72).addScaledVector(startUp,17);
 const menuRadius=route.menuPlanet?.radius??47;
 const titlePlanet=planet(scene,center,menuRadius,'#244c83','#72e2d6',.21,config.planetDetail??64);
 let gases,cue,routeGuides,ringsPlanets,dust=null,fog=null,scenery=null;
 function setRoute(next){
  route=next;dust?.dispose();fog?.dispose();
  routeRoot.traverse(x=>{x.geometry?.dispose();if(x.material?.dispose)x.material.dispose();});routeRoot.clear();
  gases=pickupField(routeRoot,route);cue=cues(routeRoot,route);routeGuides=guides(routeRoot,route);
  ringsPlanets=(route.slings??[]).map((data,i)=>{
   const colorPair=[['#203968','#59a8e5'],['#632540','#f4786f'],['#393d71','#adadff']][i%3];
   const item=planet(routeRoot,data.planet??data.position,Math.max(12,(data.radius||47)*.91),...colorPair,i,config.planetDetail??64);
   return {...item,d:data.dist};
  });
  dust=config.dust?createDust(T,routeRoot,route,config):null;
  fog=config.fog?createFogVolume(T,routeRoot,route,config):null;
  scenery=config.scenery?createScenery(T,routeRoot,route,config):null;
 }
 setRoute(route);
 const look=new T.Vector3(), basis=new T.Matrix4(), matBasis=new T.Matrix3(), craftQ=new T.Quaternion();
 const front=new T.Vector3(0,0,1), shipUp=new T.Vector3(0,1,0), vecP=new T.Vector3(), forward=new T.Vector3(), up=new T.Vector3(), side=new T.Vector3();
 const wantCam=new T.Vector3(), wantLook=new T.Vector3(), orbitTarget=new T.Vector3(), orbitStart=new T.Vector3(), orbitForward=new T.Vector3();
 const gl=renderer.getContext(), glDebug=gl.getExtension("WEBGL_debug_renderer_info");
 let phase='',first=true,time=0,lastEvent=-1,lastCombat=-1,lastTick=-1,lastOffset=0,bankEase=0,kickEnd=-2,lastW=0,lastH=0,lastPixel=0,stamp=null,selectionReady=false,selected=false,orbitTick=0,launchSeen=0;
 function configure(partial={}){Object.assign(config,normalized(partial));return {...config};}
 function render(state,dt=1/60){
   dt=Math.max(0,Math.min(.10,Number.isFinite(dt)?dt:1/60)); time+=dt;
   const w=canvas.clientWidth||canvas.width||1,h=canvas.clientHeight||canvas.height||1,pr=Math.max(.5,Math.min(Number(globalThis.devicePixelRatio)||1,config.maxPixelRatio,config.softwareBudget&&glDebug&&/SwiftShader/.test(gl.getParameter(glDebug.UNMASKED_RENDERER_WEBGL))?(config.softwarePixelRatio??.82):Infinity));
   if(w!==lastW||h!==lastH||pr!==lastPixel){lastW=w;lastH=h;lastPixel=pr;renderer.setPixelRatio(pr);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
   if(state.tick<lastTick){lastEvent=lastCombat=-1;particles.reset();stamp=null;kickEnd=-2;bankEase=0;}lastTick=state.tick;
   const isOrbit=state.phase==='orbit'||state.phase==='ready';
   const wasOrbit=phase==='orbit'||phase==='ready';
   if(isOrbit&&!wasOrbit){
      orbitTick=0;lastEvent=lastCombat=-1;particles.reset();selected=false;
      gases.live.fill(1);gases.points.attributes.live.needsUpdate=true;stamp=null;
   }
   if(state.phase==='launch'&&phase!=='launch')launchSeen=0;
   if(state.phase==='launch')launchSeen+=dt;
   phase=state.phase;
   const d=state.distance||0,r=route.sample(d);
   forward.copy(vec(state.forward??r.forward)).normalize();up.copy(vec(state.up??r.up??[0,1,0])).normalize();
   side.crossVectors(up,forward).normalize();vecP.copy(vec(state.position??r.position));
   if(isOrbit){
    orbitTick+=dt;
    const ang=route.orbit?.angularSpeed?(state.tick??0)/60*route.orbit.angularSpeed + (route.orbit.startAngle??0):.23+orbitTick*.115;
    if(state.position&&vecP.distanceTo(center)<menuRadius*3.25&&vecP.distanceTo(center)>menuRadius*.84){
      orbitStart.copy(vecP);orbitForward.copy(forward);
    } else {
      const radius=menuRadius*1.28;
      orbitStart.copy(center).addScaledVector(startRight,radius*Math.sin(ang)).addScaledVector(startUp,radius*.56*Math.cos(ang)).addScaledVector(startForward,-radius*.92*Math.cos(ang));
      orbitForward.copy(startRight).multiplyScalar(Math.cos(ang)).addScaledVector(startUp,-Math.sin(ang)*.56).addScaledVector(startForward,Math.sin(ang)*.92).normalize();
    }
    vecP.copy(orbitStart);forward.copy(orbitForward);
    orbitTarget.copy(center).addScaledVector(startRight,menuRadius*.04);
    wantCam.copy(center).addScaledVector(startForward,menuRadius*2.08).addScaledVector(startUp,menuRadius*.59).addScaledVector(startRight,menuRadius*1.50);
    wantLook.copy(orbitTarget);
   } else {
    const s=Math.max(0,state.speed||0);
    const ahead=route.sample(Math.min(route.length,d+51+s*.61));
    wantCam.copy(vecP).addScaledVector(forward,-(config.cameraDistance??19.7)).addScaledVector(up,config.cameraHeight??8);
    wantLook.copy(vec(ahead.position)).lerp(vecP.clone().addScaledVector(forward,70),.33).addScaledVector(up,3.4);
    if(config.steadyCamera&&state.phase!=='launch'){const centerline=vec(r.position),axis=vec(r.forward),worldUp=vec(r.up);wantCam.copy(centerline).addScaledVector(axis,-(config.cameraDistance??37)).addScaledVector(worldUp,config.cameraHeight??12);wantLook.copy(vec(ahead.position)).lerp(centerline.clone().addScaledVector(axis,84),.58).addScaledVector(worldUp,3.4);}
    if(state.phase==='launch'){
      // The last orbital camera stays live while it catches the continuous launch trajectory.
      wantLook.lerp(vecP.clone().addScaledVector(forward,45),1-Math.min(1,launchSeen/.85));
    }
   }
   const damper=isOrbit?config.orbitDamping:state.phase==='launch'?(config.cinematic?(state.launchProgress<.48?0:9):Math.min(config.cameraDamping,3.4+launchSeen*2.1)):config.cameraDamping;
   const a=first?1:1-Math.exp(-damper*dt);
   camera.position.lerp(wantCam,a);look.lerp(wantLook,a);
   camera.up.lerp(up,.50*a).normalize();camera.lookAt(look);camera.updateMatrixWorld();
   ship.g.position.copy(vecP);
   basis.lookAt(forward,new T.Vector3(),up);
   craftQ.setFromRotationMatrix(basis);
   const offset=state.offset?.[0]??0,delta=(offset-lastOffset)/Math.max(dt,1/120);lastOffset=offset;
   bankEase+=((config.shipBank?Math.max(-.25,Math.min(.25,delta*.012)):0)-bankEase)*(1-Math.exp(-6*dt));
   const bank=!isOrbit&&!config.reducedEffects?bankEase:0;
   craftQ.multiply(new T.Quaternion().setFromAxisAngle(front,bank));
   ship.g.quaternion.slerp(craftQ,first?1:1-Math.exp(-13*dt));
   ship.g.visible=state.phase!=='results';
   titlePlanet.assembly.visible=isOrbit||state.phase==='launch'||d<180;
   const airStage=config.atmosphere??0;
   for(const item of [titlePlanet,...ringsPlanets]){item.air.scale.setScalar(1+airStage*.085);item.atmosphere.uniforms.thick.value=airStage;item.atmosphere.uniforms.clock.value=time;}
   titlePlanet.uniforms.brush.value=config.planetStroke;titlePlanet.uniforms.clock.value=time;
   titlePlanet.sphere.rotation.y=.074*time;
   for(const p of ringsPlanets){p.assembly.visible=!isOrbit&&Math.abs(p.d-d)<1700;p.uniforms.brush.value=config.planetStroke;p.sphere.rotation.y=time*.035;}
   for(const h of ship.tail){
    h.quaternion.copy(ship.g.quaternion).invert().multiply(camera.quaternion);
    h.scale.setScalar(.68+(state.speed||0)*.009+Math.sin(time*7.)*.06);
    const flare=config.slingGlow?Math.min(1,Math.max(0,(kickEnd-time)/.90)):0;
    h.material.uniforms.power.value=.32+Math.min(.39,(state.speed||0)*.006)+flare*.46;
   }
   stars.position.copy(camera.position);stars.material.uniforms.clock.value=time;stars.material.uniforms.pixel.value=pr;
   skyU.basis.value.setFromMatrix4(camera.matrixWorld);skyU.screen.value=camera.aspect;skyU.tick.value=time;skyU.exposure.value=config.exposure;skyU.strength.value=config.nebula;
   skyU.lens.value=Math.tan(camera.fov*Math.PI/360);skyU.ribbons.value=config.ribbons??0;skyU.pan.value.copy(camera.position);skyU.stroke.value=config.stroke;skyU.layers.value=config.reducedEffects?2:Math.max(1,Math.min(9,Math.round(config.brushLayers)));
   const ix=isOrbit?0:Math.max(0,Math.min(2,typeof state.leg==='number'?state.leg:Math.floor(3*d/route.length)));
   for(let i=0;i<4;i++){const paletteK=Array.isArray(config.palette)&&config.palette[i]?color(config.palette[i]):PALETTES[ix][i].clone().multiplyScalar(typeof config.palette==='number'?Math.max(.4,Math.min(1.8,config.palette)):1);skyU.palette.value[i].lerp(paletteK,first?1:1-Math.exp(-.82*dt));}
   const achieved=state.collected instanceof Set?[...state.collected]:Array.isArray(state.collected)?state.collected:[];
   if(!stamp||!overlap(achieved,stamp)){
     const ids=new Set(achieved);for(let i=0;i<gases.pts.length;i++)gases.live[i]=ids.has(gases.pts[i].id)?0:1;
     gases.points.attributes.live.needsUpdate=true;stamp=achieved.slice();
   }
   gases.mat.uniforms.pixel.value=pr;gases.mat.uniforms.time.value=time;gases.mat.uniforms.brightness.value=config.pickupGlow;gases.mat.uniforms.shapes.value=config.gasShapes?1:0;gases.field.visible=!isOrbit;
   routeGuides.visible=!isOrbit;routeGuides.material.uniforms.cur.value=d;routeGuides.material.uniforms.power.value=config.guideStrength;routeGuides.material.uniforms.px.value=pr;
   for(const c of cue){
    c.object.visible=!isOrbit&&c.d-d>-140&&c.d-d<1350;
    c.star.quaternion.copy(camera.quaternion);c.ring.material.uniforms.glow.value=.22*Math.sin(time*2.3)+.22;
   }
   if(!isOrbit)for(const e of state.events||[]){
     const seq=e.seq??e.tick??0;if(seq<=lastEvent)continue;
     lastEvent=seq;if(config.slingGlow&&e.kind==='sling'&&e.grade==='clean')kickEnd=time+.90;particles.burst(e,vecP,time,config,state.forward);
   }
   if(combatView)for(const e of state.encounter?.events??[]){if(e.seq<=lastCombat)continue;lastCombat=e.seq;particles.burst(e,vecP,time,config,state.forward);}
   combatView?.update(state,camera,time,config);
   wingTrails?.update(state,ship.g,camera,config);
   particles.update(time,config,pr);
   velocityOverlay.clock.value=time;
   velocityOverlay.gain.value=isOrbit||config.reducedEffects?0:config.trailLevel*Math.max(0,Math.min(1,((state.speed||0)-42)/53+(config.slingGlow?Math.min(.25,Math.max(0,kickEnd-time)*.28):0)));
   dust?.update(state,camera,time,config);fog?.update(state,camera,time,config);scenery?.update(state,time,config);renderer.render(scene,camera);first=false;selectionReady=isOrbit;
 }
 function selectPlanet(x,y){
   if(!selectionReady||selected||!Number.isFinite(x)||!Number.isFinite(y))return false;
   const r=canvas.getBoundingClientRect(),n=new T.Vector2((x-r.left)/Math.max(1,r.width)*2-1,-(y-r.top)/Math.max(1,r.height)*2+1);
   ray.setFromCamera(n,camera);const hit=ray.intersectObject(titlePlanet.sphere,false).length>0;
   return hit;
 }
 function project(pos){
   const p=vec(pos).project(camera);
   return{x:(p.x+1)/2,y:(1-p.y)/2,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1};
 }
 function planetScreen(){
   const p=project(center),r=canvas.getBoundingClientRect();
   return {x:r.left+r.width*p.x,y:r.top+r.height*p.y,visible:!!selectionReady&&p.visible};
 }
 function info(){
   let meshes=0,shaders=0;
   scene.traverse(x=>{if((x.isMesh||x.isPoints)&&x.material){meshes++;if(x.material.isShaderMaterial)shaders++;}});
   return {three:T.REVISION,sceneBuffer:[canvas.width,canvas.height],cssViewport:[canvas.clientWidth,canvas.clientHeight],fov:camera.fov,chaseDistance:config.cameraDistance??19.7,backend:'WebGL2',driver:glDebug?gl.getParameter(glDebug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pointDrawCount:renderer.info.render.points,
    geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs?.length??null,shaderDrawables:shaders,totalDrawables:meshes,residentLegs:ringsPlanets.length,visibleLegs:ringsPlanets.filter(p=>p.assembly.visible).length,
    lookFrom:camera.position.toArray(),lookAt:look.toArray(),cameraQuaternion:camera.quaternion.toArray(),settings:{...config},...particles.stats(),...dust?.info(),...fog?.info(),...wingTrails?.info(),...scenery?.info(),...combatView?.info()};
 }
 return {render,selectPlanet,planetScreen,project,configure,info,setRoute};
}
