// Route-relative placement, world-space point sizes, shader-based brush opacity.
// All lanes are decorative; no route positions or player state are mutated.
export function createDust(T, container, route, settings={}){
  const origin=Number.isFinite(route.origin)?route.origin:0, end=route.length;
  const V=(v)=>v?.isVector3?v.clone():new T.Vector3(...v);
  const times=[0,1,2], x=[], shapes=[], tints=[], along=[];
  const seed=Number.isFinite(settings.seed)?settings.seed:15891;
  let a=(seed+Math.floor(origin*31))>>>0;
  const rand=()=>((a=(Math.imul(a,1664525)+1013904223)>>>0)/4294967296);
  const hues=[['#3685b0','#30b99d','#8495f2'],['#a84962','#ef886a','#744178'],['#777be8','#9da9ff','#656dbc']];
  const interval=Math.max(39,(end-origin)/220);
  for(let d=origin+25;d<end;d+=interval){
    const fr=route.sample(d), p=V(fr.position), right=V(fr.right||[1,0,0]), up=V(fr.up||[0,1,0]), f=V(fr.forward||[0,0,1]);
    const legIdx=route.legs?.findIndex(l=>d>=l.start&&d<=l.end);
    const palette=hues[(legIdx>=0?legIdx:Math.floor(3*(d-origin)/Math.max(1,end-origin)))%hues.length];
    for(const dep of times)for(const side of [-1,1]){
      const scale=[1,1.6,2.45][dep], k=rand();
      const lateral=side*((65+dep*49)+(rand()-.5)*36+23*Math.sin(d*.013+dep));
      // Raising and lowering the second stream produces an asymmetric painted corridor.
      const vertical=(side*.8+rand()-.5)*(10+dep*39)+(dep-1)*12+25*Math.sin(d*.011+side*1.7);
      p.clone().addScaledVector(right,lateral).addScaledVector(up,vertical).addScaledVector(f,(rand()-.5)*interval*.63).toArray(x,x.length);
      shapes.push((27+rand()*42)*scale,(9+rand()*24)*scale,side*(.12+rand()*.58)+Math.sin(d*.011)*.41,k);
      const c=new T.Color(palette[dep]); c.toArray(tints,tints.length);
      along.push(d);
    }
  }
  const source=new T.PlaneGeometry(2,2), geo=new T.InstancedBufferGeometry();
  geo.index=source.index.clone();
  for(const k of ['position','uv'])geo.setAttribute(k,source.getAttribute(k).clone());
  source.dispose();
  geo.setAttribute('centerW',new T.InstancedBufferAttribute(new Float32Array(x),3));
  geo.setAttribute('brush',new T.InstancedBufferAttribute(new Float32Array(shapes),4));
  geo.setAttribute('pigment',new T.InstancedBufferAttribute(new Float32Array(tints),3));
  geo.setAttribute('atRoute',new T.InstancedBufferAttribute(new Float32Array(along),1));
  geo.instanceCount=along.length;
  const mat=new T.ShaderMaterial({
    transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,toneMapped:false,
    uniforms:{uTime:{value:0},uDist:{value:origin},uOpacity:{value:.65},uScale:{value:1},uDensity:{value:1}},
    vertexShader:`
      attribute vec3 centerW,pigment;
      attribute vec4 brush;
      attribute float atRoute;
      varying vec2 localQ;
      varying vec3 ink;
      varying float mask,k;
      uniform float uDist,uScale,uDensity;
      void main(){
        float q=atRoute-uDist;
        mask=step(brush.w,uDensity)*smoothstep(-108.,-18.,q)*(1.-smoothstep(280.,570.,q));
        // Skip most of the resident bands before they consume a fragment.
        if(mask<.001){gl_Position=vec4(3.,3.,3.,1.);return;}
        vec4 p=modelViewMatrix*vec4(centerW,1.);
        mask*=smoothstep(17.,55.,-p.z);
        if(mask<.001){gl_Position=vec4(3.,3.,3.,1.);return;}
        localQ=uv*2.-1.;k=brush.w;ink=pigment;
        float s=sin(brush.z),c=cos(brush.z);
        p.xy+=mat2(c,-s,s,c)*(position.xy*brush.xy*uScale);
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader:`
      varying vec2 localQ;varying vec3 ink;varying float mask,k;
      uniform float uTime,uOpacity;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
      void main(){
        vec2 q=localQ;
        float shape=exp(-q.x*q.x*1.7-q.y*q.y*3.2);
        shape*=(1.-smoothstep(.43,1.,abs(q.x)))*(1.-smoothstep(.50,1.,abs(q.y)));
        if(shape<.006)discard;
        float n0=n(q*vec2(2.6,8.4)+vec2(k*65.,k*47.)+vec2(uTime*.045,0.));
        float n1=n(q*vec2(5.5,26.)+vec2(k*34.+uTime*.11,n0*3.));
        float fine=n(q*vec2(7.,75.)+vec2(k*83.,n0*2.7));
        float ribbons=smoothstep(.14,.83,.49*n0+.32*n1+.19*fine);
        float alpha=(.13*ribbons+.025)*shape*mask*uOpacity;
        if(alpha<.002)discard;
        gl_FragColor=vec4(pow(ink,vec3(.66))*(.58+1.19*n0),alpha);
      }`
  });
  const cloud=new T.Mesh(geo,mat);cloud.frustumCulled=false;cloud.renderOrder=-2;container.add(cloud);
  function update(state,camera,clock,config=settings){
    const n=k=>Number.isFinite(k)?k:1;
    const reduced=config.reducedEffects??config.reduced;
    cloud.visible=config.dust!==false&&config.dustOpacity!==0&&config.dustDensity!==0&&state.phase!=='orbit'&&state.phase!=='ready';
    mat.uniforms.uTime.value=reduced?0:Math.max(0,n(clock));
    mat.uniforms.uDist.value=Math.max(origin,state.distance??origin);
    mat.uniforms.uScale.value=Math.max(.3,Math.min(2.5,n(config.dustScale)));
    mat.uniforms.uDensity.value=Math.max(0,Math.min(1,n(config.dustDensity)*(reduced?.34:1)));
    mat.uniforms.uOpacity.value=.84*Math.max(0,Math.min(1.8,n(config.dustOpacity)))*(reduced?.47:1);
  }
  function info(){return {dustInstances:geo.instanceCount,dustDepths:times.length,dustDrawables:+cloud.visible,dustOrigin:origin};}
  function dispose(){container.remove(cloud);geo.dispose();mat.dispose();}
  return {update,info,dispose};
}
