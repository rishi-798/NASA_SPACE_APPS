/** Explicit placement of the validated glTF Y-up pilot, with no axis guessing. */
export function sceneMatrix(Cesium, manifest, moonFixedToWorld = Cesium.Matrix4.IDENTITY) {
  if (manifest.schema !== 'lunar-local-scene-v1' || manifest.units !== 'metres' ||
      manifest.coordinate_frame !== 'MOON_ME / DE421') throw new Error('Unsupported local scene coordinate contract');
  const values = manifest.gltf_to_moon_fixed_column_major;
  const validateRigid = (values) => {
  if (!Array.isArray(values) || values.length !== 16 || !values.every(Number.isFinite))
    throw new Error('Missing validated glTF transform');
  if (Math.abs(values[3])+Math.abs(values[7])+Math.abs(values[11])+Math.abs(values[15]-1)>1e-10)
    throw new Error('Invalid affine transform');
  const basis = [values.slice(0,3), values.slice(4,7), values.slice(8,11)];
  const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
  for (let i=0;i<3;i++) for(let j=0;j<3;j++)
    if (Math.abs(dot(basis[i],basis[j])-(i===j?1:0))>1e-9) throw new Error('Non-unit scene scale or skew');
  const [a,b,c]=basis;
  const determinant=a[0]*(b[1]*c[2]-b[2]*c[1])-b[0]*(a[1]*c[2]-a[2]*c[1])+c[0]*(a[1]*b[2]-a[2]*b[1]);
  if(Math.abs(determinant-1)>1e-9)throw new Error('Scene transform reverses handedness');
  };
  validateRigid(values);
  validateRigid(Cesium.Matrix4.toArray(moonFixedToWorld));
  const fixed = Cesium.Matrix4.fromArray(values);
  return Cesium.Matrix4.multiply(moonFixedToWorld, fixed, new Cesium.Matrix4());
}

export function selectedPoint(Cesium, manifest, selection, moonFixedToWorld = Cesium.Matrix4.IDENTITY) {
  const {latitude,longitude,height_m} = selection;
  if (![latitude,longitude,height_m].every(Number.isFinite) || Math.abs(latitude)>90 || Math.abs(longitude)>180)
    throw new Error('Valid lunar coordinates and explicit height are required');
  if(selection.grid_id && selection.grid_id!==manifest.grid_id)throw new Error('Selected grid does not match this asset');
  const r = manifest.reference_radius_m;
  if (!Number.isFinite(r) || r <= 0) throw new Error('Missing lunar reference radius');
  const lunarEllipsoid = new Cesium.Ellipsoid(r,r,r);
  const fixed = Cesium.Cartesian3.fromDegrees(longitude,latitude,height_m,lunarEllipsoid);
  const world = Cesium.Matrix4.multiplyByPoint(moonFixedToWorld,fixed,new Cesium.Cartesian3());
  const matrix = sceneMatrix(Cesium,manifest,moonFixedToWorld);
  const local = Cesium.Matrix4.multiplyByPoint(Cesium.Matrix4.inverseTransformation(matrix,new Cesium.Matrix4()),world,new Cesium.Cartesian3());
  return {selection:{...selection},moonFixed:fixed,world,gltf:local,enu:new Cesium.Cartesian3(local.x,-local.z,local.y)};
}

export function localPointToLunar(Cesium, manifest, point) {
  const fixed = Cesium.Matrix4.multiplyByPoint(sceneMatrix(Cesium,manifest),point,new Cesium.Cartesian3());
  const r=manifest.reference_radius_m;
  const c=new Cesium.Ellipsoid(r,r,r).cartesianToCartographic(fixed);
  return {latitude:Cesium.Math.toDegrees(c.latitude),longitude:Cesium.Math.toDegrees(c.longitude),height_m:c.height};
}

export async function loadAlignmentPilot(Cesium, viewer, manifest, assetUrl, moonFixedToWorld = Cesium.Matrix4.IDENTITY) {
  // This pilot is allowed for verification, not an assertion of finished textures.
  const model = await Cesium.Model.fromGltfAsync({url:assetUrl,
    modelMatrix:sceneMatrix(Cesium,manifest,moonFixedToWorld),
    upAxis:Cesium.Axis.Z,forwardAxis:Cesium.Axis.X,scale:1,minimumPixelSize:0,
    enableVerticalExaggeration:false,id:manifest.grid_id});
  viewer.scene.primitives.add(model);
  viewer.scene.requestRender();
  return model;
}
