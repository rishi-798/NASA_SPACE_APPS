import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CSS2DObject,CSS2DRenderer} from 'three/addons/renderers/CSS2DRenderer.js';
import type {TransferResult} from '../../lib/transfer';
import {advanceTransferCursor,transferFrame,transferProgress,transferPlaybackClock,formatPlaybackTime,TRANSFER_PLAYBACK_SECONDS} from '../../lib/transferPlayback';
import {createAtmosphere,createStarPoints,createSunGlow,disposeObjects,fitToRadius,prepareRocketModel} from './spaceVisuals';

import {createThrusterPuffs} from './thrusterPuffs';

const SCALE=1/100000;
const point=(v:number[])=>new THREE.Vector3(v[0],v[2],-v[1]).multiplyScalar(SCALE);
const P=new THREE.Matrix4().set(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1);
function orientation(values:number[]) {
  const r=new THREE.Matrix4().set(values[0]!,values[1]!,values[2]!,0,values[3]!,values[4]!,values[5]!,0,values[6]!,values[7]!,values[8]!,0,0,0,0,1);
  return new THREE.Quaternion().setFromRotationMatrix(P.clone().multiply(r).multiply(P.clone().invert()));
}
type Focus='cinematic'|'rocket'|'system'|'earth'|'moon';

