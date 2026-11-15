import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CSS2DObject,CSS2DRenderer} from 'three/addons/renderers/CSS2DRenderer.js';
import type {TransferResult} from '../../lib/transfer';
import {advanceTransferCursor,transferFrame} from '../../lib/transferPlayback';
import {createAtmosphere,createSpacecraftMesh,createStarPoints,createSunGlow,disposeObjects,fitToRadius} from './spaceVisuals';

const SCALE=1/100000;
const point=(v:number[])=>new THREE.Vector3(v[0],v[2],-v[1]).multiplyScalar(SCALE);
const P=new THREE.Matrix4().set(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1);
function orientation(values:number[]) {
  const r=new THREE.Matrix4().set(values[0]!,values[1]!,values[2]!,0,values[3]!,values[4]!,values[5]!,0,values[6]!,values[7]!,values[8]!,0,0,0,0,1);
  return new THREE.Quaternion().setFromRotationMatrix(P.clone().multiply(r).multiply(P.clone().invert()));
}
type Focus='rocket'|'system'|'earth'|'moon';

/** Original mission visuals, animated exclusively by the calculated transfer's shared clock. */
export function MissionFlightAnimation({data}:{data:TransferResult}) {
  const host=useRef<HTMLDivElement>(null);
  const cursorRef=useRef(0);
  const [cursor,setCursor]=useState(0);
  const [playing,setPlaying]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const playingRef=useRef(playing);
  const focusRef=useRef<{mode:Focus;serial:number}>({mode:'rocket',serial:0});
  const [failed,setFailed]=useState(false);
  const [textureNotice,setTextureNotice]=useState(false);
  const last=data.samples.length-1;
  const sample=transferFrame(data,cursor);
  const atEnd=cursor>=last;
  const focus=(mode:Focus)=>{focusRef.current={mode,serial:focusRef.current.serial+1};};
  const play=()=>{
    if(atEnd){cursorRef.current=0;setCursor(0);playingRef.current=true;setPlaying(true);}
    else{playingRef.current=!playingRef.current;setPlaying(playingRef.current);}
  };
  const scrub=(value:number)=>{playingRef.current=false;setPlaying(false);cursorRef.current=value;setCursor(value);};

  useEffect(()=>{
    if(!host.current)return;
    const element=host.current;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
    catch{queueMicrotask(()=>setFailed(true));return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    element.appendChild(renderer.domElement);
    const labels=new CSS2DRenderer();labels.domElement.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';element.appendChild(labels.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#020307');scene.add(createStarPoints());
    const camera=new THREE.PerspectiveCamera(42,1,.0005,1000);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.06;controls.minDistance=.025;controls.maxDistance=30;
    const earthRadius=data.constants.earth_radius_km*SCALE,moonRadius=data.constants.moon_radius_km*SCALE;
    const earth=new THREE.Group();earth.name='NASA Earth with clouds';earth.add(createAtmosphere(earthRadius*1.025));scene.add(earth);
    const earthFallback=new THREE.Mesh(new THREE.SphereGeometry(earthRadius,64,48),new THREE.MeshStandardMaterial({color:'#6794b9',roughness:.9}));earth.add(earthFallback);
    const moon=new THREE.Mesh(new THREE.SphereGeometry(moonRadius,64,48),new THREE.MeshStandardMaterial({color:'#c9c9c2',roughness:.94}));scene.add(moon);
    scene.add(new THREE.HemisphereLight('#bacde8','#0c1321',.55));
    const sunlight=new THREE.DirectionalLight('#fff1d8',3.2);scene.add(sunlight);
    const sun=new THREE.Mesh(new THREE.SphereGeometry(.195,32,24),new THREE.MeshBasicMaterial({color:'#fff6df',toneMapped:false}));
    const glow=createSunGlow();glow.scale.set(2.5,2.5,1);scene.add(sun,glow);
    let cancelled=false;
    const textures=new THREE.TextureLoader();
    const load=(url:string,apply:(texture:THREE.Texture)=>void)=>textures.load(url,texture=>{
      if(cancelled){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());apply(texture);
    },undefined,()=>{if(!cancelled)setTextureNotice(true);});
    load('/deep-star-map-4k.jpg',texture=>{
      const sky=new THREE.Mesh(new THREE.SphereGeometry(220,64,48),new THREE.MeshBasicMaterial({map:texture,side:THREE.BackSide,depthWrite:false,toneMapped:false}));sky.renderOrder=-10;scene.add(sky);
    });
    load('/moon-lroc-2k.jpg',texture=>{moon.material.map=texture;moon.material.color.set('white');moon.material.needsUpdate=true;});
    load('/earth/2k-daymap.jpg',texture=>{earthFallback.material.map=texture;earthFallback.material.color.set('white');earthFallback.material.needsUpdate=true;});
    new GLTFLoader().load('/nasa-earth-clouds.glb',asset=>{
      if(cancelled){disposeObjects(asset.scene);return;}fitToRadius(asset.scene,earthRadius);earth.add(asset.scene);earthFallback.visible=false;
    },undefined,()=>{if(!cancelled)setTextureNotice(true);});
    const spacecraft=createSpacecraftMesh();spacecraft.scale.setScalar(.12);
    const flame=spacecraft.userData.flame as THREE.Object3D|undefined;if(flame)flame.visible=false;
    scene.add(spacecraft);
    const path=new THREE.Line(new THREE.BufferGeometry().setFromPoints(data.samples.map(s=>point(s.spacecraft_position_km))),new THREE.LineBasicMaterial({color:'#ffa46c',transparent:true,opacity:.8}));scene.add(path);
    const moonTrack=new THREE.Line(new THREE.BufferGeometry().setFromPoints(data.samples.map(s=>point(s.moon_position_km))),new THREE.LineDashedMaterial({color:'#66a9b8',dashSize:.035,gapSize:.025,transparent:true,opacity:.6}));moonTrack.computeLineDistances();scene.add(moonTrack);
    const target=new THREE.Mesh(new THREE.SphereGeometry(.008,12,8),new THREE.MeshBasicMaterial({color:'#a2ecd3'}));target.position.copy(point(data.arrival_target.position_km));scene.add(target);
    const ghost=new THREE.Mesh(moon.geometry,new THREE.MeshBasicMaterial({color:'#86d1dc',wireframe:true,transparent:true,opacity:.25}));ghost.position.copy(point(data.samples[last]!.moon_position_km));scene.add(ghost);
    const label=(text:string)=>{const node=document.createElement('span');node.className='transfer-body-label';node.textContent=text;const obj=new CSS2DObject(node);obj.center.set(.5,1.5);scene.add(obj);return obj;};
    const earthLabel=label('Earth'),moonLabel=label('Moon'),ghostLabel=label('Moon at arrival');
    earthLabel.position.set(0,earthRadius+.025,0);
    const bounds=new THREE.Box3().setFromPoints([new THREE.Vector3(),...data.samples.flatMap(s=>[point(s.moon_position_km),point(s.spacecraft_position_km)])]).getBoundingSphere(new THREE.Sphere());
    const fitSystem=()=>{
      const half=Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*Math.min(1,camera.aspect));
      camera.position.copy(bounds.center).add(new THREE.Vector3(.3,.7,1.1).normalize().multiplyScalar((bounds.radius+.12)/Math.sin(half)*1.2));controls.target.copy(bounds.center);
    };
    let previousSerial=-1,previousTime=performance.now(),lastPublish=0;
    const previousTarget=new THREE.Vector3();
    const resize=()=>{const w=element.clientWidth,h=element.clientHeight;renderer.setSize(w,h);labels.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();if(focusRef.current.mode==='system')fitSystem();};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    let animation=0;
    const frame=(now:number)=>{
      if(cancelled)return;
      const dt=(now-previousTime)/1000;previousTime=now;
      if(playingRef.current){
        cursorRef.current=advanceTransferCursor(cursorRef.current,dt,data.samples.length);
        if(cursorRef.current>=last){playingRef.current=false;setPlaying(false);}
      }
      const active=transferFrame(data,cursorRef.current);
      const i=Math.floor(cursorRef.current),fraction=cursorRef.current-i;
      const a=data.samples[i]!,b=data.samples[Math.min(last,i+1)]!;
      spacecraft.position.copy(point(active.spacecraft_position_km));moon.position.copy(point(active.moon_position_km));
      earth.quaternion.copy(orientation(a.earth_orientation).slerp(orientation(b.earth_orientation),fraction));
      moon.quaternion.copy(orientation(a.moon_orientation).slerp(orientation(b.moon_orientation),fraction));
      const velocity=point(active.spacecraft_velocity_km_s).normalize();spacecraft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),velocity);
      const sunDirection=point(active.sun_direction).normalize();sunlight.position.copy(sunDirection.clone().multiplyScalar(20));sun.position.copy(sunDirection.multiplyScalar(42));glow.position.copy(sun.position);
      moonLabel.position.copy(moon.position).y+=moonRadius+.025;ghostLabel.position.copy(ghost.position).y+=moonRadius+.025;ghostLabel.visible=moon.position.distanceTo(ghost.position)>.15;
      const {mode,serial}=focusRef.current;
      const focusTarget=mode==='rocket'?spacecraft.position:mode==='moon'?moon.position:mode==='earth'?earth.position:bounds.center;
      if(serial!==previousSerial){
        if(mode==='system')fitSystem();
        else{
          const offset=mode==='rocket'?spacecraft.position.clone().normalize().multiplyScalar(.24).addScaledVector(velocity,-.17).add(new THREE.Vector3(0,.09,0)):mode==='earth'?new THREE.Vector3(.12,.12,.25):new THREE.Vector3(.07,.06,.14);
          camera.position.copy(focusTarget).add(offset);controls.target.copy(focusTarget);
        }
        previousSerial=serial;
      }else if(mode==='rocket'||mode==='moon'){
        const delta=focusTarget.clone().sub(previousTarget);camera.position.add(delta);controls.target.add(delta);
      }
      previousTarget.copy(focusTarget);controls.update();renderer.render(scene,camera);labels.render(scene,camera);
      if(now-lastPublish>=80||cursorRef.current>=last){setCursor(cursorRef.current);lastPublish=now;}
      animation=requestAnimationFrame(frame);
    };
    animation=requestAnimationFrame(frame);
    return()=>{
      cancelled=true;cancelAnimationFrame(animation);observer.disconnect();controls.dispose();
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),maps=new Set<THREE.Texture>();
      scene.traverse(obj=>{if(obj instanceof THREE.Mesh||obj instanceof THREE.Line||obj instanceof THREE.Points||obj instanceof THREE.Sprite){if('geometry' in obj)geometries.add(obj.geometry);for(const material of Array.isArray(obj.material)?obj.material:[obj.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)maps.add(value);}}});
      maps.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();renderer.domElement.remove();labels.domElement.remove();
    };
  },[data,last]);

  const distance=Math.hypot(...sample.moon_position_km);
  return <section className="trip-space-scene trip-space-scene-mission calculated-mission-animation" aria-label="Calculated mission animation">
    <div ref={host} className="trip-space-canvas" aria-label="Rocket animation driven by calculated spacecraft and SPICE Moon states" />
    <div className="trip-overview-labels"><span>Earth → lunar arrival reference</span><span>Preliminary two-body transfer</span></div>
    <div className="trip-space-data"><span>EARTH–MOON · {distance.toLocaleString(undefined,{maximumFractionDigits:0})} km</span><span>COAST · NO CAPTURE OR DESCENT</span></div>
    {failed&&<p className="trip-scene-message" role="alert">3D rendering is unavailable. Calculated metrics and dates remain available in the mission panel.</p>}
    <div className="mission-animation-controls">
      <div role="group" aria-label="Mission camera"><button type="button" onClick={()=>focus('rocket')}>Follow rocket</button><button type="button" onClick={()=>focus('system')}>Whole journey</button><button type="button" onClick={()=>focus('earth')}>Earth</button><button type="button" onClick={()=>focus('moon')}>Moon</button></div>
      <div className="mission-animation-timeline"><button type="button" onClick={play}>{atEnd?'Replay flight':playing?'Pause flight':'Play flight'}</button><input type="range" aria-label="Mission flight time" min={0} max={last} step={.01} value={cursor} onChange={e=>scrub(Number(e.target.value))}/></div>
      <output aria-label="Mission flight UTC">{sample.time.slice(0,19).replace('T',' ')} UTC · +{(sample.elapsed_seconds/3600).toFixed(1)} h</output>
      <p>One flight clock drives the rocket, Moon and sunlight. Body sizes and distances use a linear scale; the spacecraft and target markers are enlarged. Sun is a direction marker. The spacecraft is an illustrative marker, not a vehicle simulation. Coast ends at the calculated reference point. Drag to orbit; scroll to zoom. {textureNotice&&'A visual asset is unavailable; calculated positions are unchanged.'}</p>
    </div>
  </section>;
}
