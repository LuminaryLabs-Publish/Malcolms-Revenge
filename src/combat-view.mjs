// Starline presentation only. All GPU art is bounded and can be hidden without touching encounter state.
export function createCombatView(T,scene){
 const u=value=>({value}), V=(x=[0,0,0])=>x?.isVector3?x.clone():new T.Vector3(...x);
 const shade=(primary,accent)=>new T.ShaderMaterial({
   uniforms:{base:u(new T.Color(primary)),bright:u(new T.Color(accent)),clock:u(0),hull:u(1)},
   vertexShader:`varying vec3 q,n;void main(){q=position;n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`varying vec3 q,n;uniform vec3 base,bright;uniform float clock,hull;
   void main(){float r=pow(1.-abs(n.z),3.);float l=max(0.,dot(n,normalize(vec3(-.45,.42,.78))));
     float pulse=.74+.26*sin(clock*3.1+q.z*.48+q.x*.51);float panel=step(.83,fract(q.y*.37+q.z*.27));
     vec3 c=base*(.31+.83*l)+bright*(.23*r+.12*panel*pulse+.10*(1.-hull));
     gl_FragColor=vec4(pow(max(vec3(.0),c),vec3(.74)),1.);}`
 });
 const pulseMaterial=(color)=>new T.ShaderMaterial({
  transparent:true,blending:T.AdditiveBlending,depthWrite:false,
  uniforms:{ink:u(new T.Color(color)),power:u(.9)},
  vertexShader:`varying vec2 a;void main(){a=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 a;uniform vec3 ink;uniform float power;void main(){float q=abs(a.x-.5)*2.;
    gl_FragColor=vec4(ink,(.46+.53*pow(1.-q,2.))*power);}`
 });
 const put=(parent,geo,mat,p=[0,0,0])=>{const x=new T.Mesh(geo,mat);x.position.copy(V(p));parent.add(x);return x;};
 const root=new T.Group();scene.add(root);
 const bodies=new Map();
 function body(type){
   const models={
     needle:['#713b67','#f4a4d5','#a9f1ff'],
     tram:['#396689','#94dcec','#f4cb96'],
     prism:['#554f9b','#d1a7ff','#ff8f61']
   };
   const [a,b,c]=models[type];
   const g=new T.Group(),mat=shade(a,b),l=shade(c,c),light=pulseMaterial(c);
   root.add(g);
   if(type==='needle'){
     const x=put(g,new T.OctahedronGeometry(2.45,0),mat);x.scale.set(.72,.58,2.15);
     for(const i of [-1,1]){
       const wing=put(g,new T.ConeGeometry(1.31,5.6,3),mat,[i*2.1,.1,-.95]);
       wing.rotation.set(Math.PI/2+.11,i*.73,i*.39);
       const rail=put(g,new T.BoxGeometry(.24,.19,2.43),light,[i*2.06,.39,-.82]);rail.rotation.y=i*.46;
     }
     put(g,new T.SphereGeometry(.55,12,8),l,[0,.17,-3.78]);
   }else if(type==='tram'){
     put(g,new T.BoxGeometry(4.65,1.57,2.95),mat);
     const cap=put(g,new T.CylinderGeometry(1.42,1.86,2.96,6),mat,[0,0,-1.85]);cap.rotation.x=Math.PI/2;
     for(const i of [-1,1]){
       put(g,new T.BoxGeometry(.98,2.03,4.42),mat,[i*2.67,.06,.31]);
       put(g,new T.BoxGeometry(.25,.24,3.18),light,[i*2.66,.91,.08]);
       put(g,new T.BoxGeometry(.66,.48,.14),light,[i*2.53,-.12,-2.0]);
     }
   }else{
     const x=put(g,new T.TetrahedronGeometry(3.05,0),mat);x.rotation.set(.56,Math.PI/3,.27);x.scale.set(1.44,.76,1.21);
     for(const i of [-1,1]){
       const tip=put(g,new T.TetrahedronGeometry(1.71,0),mat,[i*2.4,.0,-.2]);tip.rotation.set(i*.34,-i*.6,i*.75);tip.scale.set(.57,1.25,1.77);
     }
     put(g,new T.OctahedronGeometry(.54,0),light,[0,.20,-2.58]);
   }
   const core=new T.TorusGeometry(3.5,.08,6,42);
   const shield=pulseMaterial('#80e2fa');
   const ring=put(g,core,shield,[0,0,-.2]);
   const counter=new T.Group();g.add(counter);counter.position.set(0,3.05,0);
   const marks=[];
   for(let i=0;i<7;i++){marks.push(put(counter,new T.BoxGeometry(.36,.16,.12),pulseMaterial(c),[(i-3)*.46,0,0]));}
   g.visible=false;bodies.set(type,{g,mat,l,ring,counter,marks});
 }
 for(const sym of ['needle','tram','prism'])body(sym);
 const dangerMat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
   uniforms:{type:u(0),progress:u(0),firing:u(0),time:u(0),quiet:u(0),wash:u(1)},
   vertexShader:`varying vec2 q;void main(){q=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`varying vec2 q;uniform float type,progress,firing,time,quiet,wash;
   float cut(float k,float x){return 1.-smoothstep(k,k+.02,abs(x));}
   void main(){
     vec2 p=q; float signedEdge,inside,detail;
     if(type<.5){
       signedEdge=abs(p.x)+abs(p.y)-.94; inside=1.-smoothstep(-.025,0.,signedEdge);
       detail=cut(.014,p.x)+cut(.014,p.y);
     }else if(type<1.5){
       signedEdge=max(abs(p.x)-.82,abs(p.y)-.65);inside=1.-smoothstep(-.025,0.,signedEdge);
       detail=exp(-89.*pow(abs(p.x)-.50,2.))+exp(-89.*pow(p.x,2.));
     }else{
       signedEdge=max(-p.y-.72,abs(p.x)+.50*p.y-.43);inside=1.-smoothstep(-.025,0.,signedEdge);
       detail=cut(.022,(p.x*1.9+p.y)*.48)+cut(.022,(p.x*1.9-p.y)*.48);
     }
     float edge=exp(-88.*abs(signedEdge));float dash=.45+.55*step(.40,fract((p.x+p.y)*9.+progress*2.));
     float beat=mix(.74+.26*sin(time*9.),1.,quiet);float sweep=exp(-52.*pow(length(p)-max(.09,1.07-progress),2.))*inside;
     float alpha=wash*(edge*(.64+.33*progress)*dash+.097*inside+.11*inside*detail+.23*sweep)*beat;
     vec3 ink=mix(vec3(1.,.50,.09),vec3(1.,.10,.09),firing);
     gl_FragColor=vec4(ink,min(.97,alpha));}`
 });
 const warning=put(root,new T.PlaneGeometry(2,2),dangerMat);
 warning.visible=false;warning.renderOrder=24;
 const beamMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,
   uniforms:{uFade:u(0),uHit:u(0)},
   vertexShader:`varying vec3 n,q;void main(){n=normalize(normalMatrix*normal);q=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`varying vec3 n,q;uniform float uFade,uHit;void main(){float c=pow(abs(n.z),.47)*uFade;
   vec3 color=mix(vec3(.50,.82,1.),vec3(.75,1.,.61),uHit);gl_FragColor=vec4(color,c);}`
 });
 const pool=Array.from({length:8},()=>{let m=put(root,new T.CylinderGeometry(1,1,1,5),beamMat.clone());m.visible=false;m.renderOrder=23;return {object:m,t:-1.0,hit:false};});
 let seen=0,index=0,shotCount=0,visibleBeams=0,activeType=null;
 const y=new T.Vector3(0,1,0);
 function update(state,camera,time,config={}){
   const e=state.encounter,enemy=e?.enemy, hazard=e?.warning, inGame=state.phase==='run';
   root.visible=inGame&&config.combat!==false;
   const customReduced=config.reducedEffects??config.reduced;
   for(const {g} of bodies.values())g.visible=false;
   activeType=null;
   if(inGame&&enemy&&enemy.hp>0){
     const b=bodies.get(enemy.type);
     if(b){
       activeType=enemy.type;b.g.visible=true;b.g.position.copy(V(enemy.position));
       // Face the rider; front shield and distinct engine silhouettes remain identifiable from the chase camera.
       b.g.quaternion.copy(camera.quaternion);
       b.g.rotateZ((customReduced?0:Math.sin(time*1.38))*.15);
       b.mat.uniforms.clock.value=time;b.mat.uniforms.hull.value=enemy.hp/Math.max(1,enemy.maxHP||enemy.hp);
       b.ring.visible=!!enemy.shielded;
       b.ring.material.uniforms.power.value=.49;
       for(let i=0;i<b.marks.length;i++){
          b.marks[i].visible=i<enemy.maxHP;
          b.marks[i].material.uniforms.power.value=i<enemy.hp?.93:.19;
       }
     }
   }
   warning.visible=inGame&&!!hazard;
   if(warning.visible){
     const type={diamond:0,bars:1,triangle:2}[hazard.shape]??0;
     warning.position.copy(V(hazard.position));warning.quaternion.copy(camera.quaternion);
     const rr=hazard.radius||8;
     warning.scale.set(type===1?rr/.82:rr,type===1?7/.65:rr,1);
     dangerMat.uniforms.type.value=type;dangerMat.uniforms.progress.value=hazard.progress??0;
     dangerMat.uniforms.firing.value=e.phase==='volley'?1:0;
     dangerMat.uniforms.time.value=time;dangerMat.uniforms.quiet.value=customReduced?1:0;
     dangerMat.uniforms.wash.value=Math.min(1.2,Math.max(.4,config.warningStrength??1));
   }
   if(!inGame||((e?.events?.at(-1)?.seq??0)<seen)){
     seen=0;index=0;shotCount=0;
     for(const b of pool){b.t=-1;b.object.visible=false;}
   }
   if(inGame){
     for(const event of e?.events||[]){
       if(event.seq<=seen)continue;
       seen=event.seq;
       if(!event.from||!event.position||!['encounter-shot','encounter-shot-hit'].includes(event.kind))continue;
       const from=V(event.from),toward=V(event.position),hit=event.kind==='encounter-shot-hit';
       if(!hit&&!event.aligned)toward.add(new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(event.seq%2?6.3:-6.3));
       const d=toward.clone().sub(from), n=d.length();
       if(n<.05)continue;
       const beam=pool[index++%pool.length];beam.t=time;beam.hit=hit;
       beam.object.position.copy(from).addScaledVector(d,.51);
       beam.object.quaternion.setFromUnitVectors(y,d.normalize());
       beam.object.scale.set(hit?.27:.18,n*.96,hit?.27:.18);
       beam.object.material.uniforms.uHit.value=+hit;shotCount++;
     }
   }
   visibleBeams=0;
   for(const b of pool){
     const age=time-b.t,life=customReduced?.20:.135;
     b.object.visible=inGame&&b.t>=0&&age<life;
     if(b.object.visible){b.object.material.uniforms.uFade.value=1-age/life;visibleBeams++;}
   }
 }
 function info(){let combatDrawables=0;root.traverseVisible(o=>{if(o.isMesh)combatDrawables++;});return {combatDrawables,
   combatEnemy:activeType,combatWarning:root.visible&&warning.visible,combatShotBeams:shotCount,combatVisibleBeams:visibleBeams,combatBeamPool:pool.length};}
 return {update,info};
}