/** Original mission visuals, animated exclusively by the calculated transfer's shared clock. */
export function MissionFlightAnimation({data,modelUrl,modelName,modelCredit}:{data:TransferResult;modelUrl?:string;modelName?:string;modelCredit?:string}) {
  const host=useRef<HTMLDivElement>(null);
  const controlsHost=useRef<HTMLDivElement>(null);
  const cursorRef=useRef(0);
  const [cursor,setCursor]=useState(0);
  const [playing,setPlaying]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const playingRef=useRef(playing);
  const [speed,setSpeed]=useState(1);
  const speedRef=useRef(1);
  const [puffs,setPuffs]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const puffsRef=useRef(puffs);
  const [modelStatus,setModelStatus]=useState<'loading'|'ready'|'unavailable'>(modelUrl?'loading':'unavailable');
  const focusRef=useRef<{mode:Focus;serial:number}>({mode:'cinematic',serial:0});
  const [cameraMode,setCameraMode]=useState<Focus>('cinematic');
  const [failed,setFailed]=useState(false);
  const [textureNotice,setTextureNotice]=useState(false);
  const last=data.samples.length-1;
  const sample=transferFrame(data,cursor);
  const atEnd=cursor>=last;
  const presentation=transferProgress(data,cursor);
  const clock=transferPlaybackClock(cursor,data.samples.length,speed);
  const focus=(mode:Focus)=>{focusRef.current={mode,serial:focusRef.current.serial+1};setCameraMode(mode);};
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
    const spacecraft=new THREE.Group();spacecraft.scale.setScalar(.06);scene.add(spacecraft);
    const decoder=new DRACOLoader().setDecoderPath('/draco/');
    if(modelUrl){
      new GLTFLoader().setDRACOLoader(decoder).load(modelUrl,asset=>{
        if(cancelled){disposeObjects(asset.scene);return;}
        try{prepareRocketModel(asset.scene,modelUrl,.45);spacecraft.add(asset.scene);setModelStatus('ready');}
        catch{disposeObjects(asset.scene);setModelStatus('unavailable');}
      },undefined,()=>{if(!cancelled)setModelStatus('unavailable');});
    }
    const gas=createThrusterPuffs();spacecraft.add(gas.points);
    const path=new THREE.Line(new THREE.BufferGeometry().setFromPoints(data.samples.map(s=>point(s.spacecraft_position_km))),new THREE.LineBasicMaterial({color:'#d6b298',transparent:true,opacity:.23}));scene.add(path);
    const travelledGeometry=path.geometry.clone();
    const travelled=new THREE.Line(travelledGeometry,new THREE.LineBasicMaterial({color:'#ffb87b',transparent:true,opacity:.95}));
    travelledGeometry.setDrawRange(0,0);scene.add(travelled);
    let previousHead=-1;
    const moonTrack=new THREE.Line(new THREE.BufferGeometry().setFromPoints(data.samples.map(s=>point(s.moon_position_km))),new THREE.LineDashedMaterial({color:'#66a9b8',dashSize:.035,gapSize:.025,transparent:true,opacity:.6}));moonTrack.computeLineDistances();scene.add(moonTrack);
    const target=new THREE.Mesh(new THREE.SphereGeometry(.0018,12,8),new THREE.MeshBasicMaterial({color:'#a2ecd3'}));target.position.copy(point(data.arrival_target.position_km));scene.add(target);
    const ghost=new THREE.Mesh(moon.geometry,new THREE.MeshBasicMaterial({color:'#86d1dc',wireframe:true,transparent:true,opacity:.25}));ghost.position.copy(point(data.samples[last]!.moon_position_km));scene.add(ghost);
    const label=(text:string)=>{const node=document.createElement('span');node.className='transfer-body-label';node.textContent=text;const obj=new CSS2DObject(node);obj.center.set(.5,1.5);scene.add(obj);return obj;};
    const spacecraftLabel=label(modelName??'Selected vehicle');
    const earthLabel=label('Earth'),moonLabel=label('Moon'),ghostLabel=label('Moon at arrival');
    earthLabel.position.set(0,earthRadius+.025,0);
    const bounds=new THREE.Box3().setFromPoints([new THREE.Vector3(),...data.samples.flatMap(s=>[point(s.moon_position_km),point(s.spacecraft_position_km)])]).getBoundingSphere(new THREE.Sphere());
    const fitSystem=()=>{
      const half=Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*Math.min(1,camera.aspect));
      camera.position.copy(bounds.center).add(new THREE.Vector3(.3,.7,1.1).normalize().multiplyScalar((bounds.radius+.12)/Math.sin(half)*1.2));controls.target.copy(bounds.center);
    };
    let previousSerial=-1,lastPublish=0;
    let previousTime:number|null=null;
    const previousTarget=new THREE.Vector3();
    let manualCamera=false;
    const cinematicOffset=new THREE.Vector3(),cinematicTarget=new THREE.Vector3();
    // A user gesture releases the directed camera while retaining playback.
    controls.addEventListener('start',()=>{manualCamera=true;});
    const resize=()=>{element.parentElement?.style.setProperty('--flight-controls-height',`${controlsHost.current?.getBoundingClientRect().height??205}px`);const w=element.clientWidth,h=element.clientHeight;renderer.setSize(w,h);labels.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();if(focusRef.current.mode==='system')fitSystem();};
    const observer=new ResizeObserver(resize);observer.observe(element);if(controlsHost.current)observer.observe(controlsHost.current);resize();
    let animation=0;
    const frame=(now:number)=>{
      if(cancelled)return;
      const dt=previousTime===null?0:(now-previousTime)/1000;previousTime=now;
      if(playingRef.current){
        cursorRef.current=advanceTransferCursor(cursorRef.current,dt,data.samples.length,TRANSFER_PLAYBACK_SECONDS/speedRef.current);
        if(cursorRef.current>=last){playingRef.current=false;setPlaying(false);}
      }
      const active=transferFrame(data,cursorRef.current);
      const progress=cursorRef.current/last;
      const approach=THREE.MathUtils.smoothstep(progress,.72,1);
      const i=Math.floor(cursorRef.current),fraction=cursorRef.current-i;
      const a=data.samples[i]!,b=data.samples[Math.min(last,i+1)]!;
      spacecraft.position.copy(point(active.spacecraft_position_km));moon.position.copy(point(active.moon_position_km));
      target.visible=spacecraft.position.distanceTo(target.position)>.02;
      spacecraft.scale.setScalar(THREE.MathUtils.lerp(.06,.018,approach));
      gas.update(transferPlaybackClock(cursorRef.current,data.samples.length).elapsed,puffsRef.current&&playingRef.current&&progress<1&&spacecraft.children.length>1,spacecraft.scale.x);
      spacecraftLabel.position.copy(spacecraft.position).y+=THREE.MathUtils.lerp(.025,.009,approach);
      const travelledPositions=travelledGeometry.getAttribute('position') as THREE.BufferAttribute;
      if(previousHead>=0){const original=point(data.samples[previousHead]!.spacecraft_position_km);travelledPositions.setXYZ(previousHead,original.x,original.y,original.z);}
      previousHead=Math.min(last,i+1);
      travelledPositions.setXYZ(previousHead,spacecraft.position.x,spacecraft.position.y,spacecraft.position.z);
      travelledPositions.needsUpdate=true;travelledGeometry.setDrawRange(0,Math.min(data.samples.length,i+2));
      travelledGeometry.computeBoundingSphere();
      earth.quaternion.copy(orientation(a.earth_orientation).slerp(orientation(b.earth_orientation),fraction));
      moon.quaternion.copy(orientation(a.moon_orientation).slerp(orientation(b.moon_orientation),fraction));
      const velocity=point(active.spacecraft_velocity_km_s).normalize();spacecraft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),velocity);
      const sunDirection=point(active.sun_direction).normalize();sunlight.position.copy(sunDirection.clone().multiplyScalar(20));sun.position.copy(sunDirection.multiplyScalar(42));glow.position.copy(sun.position);
      moonLabel.position.copy(moon.position).y+=moonRadius+.025;ghostLabel.position.copy(ghost.position).y+=moonRadius+.025;ghostLabel.visible=moon.position.distanceTo(ghost.position)>.15;ghost.visible=ghostLabel.visible;
      const {mode,serial}=focusRef.current;
      cinematicTarget.copy(spacecraft.position).lerp(moon.position,approach*.48);
      const flightOffset=spacecraft.position.clone().normalize().multiplyScalar(.24).addScaledVector(velocity,-.17).add(new THREE.Vector3(0,.09,0));
      // Fit the approaching spacecraft and true-size Moon together, including narrow screens.
      const arrivalOffset=new THREE.Vector3(.05,.035,.075).multiplyScalar(Math.max(1,1/camera.aspect));
      cinematicOffset.copy(flightOffset).lerp(arrivalOffset,approach);
      const focusTarget=mode==='cinematic'&&!manualCamera?cinematicTarget:mode==='rocket'||mode==='cinematic'?spacecraft.position:mode==='moon'?moon.position:mode==='earth'?earth.position:bounds.center;
      if(serial!==previousSerial){
        manualCamera=false;
        if(mode==='system')fitSystem();
        else{
          const offset=mode==='cinematic'?cinematicOffset:mode==='rocket'?flightOffset:mode==='earth'?new THREE.Vector3(.12,.12,.25):arrivalOffset;
          camera.position.copy(focusTarget).add(offset);controls.target.copy(focusTarget);
        }
        previousSerial=serial;
      }else if(mode==='cinematic'&&!manualCamera){
        const delta=cinematicTarget.clone().sub(previousTarget);
        camera.position.add(delta);controls.target.add(delta);
        const ease=1-Math.exp(-Math.max(0,dt)*7);
        camera.position.lerp(cinematicTarget.clone().add(cinematicOffset),ease);
        controls.target.lerp(cinematicTarget,ease);
      }else if(mode==='rocket'||mode==='moon'||mode==='cinematic'){
        const delta=focusTarget.clone().sub(previousTarget);camera.position.add(delta);controls.target.add(delta);
      }
      previousTarget.copy(focusTarget);controls.update();renderer.render(scene,camera);labels.render(scene,camera);
      if(now-lastPublish>=80||cursorRef.current>=last){setCursor(cursorRef.current);lastPublish=now;}
      animation=requestAnimationFrame(frame);
    };
    animation=requestAnimationFrame(frame);
    return()=>{
      cancelled=true;cancelAnimationFrame(animation);observer.disconnect();controls.dispose();decoder.dispose();
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),maps=new Set<THREE.Texture>();
      scene.traverse(obj=>{if(obj instanceof THREE.Mesh||obj instanceof THREE.Line||obj instanceof THREE.Points||obj instanceof THREE.Sprite){if('geometry' in obj)geometries.add(obj.geometry);for(const material of Array.isArray(obj.material)?obj.material:[obj.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)maps.add(value);}}});
      maps.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();renderer.domElement.remove();labels.domElement.remove();
    };
  },[data,last,modelUrl,modelName]);

  const distance=Math.hypot(...sample.moon_position_km);
  return <section className="trip-space-scene trip-space-scene-mission calculated-mission-animation" aria-label="Calculated mission animation">
    <div ref={host} className="trip-space-canvas" aria-label="Rocket animation driven by calculated spacecraft and SPICE Moon states" />
    <div className="trip-overview-labels"><span>Earth → lunar arrival reference</span><span>Preliminary two-body transfer</span></div>
    <div className="trip-space-data"><span>EARTH–MOON · {distance.toLocaleString(undefined,{maximumFractionDigits:0})} km</span><span>{presentation.phase.toUpperCase()}</span><span>VEHICLE · {Math.hypot(...sample.spacecraft_velocity_km_s).toFixed(2)} km/s</span><span>TO MOON · {presentation.moonRangeKm.toLocaleString(undefined,{maximumFractionDigits:0})} km</span></div>
    {atEnd&&<div className="mission-arrival-card" role="status"><span>LUNAR VICINITY · TRANSFER COMPLETE</span><strong>Lunar arrival reached</strong><p>{presentation.lunarAltitudeKm.toLocaleString(undefined,{maximumFractionDigits:0})} km above the Moon. This is the calculated approach reference; capture and descent are not simulated.</p></div>}
    {modelStatus!=='ready'&&<p className="trip-scene-message" role="status">{modelStatus==='loading'?`Loading selected ${modelName??'vehicle'} model…`:`${modelName??'Selected vehicle'} model unavailable. Its position is labelled; no substitute spacecraft is shown.`}</p>}
    {failed&&<p className="trip-scene-message" role="alert">3D rendering is unavailable. Calculated metrics and dates remain available in the mission panel.</p>}
    <div ref={controlsHost} className="mission-animation-controls">
      <div role="group" aria-label="Mission camera">{([['cinematic','Cinematic flight'],['rocket','Follow rocket'],['system','Whole journey'],['earth','Earth'],['moon','Moon']] as [Focus,string][]).map(([mode,label])=><button key={mode} type="button" aria-pressed={cameraMode===mode} onClick={()=>focus(mode)}>{label}</button>)}</div>
      <div className="mission-flight-progress"><span>EARTH DEPARTURE</span><strong>{Math.round(presentation.progress*100)}%</strong><span>LUNAR ARRIVAL</span></div>
      <div className="mission-animation-timeline"><button type="button" onClick={play}>{atEnd?'Replay flight':playing?'Pause flight':'Play flight'}</button><input type="range" aria-label="Mission flight time" min={0} max={last} step={.01} value={cursor} onChange={e=>scrub(Number(e.target.value))}/></div>
      <div className="mission-playback-options">
        <label>Playback speed<select aria-label="Animation playback speed" value={speed} onChange={e=>{const value=Number(e.target.value);speedRef.current=value;setSpeed(value);}}>{[.5,1,2,4].map(value=><option key={value} value={value}>{value}×</option>)}</select></label>
        <button type="button" aria-pressed={puffs} onClick={()=>{puffsRef.current=!puffs;setPuffs(!puffs);}}>Thruster puffs {puffs?'on':'off'}</button>
        <output aria-label="Animation playback timer">{formatPlaybackTime(clock.elapsed)} / {formatPlaybackTime(TRANSFER_PLAYBACK_SECONDS)} · {formatPlaybackTime(clock.remaining)} remaining at {speed}×</output>
      </div>
      <output aria-label="Mission flight UTC">{sample.time.slice(0,19).replace('T',' ')} UTC · +{(sample.elapsed_seconds/3600).toFixed(1)} h</output>
      <p>One flight clock drives the rocket, Moon and sunlight. Body sizes and distances use a linear scale; the spacecraft and target markers are enlarged. Sun is a direction marker. Selected vehicle: {modelName??'unavailable'}{modelCredit?` (${modelCredit})`:null}. Vehicle configuration and gas puffs are illustrative; staging and thruster forces are not simulated. Flight ends at the calculated lunar approach reference; capture and descent are not simulated. Drag to orbit; scroll to zoom. {textureNotice&&'A visual asset is unavailable; calculated positions are unchanged.'}</p>
    </div>
  </section>;
}
