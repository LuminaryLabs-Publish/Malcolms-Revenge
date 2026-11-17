// Decorative geometry only. Placement stays outside the ship's scoring corridor.
export function createScenery(T,root,route,config={}){
 const seed=String(config.seed??'starline'),origin=route.origin??0, epoch=route.epoch??0;
 let value=(Math.floor(origin)+1)>>>0;for(const ch of seed)value=(Math.imul(value^ch.charCodeAt(0),16777619))>>>0;
 const rand=()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/4294967296);
 const tint=['#375885','#6b3a57','#555394'].map(v=>new T.Color(v));
 const count=Math.min(192,108+epoch*10), obj=new T.Object3D();
 const detail=config.rockDetail??1,geo=new T.IcosahedronGeometry(1,detail);
 if(detail>1){const points=geo.attributes.position;for(let i=0;i<points.count;i++){const x=points.getX(i),y=points.getY(i),z=points.getZ(i),r=1+.17*Math.sin(x*9+y*5)*Math.sin(y*11-z*7)+.09*Math.cos(z*13+x*11);points.setXYZ(i,x*r,y*r,z*r);}geo.computeVertexNormals();}
 const rock=new T.ShaderMaterial({uniforms:{tick:{value:0},tone:{value:.82},drift:{value:0}},vertexShader:`
  varying vec3 norm,local; varying vec3 colorV; varying float depth; uniform float tick,drift;
  void main(){local=position;norm=normalize(mat3(modelViewMatrix*instanceMatrix)*normal);colorV=instanceColor;vec4 wp=instanceMatrix*vec4(position,1.);float day=instanceMatrix[3].z*.015+tick*.22;wp.xyz+=vec3(sin(day+1.8),cos(day)*.8,sin(day+.6)*1.8)*drift;vec4 p=modelViewMatrix*wp;depth=-p.z;gl_Position=projectionMatrix*p;}
 `,fragmentShader:`
  varying vec3 norm,local;varying vec3 colorV;varying float depth;uniform float tick,tone;
  void main(){float rim=pow(1.-abs(normalize(norm).z),4.);float key=max(0.,dot(normalize(norm),normalize(vec3(-.77,.51,.51))));float strata=abs(sin(local.x*41.+local.z*15.)*sin(local.y*27.+local.x*31.));float haze=smoothstep(240.,1150.,depth);
  vec3 ink=mix(colorV*(.32+key*.82)+rim*vec3(.25,.46,.55)*.26,vec3(.017,.025,.050),haze*.74);
  gl_FragColor=vec4(ink*(.87+strata*.19)*tone,1.);}
 `});
 const asteroids=new T.InstancedMesh(geo,rock,count);asteroids.frustumCulled=false;root.add(asteroids);
 for(let i=0;i<count;i++){
  const u=(i+.18+rand()*.62)/count,d=origin+(route.length-origin)*u, f=route.sample(d);
  const leg=Math.max(0,route.legs.findIndex(l=>d>=l.start&&d<=l.end));
  const pos=new T.Vector3(...f.position),r=new T.Vector3(...f.right),up=new T.Vector3(...f.up);
  const side=i%2?1:-1;
  pos.addScaledVector(r,side*(66+Math.pow(rand(),1.8)*202)).addScaledVector(up,(rand()-.51)*161);
  const size=2.2+Math.pow(rand(),2.9)*16;
  obj.position.copy(pos);obj.rotation.set(rand()*6,rand()*6,rand()*6);obj.scale.set(size*(.9+rand()*.7),size*(.52+rand()*.8),size*(.82+rand()*.81));obj.updateMatrix();
  asteroids.setMatrixAt(i,obj.matrix);asteroids.setColorAt(i,tint[leg%tint.length].clone().multiplyScalar(.78+rand()*.8));
 }
 asteroids.instanceMatrix.needsUpdate=true;asteroids.instanceColor.needsUpdate=true;
 return {update(state,clock,options){asteroids.visible=state.phase!=='orbit'&&(options.scenery??true);rock.uniforms.tick.value=clock;rock.uniforms.drift.value=options.rockDrift??0;rock.uniforms.tone.value=options.rockContrast??.82;},info(){return {proceduralObjects:count,procedureEpoch:epoch,sceneryVisible:asteroids.visible};}};
}
