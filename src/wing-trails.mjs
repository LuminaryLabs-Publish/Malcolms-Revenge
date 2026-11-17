// World-space shader ribbons, reconstructed from the actual ship tips.
export function createWingTrails(T,scene,options={}){
 const N=38, total=2*2*N, array=new Float32Array(total*3), life=new Float32Array(total), vSide=new Float32Array(total), sides=new Float32Array(total);
 const idx=[];
 for(let a=0;a<2;a++)for(let i=0;i<N;i++){
  const j=a*N*2+i*2;life[j]=life[j+1]=i/(N-1);vSide[j]=0;vSide[j+1]=1;sides[j]=sides[j+1]=a;
  if(i<N-1)idx.push(j,j+1,j+2,j+1,j+3,j+2);
 }
 const geo=new T.BufferGeometry();geo.setIndex(idx);
 geo.setAttribute('position',new T.BufferAttribute(array,3).setUsage(T.DynamicDrawUsage));
 geo.setAttribute('life',new T.BufferAttribute(life,1));geo.setAttribute('edge',new T.BufferAttribute(vSide,1));geo.setAttribute('wing',new T.BufferAttribute(sides,1));
 const mat=new T.ShaderMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{gain:{value:0},heat:{value:0}},
  vertexShader:`attribute float life,edge,wing; varying vec3 f; void main(){f=vec3(life,edge,wing);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec3 f;uniform float gain,heat;void main(){float stripe=pow(max(0.,1.-abs(f.y-.5)*2.),1.7);float tail=pow(f.x,2.0);vec3 c=mix(vec3(.26,.90,1.),vec3(.47,.63,1.),f.z);c=mix(c,vec3(1.,.72,.30),heat);gl_FragColor=vec4(c,stripe*tail*gain);}`});
 const mesh=new T.Mesh(geo,mat);mesh.frustumCulled=false;mesh.renderOrder=14;scene.add(mesh);
 const history=[[],[]],tips=[new T.Vector3(),new T.Vector3()],dir=new T.Vector3(),v=new T.Vector3(),across=new T.Vector3();let last=-1;
 function update(state,ship,camera,config){
  const minDistance=Number(config.trailCut??2.2);
  if(state.tick<last)for(const x of history)x.length=0;
  last=state.tick;mesh.visible=!!config.wingTrails&&state.phase!=='results';
  if(!mesh.visible)return;
  ship.updateMatrixWorld(true);
  const boosted=!!state.arcade?.boostActive, orbit=state.phase==='orbit', width=(config.wingWidth??.68)*(boosted?1.4:1);
  for(let i=0;i<2;i++){
   const h=history[i], tip=tips[i].set((i?1:-1)*4.24,.03,-2.8).applyMatrix4(ship.matrixWorld);
   if(!h.length||h.at(-1).distanceTo(tip)>=minDistance){h.push(tip.clone());if(h.length>(config.wingHeadOnly?29:N))h.shift();}
   const start=Math.max(0,N-h.length);
   for(let j=0;j<N;j++){
    const k=Math.max(0,j-start),p=h[k]??tip,prev=h[Math.max(0,k-1)]??p,next=h[Math.min(h.length-1,k+1)]??p;
    dir.subVectors(next,prev).normalize();v.subVectors(camera.position,p).normalize();across.crossVectors(dir,v).normalize();
    const a=(i*N*2+j*2)*3,w=width*(j>=start?Math.pow(j/(N-1),.52):0);
    v.copy(p).addScaledVector(across,-w).toArray(array,a);
    v.copy(p).addScaledVector(across,w).toArray(array,a+3);
   }
  }
  geo.attributes.position.needsUpdate=true;
  mat.uniforms.heat.value=boosted?.87:0;mat.uniforms.gain.value=(orbit?.20:boosted?.91:.57)*(config.reducedEffects?.27:1);
 }
 return {update,info:()=>({wingRibbonSegments:N,wingRibbons:+mesh.visible*2})};
}
