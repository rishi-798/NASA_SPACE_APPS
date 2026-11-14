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
    const sun = point(15, -35, 1).normalize();
    const light = new THREE.DirectionalLight(0xffffff, 2.7); light.position.copy(sun.clone().multiplyScalar(5)); scene.add(light);
    scene.add(new THREE.AmbientLight(0x8aa4c9, .45));
    const geometry = new THREE.SphereGeometry(1, 96, 64);
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 70, specular: new THREE.Color(.10,.10,.10) });
    const earth = new THREE.Mesh(geometry, material); scene.add(earth);
    const textures: THREE.Texture[] = [];
    let disposed = false;
    const loader = new THREE.TextureLoader();
    const tier = matchMedia("(max-width: 600px)").matches || renderer.capabilities.maxTextureSize < 8192 ? "2k" : "8k";
    const load = (name: string, color = false) => loader.loadAsync(`/earth/${tier === "8k" && name !== "daymap" ? "4k" : tier}-${name}.jpg`).then(t => {
      if (disposed) { t.dispose(); return t; }
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); textures.push(t); return t;
    });
    const nightMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { night: { value: null }, sun: { value: sun } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform sampler2D night; uniform vec3 sun; varying vec2 vUv; varying vec3 vN; void main(){float dark=1.-smoothstep(-.25,.12,dot(normalize(vN),sun));vec3 lights=texture2D(night,vUv).rgb;gl_FragColor=vec4(lights*dark*1.6,dark);}` });
    const night = new THREE.Mesh(new THREE.SphereGeometry(1.001,96,64),nightMat); scene.add(night);
    const cloudMat = new THREE.MeshPhongMaterial({ transparent:true, opacity:.75, depthWrite:false, color:0xffffff });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012,96,64),cloudMat);scene.add(clouds);
    const atmosphereMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.BackSide,
      uniforms: { sun:{value:sun} },
      vertexShader:`varying vec3 vN;varying vec3 vW;void main(){vN=normalize(mat3(modelMatrix)*normal);vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 sun;varying vec3 vN;varying vec3 vW;void main(){float rim=pow(1.-abs(dot(normalize(vN),normalize(cameraPosition-vW))),3.);float daylight=.25+.75*max(0.,dot(normalize(vN),sun));gl_FragColor=vec4(vec3(.12,.42,1.)*daylight,rim*.55);}` });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.045,96,64),atmosphereMat);scene.add(atmosphere);
    void Promise.all([load('daymap',true),load('nightmap',true),load('clouds'),load('normal'),load('specular')]).then(([day,nights,cloud,normal,spec])=>{
      if(disposed)return;
      material.map=day;material.normalMap=normal;material.normalScale.set(.25,.25);material.specularMap=spec;material.needsUpdate=true;
      nightMat.uniforms.night.value=nights;cloudMat.alphaMap=cloud;cloudMat.needsUpdate=true;setReady(true);
    }).catch(()=>{if(!disposed)setFailed(true);});
    const pins = launchSites.map(site=>{
      const pin=new THREE.Mesh(new THREE.SphereGeometry(.018,12,8),new THREE.MeshBasicMaterial({color:0xff8b52}));
      pin.position.copy(point(site.latitude,site.longitude,1.025));pin.userData.site=site;scene.add(pin);return pin;
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
    renderer.setAnimationLoop(()=>{
      const now=performance.now(),dt=Math.min((now-last)/1000,.1);last=now;
      if(previous!==selected.current){previous=selected.current;const site=launchSites.find(s=>s.id===previous);if(site){target=point(site.latitude,site.longitude,Math.max(2.5,camera.position.length()));}}
      if(target){camera.position.lerp(target,reduced?1:.08);if(camera.position.distanceTo(target)<.002)target=null;}
      pins.forEach(p=>{p.scale.setScalar(p.userData.site.id===selected.current?1.6:1);});
      if(!reduced)clouds.rotation.y+=dt*.002;
      controls.update();renderer.render(scene,camera);
    });
    const cancelFlight=()=>{target=null;};controls.addEventListener('start',cancelFlight);
    return()=>{disposed=true;renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',press);renderer.domElement.removeEventListener('pointerup',click);
      scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});
      textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
  }, []);
  return <div className="trip-earth-wrap"><div ref={root} className="trip-earth" aria-label="Earth globe. Drag to rotate, scroll to zoom, and click a launch pin." />
    {!ready && !failed && <p className="trip-globe-error" role="status">Loading Earth textures…</p>}
    {failed && <p className="trip-globe-error" role="status">Earth view unavailable. Choose a departure from the list.</p>}
    <p className="trip-globe-hint">Drag to rotate. Scroll to zoom. Select a launch pin. <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noreferrer">Textures: Solar System Scope</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p></div>;
}
