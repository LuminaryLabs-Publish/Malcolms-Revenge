// For each resident, world-anchored ellipsoid a bounded single-scattering march is
// integrated along the view ray. Transparent center-depth primitives are intentionally
// off the flight line: the normal depth test rejects opaque foreground objects.
export function createFogVolume(T,host,route,settings={}){
 const start=Number.isFinite(route.origin)?route.origin:0,end=route.length,span=Math.max(0,end-start);
 const cent=[],bounds=[],inks=[],ranges=[];
 const V=(a)=>a?.isVector3?a.clone():new T.Vector3(...a);
 let x=(Math.floor(start*67)+(settings.fogSeed??819193))>>>0;
 const random=()=>((x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296);
 const pal=[['#3a82a8','#3bacad','#94cad9'],['#834760','#d7796d','#f2b57d'],['#6462a3','#818de0','#b8c8f2']];
 const spacing=Math.max(112,span/64);
 const place=(f,d,dx,dy,dd)=>f.p.clone().addScaledVector(f.r,dx).addScaledVector(f.u,dy).addScaledVector(f.f,dd);
 for(let d=start+53;d<end;d+=spacing){
   const s=route.sample(d),f={p:V(s.position),r:V(s.right??[1,0,0]),u:V(s.up??[0,1,0]),f:V(s.forward??[0,0,1])};
   const i=route.legs?.findIndex(l=>d>=l.start&&d<=l.end);
   const palette=pal[(i>=0?i:Math.min(2,Math.floor((d-start)*3/Math.max(1,span))))%pal.length];
   for(let k=0;k<3;k++){
     const sign=(Math.floor((d-start)/spacing)+k)%2===0?1:-1;
     const deep=k===2, base=deep?1.72:1.;
     const side=sign*((deep?153:80)+random()*36+19*Math.sin(d*.005+k)),vertical=(random()-.5)*(deep?116:62)+(k-1)*19;
     const p=place(f,d,side,vertical,(random()-.5)*spacing*.66);
     p.toArray(cent,cent.length);bounds.push((48+random()*29)*base,(22+random()*21)*base,(31+random()*22)*base,random());
     new T.Color(palette[k]).toArray(inks,inks.length);ranges.push(d);
   }
 }
 const quad=new T.PlaneGeometry(2,2),geo=new T.InstancedBufferGeometry();
 geo.index=quad.index.clone();geo.setAttribute('position',quad.attributes.position.clone());quad.dispose();
 for(const [k,a,w] of [['centerW',cent,3],['bounds',bounds,4],['pigment',inks,3],['along',ranges,1]])geo.setAttribute(k,new T.InstancedBufferAttribute(Float32Array.from(a),w));
 geo.instanceCount=ranges.length;
 const u=value=>({value});
 const mat=new T.ShaderMaterial({transparent:true,forceSinglePass:true,depthWrite:false,side:T.DoubleSide,toneMapped:false,
   uniforms:{clock:u(0),dist:u(start),density:u(1),opacity:u(1),steps:u(5),extent:u(1),heat:u(.3),toWorld:u(new T.Matrix3())},
   vertexShader:`
     attribute vec3 centerW,pigment;attribute vec4 bounds;attribute float along;
     uniform float dist,extent; varying vec3 ray,ctr,rad,ink;varying float seed,clipMask;
     void main(){
       vec4 c=modelViewMatrix*vec4(centerW,1.); float delta=along-dist;
       clipMask=smoothstep(-150.,-28.,delta)*(1.-smoothstep(335.,615.,delta))*smoothstep(25.,65.,-c.z);
       if(clipMask<.003){gl_Position=vec4(3.,3.,3.,1.);return;}
       ctr=c.xyz;rad=bounds.xyz*extent;ink=pigment;seed=bounds.w;
       ray=c.xyz+vec3(position.xy*rad.xy*1.52,0.);
       gl_Position=projectionMatrix*vec4(ray,1.);
     }`,
   fragmentShader:`
     varying vec3 ray,ctr,rad,ink;varying float seed,clipMask;
     uniform float clock,density,opacity,heat;
     uniform mat3 toWorld;
     uniform int steps;
     float hash3(vec3 p) {
       p=fract(p*.3183099+vec3(.19,.10,.13));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
     }
     float fogNoise(vec3 p){
       vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
       return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
       mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
     }
     void main(){
       vec3 rd=normalize(ray),o=-ctr/rad,a=rd/rad;float A=dot(a,a),B=dot(o,a),C=dot(o,o)-1.;
       float H=B*B-A*C;if(H<=0.)discard;
       float t0=max(0.,(-B-sqrt(H))/A),t1=(-B+sqrt(H))/A;
       if(t1<=t0)discard;
       float unit=(t1-t0)/float(steps), optical=0., sparkle=0.;
       // Phase approximation peaks looking toward the off-axis key.
       vec3 key=normalize(vec3(-.45,.50,-.75));float scatter=.38+1.15*pow(max(.0,dot(rd,key)),5.);
       vec3 motion=vec3(clock*.075,clock*.023,-clock*.028);
       for(int i=0;i<8;i++){
         if(i>=steps)break;
         vec3 p=o+a*(t0+(float(i)+.5)*unit);
         float rim=max(0.,1.-dot(p,p));
         float warp=sin(p.y*16.+p.z*12.+seed*88.+clock*.62);
         vec3 field=(toWorld*(p*rad))*vec3(.062,.091,.068)+motion+seed*14.+vec3(warp*.23*heat,0,0);
         float lo=fogNoise(field),hi=fogNoise(field*2.51+vec3(1.5,8.4,44.));
         float mass=smoothstep(.19,.81,lo*.73+hi*.27)*rim*rim;
         float absorb=mass*unit/max(16.,rad.z)*density;
         optical+=absorb*(1.-optical*.35);
         sparkle+=absorb*smoothstep(.39,.79,lo);
       }
       float alpha=(1.-exp(-optical*1.48))*clipMask*opacity;
       if(alpha<.003)discard;
       vec3 illuminated=pow(ink,vec3(.65))*(.48+.52*scatter)+sparkle*.15*vec3(.43,.68,.91);
       gl_FragColor=vec4(illuminated,clamp(alpha,0.,.86));
     }`
 });
 const cloud=new T.Mesh(geo,mat);cloud.frustumCulled=false;cloud.renderOrder=-3;host.add(cloud);
 const num=(value,fallback)=>Number.isFinite(value)?value:fallback;
 const cap=(value,a,b)=>Math.max(a,Math.min(b,value));
 function update(state,camera,time,config=settings){
   const reduced=config.reducedEffects??config.reduced;
   cloud.visible=config.fog!==false&&state.phase!=='orbit'&&state.phase!=='ready'&&state.phase!=='results'&&span>0;
   const v=mat.uniforms;
   v.clock.value=reduced?0:num(time,0);
   v.dist.value=num(state.distance,start);
   v.density.value=cap(num(config.fogDensity,1.18),0,2.5)*(reduced?.58:1.);
   v.opacity.value=cap(num(config.fogOpacity,.89),0,1.5);
   v.steps.value=reduced?3:Math.round(cap(num(config.fogSteps,5),4,8));
   v.extent.value=cap(num(config.fogScale,1),.5,1.6);
   v.heat.value=reduced?0:cap(num(config.heatHaze,.25),0,1);
   if(camera?.matrixWorld)v.toWorld.value.setFromMatrix4(camera.matrixWorld);
 }
 function info(){return {fogDrawables:+cloud.visible,fogVolumes:ranges.length,fogRaySteps:mat.uniforms.steps.value,fogOrigin:start,fogApproximation:'instanced ellipsoid, transmittance + forward scattering'};}
 function dispose(){host.remove(cloud);geo.dispose();mat.dispose();}
 return {update,info,dispose};
}
