import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import type {TransferResult} from '../../lib/transfer';
import {MissionFlightAnimation} from './MissionFlightAnimation';
import {createStarPoints,disposeObjects,prepareRocketModel} from './spaceVisuals';

type Props={mission?:boolean;modelUrl?:string;modelName?:string;modelCredit?:string;transfer?:TransferResult};
function RocketModelViewer({modelUrl,modelName,modelCredit}:{modelUrl:string;modelName?:string;modelCredit?:string}) {
  const hostRef=useRef<HTMLDivElement>(null);
  const [ready,setReady]=useState(false);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const host=hostRef.current;if(!host)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
    catch{queueMicrotask(()=>setFailed(true));return;}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    host.append(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x020307);
    // A gallery reflection rig, independent of the decorative space background.
    const room=new RoomEnvironment();
    const pmrem=new THREE.PMREMGenerator(renderer);
    const reflection=pmrem.fromScene(room,.04);
    scene.environment=reflection.texture;scene.environmentIntensity=.45;
    room.dispose();pmrem.dispose();
    const camera=new THREE.PerspectiveCamera(38,1,.05,1000);
    const controls=new OrbitControls(camera,renderer.domElement);
    const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const review=new URLSearchParams(window.location.search).get('rocketReview');
    queueMicrotask(()=>{if(!disposed){setReady(false);setFailed(false);}});
    let disposed=false;
    const markResourceReady=()=>{if(!disposed)setReady(true);};
    const markResourceFailed=()=>{if(!disposed)setFailed(true);markResourceReady();};
    scene.add(createStarPoints());

    // Aerospace studio 3-point lighting
    scene.add(new THREE.HemisphereLight(0xd9e5f5, 0x30343e, 1.2));
    const keyLight = new THREE.DirectionalLight(0xfffaee, 2.4);
    keyLight.position.set(-6, 9, 7);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd7e5fa, 1.1);
    fillLight.position.set(7, 3, -4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf4f4ff, 1.5);
    rimLight.position.set(2, -4, -8);
    scene.add(rimLight);

    // Launch Platform / Holographic Staging Pedestal
    const ringGeo = new THREE.RingGeometry(1.6, 1.75, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
    const stagingRing = new THREE.Mesh(ringGeo, ringMat);
    stagingRing.position.set(0, -2.9, 0);
    scene.add(stagingRing);

    const gridHelper = new THREE.GridHelper(8, 16, 0x1e3a5f, 0x0c1524);
    gridHelper.position.set(0, -2.91, 0);
    scene.add(gridHelper);

    camera.position.set(6.5, 2.2, 9.5);
    controls.minDistance = 4;
    controls.maxDistance = 20;
    controls.autoRotate = !reduceMotion&&!review;
    controls.autoRotateSpeed = 1.0;
    controls.enableDamping = true;
    controls.dampingFactor = 0.045;
    if(review==='close'){camera.position.set(2,1.7,3.2);controls.target.set(0,1.15,0);}

    const decoder = new DRACOLoader().setDecoderPath("/draco/");
    new GLTFLoader().setDRACOLoader(decoder).load(modelUrl, (asset) => {
      if (disposed) { disposeObjects(asset.scene); return; }
      const model = asset.scene;
      try{prepareRocketModel(model,modelUrl,5.8);}
      catch{disposeObjects(model);markResourceFailed();return;}
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      scene.add(model);
      markResourceReady();
    }, undefined, markResourceFailed);
    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    });
    resize.observe(host);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => { disposed = true; resize.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); decoder.dispose(); disposeObjects(scene); reflection.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  },[modelUrl]);
  return <div className="trip-space-scene trip-space-scene-model">
    <div ref={hostRef} className="trip-space-canvas" aria-label={`Interactive ${modelName??'NASA rocket'} model. Drag to orbit and scroll to zoom.`}/>
    {failed&&<p className="trip-scene-message" role="status">A space asset could not load.</p>}
    {!ready&&<p className="trip-scene-message" role="status">Loading 3D model...</p>}
    <p className="trip-globe-hint">{modelCredit??'NASA'}. Drag to inspect.</p>
  </div>;
}

/** One calculated mission animation; the gallery retains the original model studio. */
export function SpaceScene(props:Props) {
  if(props.transfer)return <MissionFlightAnimation data={props.transfer} modelUrl={props.modelUrl} modelName={props.modelName} modelCredit={props.modelCredit}/>;
  if(props.modelUrl&&!props.mission)return <RocketModelViewer modelUrl={props.modelUrl} modelName={props.modelName} modelCredit={props.modelCredit}/>;
  return <div className="trip-mission-empty" role="status"><h2>Your calculated mission flight</h2><p>Choose departure and arrival times, then calculate the transfer to animate the rocket and Moon.</p><p>No illustrative flight is substituted while the calculation is unavailable.</p></div>;
}
