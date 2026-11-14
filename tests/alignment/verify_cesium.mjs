import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {sceneMatrix,selectedPoint,localPointToLunar,loadAlignmentPilot} from '../../frontend/lunarAlignment.mjs';
const p=path.dirname(fileURLToPath(import.meta.url));
const fixture=path.join(p,'../../metadata/alignment');
const engine=process.env.CESIUM_ENGINE_SOURCE || path.join(p,'node_modules/@cesium/engine/Source');
const C=await import(pathToFileURL(path.join(engine,'../../../cesium/Source/Cesium.js')));
const {default:ModelUtility}=await import(pathToFileURL(path.join(engine,'Scene/Model/ModelUtility.js')));
const manifest=JSON.parse(fs.readFileSync(path.join(fixture,'SITE04-G7.scene.json')));
const controls=JSON.parse(fs.readFileSync(path.join(fixture,'exported-controls.json')));
const matrix=sceneMatrix(C,manifest);
const anchor=C.Cartesian3.fromDegrees(manifest.anchor.longitude,manifest.anchor.latitude,manifest.anchor.height_m,C.Ellipsoid.MOON);
const enu=C.Transforms.eastNorthUpToFixedFrame(anchor,C.Ellipsoid.MOON);
const yupToEnu=C.Matrix4.fromArray([1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1]);
const expectedMatrix=C.Matrix4.multiply(enu,yupToEnu,new C.Matrix4());
assert(C.Matrix4.equalsEpsilon(matrix,expectedMatrix,1e-8));
// Use the actual Cesium engine's correction, not a mock of its behaviour.
const correction=ModelUtility.getAxisCorrectionMatrix(C.Axis.Z,C.Axis.X,new C.Matrix4());
assert(C.Matrix4.equals(correction,C.Matrix4.IDENTITY));
let maxPositionError=0,maxHeightError=0,maxAngularError=0;
for(const control of controls){
  const point=C.Cartesian3.fromArray(control.actual_exported_gltf_m);
  const world=C.Matrix4.multiplyByPoint(C.Matrix4.multiply(matrix,correction,new C.Matrix4()),point,new C.Cartesian3());
  const expected=C.Cartesian3.fromDegrees(control.longitude,control.latitude,control.height_m,C.Ellipsoid.MOON);
  const error=C.Cartesian3.distance(world,expected);
  maxPositionError=Math.max(maxPositionError,error);
  assert(error<0.0001);
  const result=localPointToLunar(C,manifest,point);
  maxHeightError=Math.max(maxHeightError,Math.abs(result.height_m-control.height_m));
  maxAngularError=Math.max(maxAngularError,Math.abs(result.latitude-control.latitude),Math.abs(result.longitude-control.longitude));
  assert(Math.abs(result.height_m-control.height_m)<0.0001);
  assert(Math.abs(result.latitude-control.latitude)<1e-8);
  assert(Math.abs(result.longitude-control.longitude)<1e-6);
}
// Metre scale and cardinal directions in the exact Cesium model transform.
const origin=C.Matrix4.multiplyByPoint(matrix,C.Cartesian3.ZERO,new C.Cartesian3());
for(const [name,point,enuPoint] of [['east',new C.Cartesian3(1,0,0),new C.Cartesian3(1,0,0)],['north',new C.Cartesian3(0,0,-1),new C.Cartesian3(0,1,0)],['up',new C.Cartesian3(0,1,0),new C.Cartesian3(0,0,1)]]){
  const actual=C.Matrix4.multiplyByPoint(matrix,point,new C.Cartesian3());
  const expected=C.Matrix4.multiplyByPoint(enu,enuPoint,new C.Cartesian3());
  assert(C.Cartesian3.distance(actual,expected)<1e-8,name);
  assert(Math.abs(C.Cartesian3.distance(actual,origin)-1)<1e-8,name+' metre');
}
// The coordinate handoff also works after a non-identity rigid Moon-world transform.
const rotation=C.Matrix3.fromRotationZ(0.7);
const translated=C.Matrix4.fromRotationTranslation(rotation,new C.Cartesian3(120000,-80000,24000));
for(const control of manifest.selection_controls){
  const selection={...control,grid_id:'SITE04-G7',utcTime:'2026-10-10T12:00:00Z'};
  const result=selectedPoint(C,manifest,selection,translated);
  assert.deepEqual(result.selection,selection);
  assert(C.Cartesian3.distance(result.gltf,C.Cartesian3.fromArray(control.gltf_m))<1e-8);
}
assert.throws(()=>sceneMatrix(C,{...manifest,gltf_to_moon_fixed_column_major:null}));
const scaled=structuredClone(manifest);scaled.gltf_to_moon_fixed_column_major[0]*=2;
assert.throws(()=>sceneMatrix(C,scaled));
// Inspect adapter options without constructing a GPU context here.
let options;
const sentinel={};
const fake={...C,Model:{fromGltfAsync:async o=>{options=o;return sentinel;}}};
const viewer={scene:{primitives:{add:m=>assert.equal(m,sentinel)},requestRender:()=>{}}};
await loadAlignmentPilot(fake,viewer,manifest,'SITE04-G7-alignment.glb');
assert.equal(options.scale,1);assert.equal(options.minimumPixelSize,0);assert.equal(options.enableVerticalExaggeration,false);
assert.equal(options.upAxis,C.Axis.Z);assert.equal(options.forwardAxis,C.Axis.X);
const report={passed:true,cesium_version:C.VERSION,actual_export_controls_checked:controls.length,max_control_position_error_m:maxPositionError,max_control_height_error_m:maxHeightError,max_control_angular_error_deg:maxAngularError,cesium_enu_matrix_matches:true,one_metre_cardinal_axes_pass:true,engine_axis_correction_identity:true,selected_coordinates_preserved_with_translated_rotated_world:true,live_ion_terrain_checked:false};

console.log(JSON.stringify(report));
