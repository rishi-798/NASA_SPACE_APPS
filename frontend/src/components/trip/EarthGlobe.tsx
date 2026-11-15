import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { launchSites } from "../../data/tripCatalogue";

export function EarthGlobe({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect);
  const selected = useRef(selectedId);
  useEffect(() => { select.current = onSelect; selected.current = selectedId; }, [onSelect, selectedId]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setTimeout(() => setFailed(true), 0); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, .01, 100);
    const point = (lat: number, lon: number, r: number) => {
      const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
      return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b));
    };
    camera.position.copy(point(20, -55, 3.4));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 1.3; controls.maxDistance = 5;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sun = new THREE.Vector3(1.8, 0.45, 1.2).normalize();
    camera.lookAt(0, 0, 0);
    const light = new THREE.DirectionalLight(0xfff8ee, 3.2); light.position.copy(sun.clone().multiplyScalar(5)); scene.add(light);
    scene.add(new THREE.AmbientLight(0x0c1524, 0.28));
    const geometry = new THREE.SphereGeometry(1, 512, 384);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .88, metalness: 0 });
    const globe = new THREE.Group(); scene.add(globe);
    const earth = new THREE.Mesh(geometry, material); globe.add(earth);
    const localSun = { value: sun.clone() };
    const textures: THREE.Texture[] = [];
    let disposed = false;
    const loader = new THREE.TextureLoader();
    const tier = matchMedia("(max-width: 600px)").matches || renderer.capabilities.maxTextureSize < 8192 ? "2k" : "8k";
    const load = (name: string, color = false) => loader.loadAsync(`/earth/${tier}-${name}.jpg`).then(t => {
      if (disposed) { t.dispose(); return t; }
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      textures.push(t); return t;
    });
    const cloudOffset = { value: 0 };
    const cloudMat = new THREE.MeshPhongMaterial({ transparent:true, opacity:.38, depthWrite:false, color:0xffffff });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.015,384,256),cloudMat);globe.add(clouds);
    const atmosphereMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, side:THREE.FrontSide,
      uniforms: { sun:{value:sun} },
      vertexShader:`varying vec3 vW;void main(){vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 sun;varying vec3 vW;void main(){
        vec3 o=cameraPosition;vec3 d=normalize(vW-o);float b=dot(o,d);float outer=b*b-dot(o,o)+1.042*1.042;
        if(outer<0.)discard;float start=-b-sqrt(outer);float end=-b+sqrt(outer);
        float inner=b*b-dot(o,o)+1.;if(inner>=0.)end=min(end,-b-sqrt(inner));
        float stepSize=max(0.,end-start)/12.;float optical=0.;float illumination=0.;
        for(int i=0;i<12;i++){vec3 p=o+d*(start+(float(i)+.5)*stepSize);float density=exp(-max(0.,length(p)-1.)/.0013);
          float daylight=smoothstep(-.06,.15,dot(normalize(p),sun));optical+=density*stepSize;illumination+=density*stepSize*daylight;}
        float alpha=1.-exp(-optical*45.);float lit=illumination/max(optical,.00001);
        vec3 tint=mix(vec3(.035,.10,.24),vec3(.30,.55,1.),lit);
        gl_FragColor=vec4(tint,alpha*(.08+.92*lit));}` });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.042,96,64),atmosphereMat);scene.add(atmosphere);
    void Promise.all([load('daymap',true),load('nightmap',true),load('clouds'),load('normal'),load('specular'),loader.loadAsync('/earth/tutorial-topography.png')]).then(([day,nights,cloud,normal,spec,height])=>{
      if(disposed)return;
      height.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      height.generateMipmaps = true;
      material.map=day;material.normalMap=normal;material.normalScale.set(2.4,2.4);textures.push(height); material.displacementMap=height;material.displacementScale=.010;
      material.onBeforeCompile = shader => {
        shader.uniforms.oceanMask={value:spec};shader.uniforms.cityMap={value:nights};shader.uniforms.sunDirection={value:sun};shader.uniforms.localSun=localSun;shader.uniforms.cloudMask={value:cloud};shader.uniforms.cloudOffset=cloudOffset;shader.uniforms.topoMap={value:height};
        shader.vertexShader = shader.vertexShader.replace('#include <displacementmap_vertex>', `#include <displacementmap_vertex>
          #ifdef USE_DISPLACEMENTMAP
            vec2 dUvV = vec2(1.0 / 4096.0, 1.0 / 2048.0) * 1.0;
            float dE = texture2D(displacementMap, vDisplacementMapUv + vec2(dUvV.x, 0.0)).x - texture2D(displacementMap, vDisplacementMapUv - vec2(dUvV.x, 0.0)).x;
            float dN = texture2D(displacementMap, vDisplacementMapUv + vec2(0.0, dUvV.y)).x - texture2D(displacementMap, vDisplacementMapUv - vec2(0.0, dUvV.y)).x;
            vec3 tangent = normalize(vec3(-sin(vDisplacementMapUv.x * 6.2831853), 0.0, -cos(vDisplacementMapUv.x * 6.2831853)));
            vec3 bitangent = cross(objectNormal, tangent);
            vec3 displacedObjectNormal = normalize(objectNormal - (tangent * dE + bitangent * dN) * (displacementScale * 140.0));
            transformedNormal = normalMatrix * displacedObjectNormal;
          #endif`);
        shader.fragmentShader=
          'uniform sampler2D oceanMask;uniform sampler2D cityMap;uniform vec3 sunDirection;uniform vec3 localSun;uniform sampler2D cloudMask;uniform float cloudOffset;uniform sampler2D topoMap;\n' +
          'float earthHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n' +
          'float earthNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float a=earthHash(i),b=earthHash(i+vec2(1.0,0.0)),c=earthHash(i+vec2(0.0,1.0)),d=earthHash(i+vec2(1.0,1.0));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}\n' +
          'float earthFbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*earthNoise(p);p*=2.05;a*=0.5;}return v;}\n' +
          shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          float ocean=texture2D(oceanMask,vMapUv).r;
          float land=(1.0-ocean);
          float elevation=texture2D(topoMap,vMapUv).r;

          // Local tangent space for accurate directional mountain relief
          float lat=(vMapUv.y-.5)*3.14159265;float lon=(vMapUv.x-.5)*6.2831853;
          vec3 T=normalize(vec3(-sin(lon),0.0,-cos(lon)));
          vec3 N=normalize(vec3(cos(lat)*cos(lon),sin(lat),-cos(lat)*sin(lon)));
          vec3 B=cross(N,T);

          // Multi-scale procedural micro-detail for high-zoom clarity
          vec2 landMicroUv = vMapUv * vec2(3600.0, 1800.0);
          float landGrain = earthFbm(landMicroUv);
          float ridgeDetail = earthNoise(landMicroUv * 2.8);
          float microShade = (landGrain - 0.5) * 0.24 + (ridgeDetail - 0.5) * 0.14;
          diffuseColor.rgb = clamp(diffuseColor.rgb * (1.0 + microShade * land), 0.0, 1.0);

          // Coastal bathymetry: turquoise shallow shelf blending into deep royal sapphire
          float coastalShelf = smoothstep(0.01, 0.28, ocean) * (1.0 - smoothstep(0.10, 0.90, ocean));
          vec3 deepAbyss = vec3(0.014, 0.050, 0.165);
          vec3 turquoiseWater = vec3(0.038, 0.32, 0.46);
          vec3 naturalOcean = mix(deepAbyss, turquoiseWater, coastalShelf * 0.75);
          diffuseColor.rgb = mix(diffuseColor.rgb, naturalOcean, ocean * 0.82);

          // Calibrated directional mountain relief
          vec2 dUv=vec2(1.0 / 4096.0, 1.0 / 2048.0) * 1.5;
          float eR=texture2D(topoMap,vMapUv+vec2(dUv.x,0.0)).r;
          float eL=texture2D(topoMap,vMapUv-vec2(dUv.x,0.0)).r;
          float eU=texture2D(topoMap,vMapUv+vec2(0.0,dUv.y)).r;
          float eD=texture2D(topoMap,vMapUv-vec2(0.0,dUv.y)).r;
          vec2 slope=vec2(eR-eL,eU-eD)*32.0;

          vec2 tangentLight=vec2(dot(localSun,T),dot(localSun,B));
          float relief=clamp(dot(slope,tangentLight)*2.2,-0.40,0.60);
          float valleyAo=1.0-clamp(length(slope)*0.24,0.0,0.35);
          diffuseColor.rgb*=(1.0+relief*land)*(ocean+land*(0.76+0.24*valleyAo));

          // Physically accurate latitude-dependent snow line
          float absLat=abs(lat)/1.5707963;
          float snowThreshold=mix(0.72, 0.20, pow(absLat, 1.85));
          if(elevation>snowThreshold && land>0.4){
            float snow=smoothstep(snowThreshold, snowThreshold+0.10, elevation);
            diffuseColor.rgb=mix(diffuseColor.rgb, vec3(0.95,0.97,1.0), snow*0.85);
          }

          // Cloud shadow
          vec3 radial=N;
          float solarDot=dot(radial,localSun);
          float cloudDistance=-solarDot+sqrt(solarDot*solarDot+1.015*1.015-1.);
          vec3 cloudPoint=normalize(radial+localSun*cloudDistance);
          vec2 cloudUv=vec2(fract(atan(-cloudPoint.z,cloudPoint.x)/6.2831853+.5-cloudOffset),asin(cloudPoint.y)/3.14159265+.5);
          float cloudShadow=texture2D(cloudMask,cloudUv).g*smoothstep(.02,.15,solarDot);
          diffuseColor.rgb*=1.-cloudShadow*.32;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor=mix(clamp(0.92-elevation*0.35,0.62,0.96),.14,ocean);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor=ocean*0.06;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 worldNormal=normalize(inverseTransformDirection(normal,viewMatrix));
          float darkness=1.0-smoothstep(-0.24, 0.02, dot(worldNormal,sunDirection));
          vec3 city=texture2D(cityMap,vMapUv).rgb;
          float cityIntensity=max(city.r, max(city.g, city.b));
          float nOcean=texture2D(oceanMask,vMapUv).r;
          float landMask=clamp(1.0 - nOcean * 0.98, 0.0, 1.0);
          vec3 cityGlow=mix(city, vec3(1.0, 0.82, 0.52) * cityIntensity, 0.55);
          totalEmissiveRadiance += (cityGlow * 3.4 + vec3(1.0, 0.70, 0.32) * pow(cityIntensity, 2.0) * 2.2) * darkness * landMask;`);
      };
      material.needsUpdate=true;cloudMat.alphaMap=cloud;cloudMat.bumpMap=cloud;cloudMat.bumpScale=.001;
      cloudMat.displacementMap=cloud;cloudMat.displacementScale=.0003;cloudMat.needsUpdate=true;setReady(true);
    }).catch(()=>{if(!disposed)setFailed(true);});
    const pins = launchSites.map(site=>{
      const pinGroup = new THREE.Group();
      const pin=new THREE.Mesh(new THREE.SphereGeometry(.014,14,10),new THREE.MeshBasicMaterial({color:0xff9d54}));
      const ring=new THREE.Mesh(new THREE.RingGeometry(.020,.026,24),new THREE.MeshBasicMaterial({color:0x38bdf8,side:THREE.DoubleSide,transparent:true,opacity:0.85}));
      ring.lookAt(point(site.latitude,site.longitude,1.0));
      pinGroup.add(pin,ring);
      pinGroup.position.copy(point(site.latitude,site.longitude,1.042));
      pinGroup.userData.site=site;
      pin.userData.site=site;
      globe.add(pinGroup);return pinGroup;
    });
    const raycaster=new THREE.Raycaster();let down={x:0,y:0};
    const press=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
    const click=(e:PointerEvent)=>{
      if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
      const rect=renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
      const hit=raycaster.intersectObjects([earth,...pins])[0];
      if(hit?.object.userData.site)select.current(hit.object.userData.site.id);
    };
    renderer.domElement.addEventListener('pointerdown',press);renderer.domElement.addEventListener('pointerup',click);
    const resize=()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(host);resize();
    let previous:string|null|undefined=undefined;let target:THREE.Vector3|null=null;let last=performance.now();
    let interacting=false;
    const inverseRotation=new THREE.Quaternion();
    renderer.setAnimationLoop(()=>{
      const now=performance.now(),dt=Math.min((now-last)/1000,.1);last=now;
      // Illustrative cycle: one turn every two minutes, independent of mission date.
      if(!reduced && !interacting && !target)globe.rotation.y+=dt*Math.PI*2/120;
      globe.updateMatrixWorld(true);

      if(previous!==selected.current){previous=selected.current;const site=launchSites.find(s=>s.id===previous);if(site){target=point(site.latitude,site.longitude,Math.max(2.5,camera.position.length())).applyQuaternion(globe.quaternion);}}
      if(target){camera.position.lerp(target,reduced?1:.08);if(camera.position.distanceTo(target)<.002)target=null;}
      pins.forEach(p=>{p.scale.setScalar(p.userData.site.id===selected.current?1.6:1);});
      if(!reduced)clouds.rotation.y+=dt*.002;
      cloudOffset.value=clouds.rotation.y/(Math.PI*2);
      controls.update();
      light.position.copy(sun).multiplyScalar(5);
      localSun.value.copy(sun).applyQuaternion(inverseRotation.copy(globe.quaternion).invert());
      renderer.render(scene,camera);
    });
    const cancelFlight=()=>{target=null;interacting=true;};controls.addEventListener('start',cancelFlight);
    controls.addEventListener('end',()=>{interacting=false;});
    return()=>{disposed=true;renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',press);renderer.domElement.removeEventListener('pointerup',click);
      scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});
      textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
  }, []);
  return <div className="trip-earth-wrap"><div ref={root} className="trip-earth" aria-label="Earth globe. Drag to rotate, scroll to zoom, and click a launch pin." />
    {!ready && !failed && <p className="trip-globe-error" role="status">Loading Earth textures…</p>}
    {failed && <p className="trip-globe-error" role="status">Earth view unavailable. Choose a departure from the list.</p>}
    <p className="trip-globe-hint">Earth rotates through day and night (sped up). Drag to explore. Scroll to zoom. Select a launch pin. <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Textures: Solar System Scope</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p></div>;
}
