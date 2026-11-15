import {useEffect, useRef, useState} from 'react';
import * as THREE from 'three';
import {CSS2DObject,CSS2DRenderer} from 'three/addons/renderers/CSS2DRenderer.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {TransferResult} from '../../lib/transfer';

const SCALE = 1/100000;
// J2000 X/Y/Z -> Three.js X/-Z/Y (right-handed, Y-up).
const point = (v: number[]) => new THREE.Vector3(v[0], v[2], -v[1]).multiplyScalar(SCALE);
const P = new THREE.Matrix4().set(1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1);
function orientation(values: number[]) {
  const r = new THREE.Matrix4().set(values[0]!,values[1]!,values[2]!,0, values[3]!,values[4]!,values[5]!,0, values[6]!,values[7]!,values[8]!,0, 0,0,0,1);
  return new THREE.Quaternion().setFromRotationMatrix(P.clone().multiply(r).multiply(P.clone().invert()));
}

export function TransferTrajectoryViewer({data}: {data: TransferResult}) {
  const host = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const focusRef = useRef<{mode:'system'|'earth'|'moon';serial:number}>({mode:'system',serial:0});
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [textureNotice, setTextureNotice] = useState(false);
  const last = data.samples.length-1;
  const sample = data.samples[index]!;
  useEffect(() => {indexRef.current = index;}, [index]);
  useEffect(() => {
    if (!playing || index >= last) return;
    const timer = window.setTimeout(() => setIndex(index+1), 120);
    return () => window.clearTimeout(timer);
  }, [playing, index, last]);
  const atEnd = index === last;

  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let renderer: THREE.WebGLRenderer;
    try {renderer = new THREE.WebGLRenderer({antialias:true});}
    catch {queueMicrotask(() => setFailed(true)); return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.domElement.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';
    element.appendChild(labels.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#030a13');
    const camera = new THREE.PerspectiveCamera(43,1,.0005,100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.minDistance = .04; controls.maxDistance = 30;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(data.constants.earth_radius_km*SCALE,64,48), new THREE.MeshStandardMaterial({color:'#5b9fba',roughness:1}));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(data.constants.moon_radius_km*SCALE,48,32), new THREE.MeshStandardMaterial({color:'#b9b9af',roughness:1}));
    const label = (text: string) => {const span=document.createElement('span');span.className='transfer-body-label';span.textContent=text;const object=new CSS2DObject(span);object.center.set(.5,1.6);scene.add(object);return object;};
    const earthLabel=label('Earth');earthLabel.position.set(0,data.constants.earth_radius_km*SCALE+.045,0);
    const moonLabel=label('Moon now');const arrivalLabel=label('Moon at arrival');const craftLabel=label('Vehicle');
    scene.add(earth, moon, new THREE.AmbientLight('#c3d3ea',.55));
    const light = new THREE.DirectionalLight('#fff5df',2.5); scene.add(light);
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    const load = (url: string, material: THREE.MeshStandardMaterial) => loader.load(url, texture => {
      if (cancelled) {texture.dispose(); return;}
      texture.colorSpace = THREE.SRGBColorSpace; material.map = texture; material.color.set('white'); material.needsUpdate = true;
    }, undefined, () => {if (!cancelled) setTextureNotice(true);});
    load('/earth/2k-daymap.jpg', earth.material); load('/moon-lroc-2k.jpg', moon.material);
    const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(data.samples.map(s => point(s.spacecraft_position_km))), new THREE.LineBasicMaterial({color:'#fa9b60'}));
    const moonTrack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(data.samples.map(s => point(s.moon_position_km))), new THREE.LineDashedMaterial({color:'#4e91a4',dashSize:.035,gapSize:.025}));
    moonTrack.computeLineDistances(); scene.add(path,moonTrack);
    const craft = new THREE.Mesh(new THREE.ConeGeometry(.012,.045,12), new THREE.MeshBasicMaterial({color:'#ffe8b3'}));
    scene.add(craft);
    const marker = (position: number[], color: string) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.012,12,8),new THREE.MeshBasicMaterial({color}));
      dot.position.copy(point(position));scene.add(dot);return dot;
    };
    marker(data.arrival_target.position_km,'#a2ecd3');
    const arrival = data.samples[last]!;
    const ghost = new THREE.Mesh(moon.geometry, new THREE.MeshBasicMaterial({color:'#7fbdcc',wireframe:true,transparent:true,opacity:.3}));
    ghost.position.copy(point(arrival.moon_position_km));scene.add(ghost);
    // Camera presets retain physical sizes and linear distances; only markers are enlarged.
    const bounds = new THREE.Box3().setFromPoints([new THREE.Vector3(),...data.samples.flatMap(s=>[point(s.moon_position_km),point(s.spacecraft_position_km)])]).getBoundingSphere(new THREE.Sphere());
    const center=bounds.center;
    const fitSystem=()=>{
      const half=Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*Math.min(1,camera.aspect));
      const distance=(bounds.radius+.1)/Math.sin(half)*1.12;
      camera.position.copy(center).add(new THREE.Vector3(.3,.7,1.1).normalize().multiplyScalar(distance));controls.target.copy(center);
    };
    fitSystem();
    let previousSerial = 0;
    const previousTarget = new THREE.Vector3();
    const size = () => {const width=element.clientWidth,height=element.clientHeight;renderer.setSize(width,height);labels.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();if(focusRef.current.mode==='system')fitSystem();};
    const observer = new ResizeObserver(size);observer.observe(element);size();
    let animation = 0;
    const frame = () => {
      if (cancelled) return;
      const active = data.samples[indexRef.current]!;
      moon.position.copy(point(active.moon_position_km));craft.position.copy(point(active.spacecraft_position_km));
      moonLabel.position.copy(moon.position).y+=.045;
      arrivalLabel.position.copy(ghost.position).y+=.045;arrivalLabel.visible=moon.position.distanceTo(ghost.position)>.2;
      craftLabel.position.copy(craft.position).y+=.04;craftLabel.visible=craft.position.length()>.3&&craft.position.distanceTo(moon.position)>.15;
      earth.quaternion.copy(orientation(active.earth_orientation));moon.quaternion.copy(orientation(active.moon_orientation));
      const velocity = point(active.spacecraft_velocity_km_s).normalize();
      craft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),velocity);
      light.position.copy(point(active.sun_direction).normalize().multiplyScalar(20));
      const {mode:focus,serial} = focusRef.current;
      const target = focus==='moon' ? moon.position.clone() : focus==='earth' ? new THREE.Vector3() : center.clone();
      if (serial !== previousSerial) {
        const offset = focus==='earth' ? new THREE.Vector3(.12,.12,.25) : new THREE.Vector3(.08,.08,.18);
        if(focus==='system')fitSystem();else{camera.position.copy(target).add(offset);controls.target.copy(target);}previousSerial=serial;
      } else if (focus==='moon') {
        const delta = target.clone().sub(previousTarget); camera.position.add(delta);controls.target.add(delta);
      }
      previousTarget.copy(target);controls.update();renderer.render(scene,camera);labels.render(scene,camera);
      animation=requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelled=true;cancelAnimationFrame(animation);observer.disconnect();controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse(o => {if (o instanceof THREE.Mesh || o instanceof THREE.Line) {geometries.add(o.geometry);const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>{if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose();m.dispose();});}});
      geometries.forEach(g=>g.dispose());renderer.dispose();renderer.domElement.remove();labels.domElement.remove();
    };
  }, [data,last]);

  return <div className="transfer-viewer">
    <div className="transfer-canvas" ref={host} aria-label="Calculated Earth–Moon transfer in Earth-centered J2000 coordinates" />
    {failed && <p role="alert">3D rendering is unavailable. Numerical results and the state table remain available below.</p>}
    <div className="transfer-toolbar">
      <div role="group" aria-label="Trajectory camera"><button type="button" onClick={()=>{focusRef.current={mode:'system',serial:focusRef.current.serial+1};}}>Whole journey</button><button type="button" onClick={()=>{focusRef.current={mode:'earth',serial:focusRef.current.serial+1};}}>Earth departure</button><button type="button" onClick={()=>{focusRef.current={mode:'moon',serial:focusRef.current.serial+1};}}>Follow Moon</button></div>
      <button type="button" onClick={()=>{if (atEnd) {setIndex(0);setPlaying(true);} else setPlaying(p=>!p);}}>{atEnd ? 'Replay transfer' : playing ? 'Pause transfer' : 'Play transfer'}</button>
      <label>Flight time<input type="range" aria-label="Transfer time" min={0} max={last} step={1} value={index} onChange={event=>{setPlaying(false);setIndex(Number(event.target.value));}} /></label>
      <output aria-label="Transfer UTC">{sample.time.replace('T',' ').replace('.000','')} · +{(sample.elapsed_seconds/3600).toFixed(1)} h</output>
    </div>
    <p className="trip-note">Orange: propagated spacecraft path · blue dashed: SPICE Moon track · green: arrival reference · wireframe: Moon at arrival. Body radii and distances share a linear scale (100,000 km per scene unit); spacecraft and target markers are enlarged. Drag to orbit; scroll to zoom. {textureNotice && 'A texture could not load; body geometry and positions are still calculated.'}</p>
    <details><summary>Inspect selected J2000 state</summary><dl className="transfer-metrics"><div><dt>Spacecraft position (km)</dt><dd>{sample.spacecraft_position_km.map(v=>v.toFixed(1)).join(', ')}</dd></div><div><dt>Moon position (km)</dt><dd>{sample.moon_position_km.map(v=>v.toFixed(1)).join(', ')}</dd></div><div><dt>Spacecraft velocity (km/s)</dt><dd>{sample.spacecraft_velocity_km_s.map(v=>v.toFixed(4)).join(', ')}</dd></div></dl></details>
  </div>;
}
