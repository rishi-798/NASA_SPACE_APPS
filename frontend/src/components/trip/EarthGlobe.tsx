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
    renderer.toneMappingExposure = 1.25;
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
    const sun = point(5, -5, 1).normalize();
    const light = new THREE.DirectionalLight(0xffffff, 3.0); light.position.copy(sun.clone().multiplyScalar(5)); scene.add(light);
    scene.add(new THREE.AmbientLight(0x8aa4c9, .035));
    const geometry = new THREE.SphereGeometry(1, 192, 128);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8, metalness: 0 });
    const globe = new THREE.Group(); scene.add(globe);
    const earth = new THREE.Mesh(geometry, material); globe.add(earth);
    const localSun = { value: sun.clone() };
    const textures: THREE.Texture[] = [];
    let disposed = false;
    const loader = new THREE.TextureLoader();
    const tier = matchMedia("(max-width: 600px)").matches || renderer.capabilities.maxTextureSize < 8192 ? "2k" : "8k";
    const load = (name: string, color = false) => loader.loadAsync(`/earth/${tier === "8k" && name !== "daymap" ? "4k" : tier}-${name}.jpg`).then(t => {
      if (disposed) { t.dispose(); return t; }
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); textures.push(t); return t;
    });
    const cloudOffset = { value: 0 };
    const cloudMat = new THREE.MeshPhongMaterial({ transparent:true, opacity:.88, depthWrite:false, color:0xffffff });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.0015,192,128),cloudMat);globe.add(clouds);
    const atmosphereMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, side:THREE.FrontSide,
      uniforms: { sun:{value:sun} },
      vertexShader:`varying vec3 vW;void main(){vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 sun;varying vec3 vW;void main(){
        vec3 o=cameraPosition;vec3 d=normalize(vW-o);float b=dot(o,d);float outer=b*b-dot(o,o)+1.012*1.012;
        if(outer<0.)discard;float start=-b-sqrt(outer);float end=-b+sqrt(outer);
        float inner=b*b-dot(o,o)+1.;if(inner>=0.)end=min(end,-b-sqrt(inner));
        float stepSize=max(0.,end-start)/12.;float optical=0.;float illumination=0.;
        for(int i=0;i<12;i++){vec3 p=o+d*(start+(float(i)+.5)*stepSize);float density=exp(-max(0.,length(p)-1.)/.0013);
          float daylight=smoothstep(-.06,.15,dot(normalize(p),sun));optical+=density*stepSize;illumination+=density*stepSize*daylight;}
        float alpha=1.-exp(-optical*45.);float lit=illumination/max(optical,.00001);
        vec3 tint=mix(vec3(.035,.10,.24),vec3(.30,.55,1.),lit);
        gl_FragColor=vec4(tint,alpha*(.08+.92*lit));}` });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.012,96,64),atmosphereMat);scene.add(atmosphere);
    void Promise.all([load('daymap',true),load('nightmap',true),load('clouds'),load('normal'),load('specular'),loader.loadAsync('/earth/tutorial-topography.png')]).then(([day,nights,cloud,normal,spec,height])=>{
      if(disposed)return;
      material.map=day;material.normalMap=normal;material.normalScale.set(.25,.25);textures.push(height); material.displacementMap=height;material.displacementScale=.0014;
      material.onBeforeCompile = shader => {
        shader.uniforms.oceanMask={value:spec};shader.uniforms.cityMap={value:nights};shader.uniforms.sunDirection={value:sun};shader.uniforms.localSun=localSun;shader.uniforms.cloudMask={value:cloud};shader.uniforms.cloudOffset=cloudOffset;
        shader.fragmentShader='uniform sampler2D oceanMask;uniform sampler2D cityMap;uniform vec3 sunDirection;uniform vec3 localSun;uniform sampler2D cloudMask;uniform float cloudOffset;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          float ocean=texture2D(oceanMask,vMapUv).r;
          float grey=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(grey)*vec3(.70,.85,1.),ocean*.70);
          float lat=(vMapUv.y-.5)*3.14159265;float lon=(vMapUv.x-.5)*6.2831853;
          vec3 radial=vec3(cos(lat)*cos(lon),sin(lat),-cos(lat)*sin(lon));
          float solarDot=dot(radial,localSun);
          float cloudDistance=-solarDot+sqrt(solarDot*solarDot+1.0015*1.0015-1.);
          vec3 cloudPoint=normalize(radial+localSun*cloudDistance);
          vec2 cloudUv=vec2(fract(atan(-cloudPoint.z,cloudPoint.x)/6.2831853+.5-cloudOffset),asin(cloudPoint.y)/3.14159265+.5);
          float cloudShadow=texture2D(cloudMask,cloudUv).g*smoothstep(.02,.15,solarDot);
          diffuseColor.rgb*=1.-cloudShadow*.32;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor=mix(.85,.22,ocean);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 worldNormal=normalize(inverseTransformDirection(normal,viewMatrix));
          float darkness=1.-smoothstep(-.22,-.035,dot(worldNormal,sunDirection));
          vec3 city=texture2D(cityMap,vMapUv).rgb;
          totalEmissiveRadiance+=vec3(1.,.67,.36)*dot(city,vec3(.2126,.7152,.0722))*darkness*1.8;`);
      };
      material.needsUpdate=true;cloudMat.alphaMap=cloud;cloudMat.bumpMap=cloud;cloudMat.bumpScale=.001;
      cloudMat.displacementMap=cloud;cloudMat.displacementScale=.0003;cloudMat.needsUpdate=true;setReady(true);
    }).catch(()=>{if(!disposed)setFailed(true);});
    const pins = launchSites.map(site=>{
      const pin=new THREE.Mesh(new THREE.SphereGeometry(.018,12,8),new THREE.MeshBasicMaterial({color:0xff8b52}));
      pin.position.copy(point(site.latitude,site.longitude,1.025));pin.userData.site=site;globe.add(pin);return pin;
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
      localSun.value.copy(sun).applyQuaternion(inverseRotation.copy(globe.quaternion).invert());
      if(previous!==selected.current){previous=selected.current;const site=launchSites.find(s=>s.id===previous);if(site){target=point(site.latitude,site.longitude,Math.max(2.5,camera.position.length())).applyQuaternion(globe.quaternion);}}
      if(target){camera.position.lerp(target,reduced?1:.08);if(camera.position.distanceTo(target)<.002)target=null;}
      pins.forEach(p=>{p.scale.setScalar(p.userData.site.id===selected.current?1.6:1);});
      if(!reduced)clouds.rotation.y+=dt*.002;
      cloudOffset.value=clouds.rotation.y/(Math.PI*2);
      controls.update();renderer.render(scene,camera);
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
