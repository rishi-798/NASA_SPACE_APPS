import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRegolithTextures } from './regolithTexture';
import { lunarDetailHeight } from './lunarSurfaceDetail';

// Smooth seeded pockets for the approved eight-region artistic gravel layer.
function lunarDustPocket(x:number,y:number):number {
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const hash=(a:number,b:number)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),sx),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),sx),sy);
}

export function scatterRocks(scene: THREE.Scene, previous: THREE.Group | null, hit: THREE.Intersection, enriched = false, scans: THREE.Mesh[] = [], hero = false, detailRadius = enriched ? 24 : 45) {
  if (!(hit.object instanceof THREE.Mesh) || hit.faceIndex == null) return previous;
  const capacity = enriched ? 45000 : 1800;
  const mesh = hit.object, positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.index;
  if (!positions || !indices) return previous;
  const makeRockGeometry = (variant: number) => {
    const source = new THREE.IcosahedronGeometry(1, enriched ? (variant >= 5 ? 0 : 1) : 2);
    source.deleteAttribute('normal');
    source.deleteAttribute('uv');
    const geometry = mergeVertices(source);
    source.dispose();
    const vertex = geometry.getAttribute('position');
    for (let i = 0; i < vertex.count; i++) {
      const x = vertex.getX(i), y = vertex.getY(i), z = vertex.getZ(i);
      const irregularity = .85 + .16 * Math.sin(x * (3.7 + variant * .7) + y * 5.3 + z * 4.1 + variant * 2.1)
        + .08 * Math.sin(x * 8.1 - y * 6.4 + z * 7.3)
        + .035 * Math.sin(x * 18.1 + y * 13.4 - z * 16.3);
      const cut = enriched ? Math.min(1, .83 / Math.max(.001, Math.abs(x + .24 * y)), .88 / Math.max(.001, Math.abs(y - .17 * z))) : 1;
      vertex.setXYZ(i, x * irregularity * cut, y * irregularity * cut, z * irregularity * cut);
    }
    geometry.computeVertexNormals();
    const rockUv = new Float32Array(vertex.count * 2);
    for (let i = 0; i < vertex.count; i++) {
      rockUv[i * 2] = Math.atan2(vertex.getY(i), vertex.getX(i)) / (Math.PI * 2) + .5;
      rockUv[i * 2 + 1] = Math.acos(THREE.MathUtils.clamp(vertex.getZ(i) / Math.hypot(vertex.getX(i), vertex.getY(i), vertex.getZ(i)), -1, 1)) / Math.PI;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(rockUv, 2));
    return geometry;
  };
  const rocks = previous ?? new THREE.Group();
  const variants = enriched ? 8 : 1;
  if (!previous) {
    const grit = enriched ? createRegolithTextures(24, true) : null;
    if (grit) { grit.map.repeat.set(1, 1); grit.normalMap.repeat.set(1, 1); }
    for (let variant = 0; variant < variants; variant++) {
      const template = scans.length && variant < scans.length ? scans[variant] : null;
      const material = template ? (template.material as THREE.MeshStandardMaterial).clone() : new THREE.MeshStandardMaterial({
        color: enriched ? 0xb8b6b0 : 0x41413f, roughness: .94, metalness: 0,
        map: grit?.map, normalMap: grit?.normalMap,
        normalScale: new THREE.Vector2(.25, .25), flatShading: enriched,
      });
      if (enriched) {
        material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)));');
        };
        material.customProgramCacheKey = () => 'lunar-neutral-fragments-v1';
      }
      if(hero && new URLSearchParams(window.location.search).get('l1diagnostic') === 'rock-neutral') {
        material.map=null;material.normalMap=null;material.aoMap=null;material.roughnessMap=null;
        material.color.set(0xaaaaaa);material.roughness=.95;
      }
      const stoneGeometry=template ? template.geometry.clone() : makeRockGeometry(variant);
      if(hero && new URLSearchParams(window.location.search).get('l1diagnostic') !== 'rock-neutral') {
        stoneGeometry.computeBoundingBox();
        const bounds=stoneGeometry.boundingBox!,vertices=stoneGeometry.getAttribute('position');
        const covers=new Float32Array(vertices.count);
        for(let i=0;i<vertices.count;i++) {
          const height=(vertices.getZ(i)-bounds.min.z)/Math.max(.001,bounds.max.z-bounds.min.z);
          covers[i]=.5+.30*(1-THREE.MathUtils.smoothstep(height,.05,.65));
        }
        stoneGeometry.setAttribute('l1DustCover',new THREE.BufferAttribute(covers,1));
        material.normalScale.multiplyScalar(.6);
        const originalCompile=material.onBeforeCompile;
        material.onBeforeCompile=(shader,renderer)=>{
          originalCompile(shader,renderer);
          shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n attribute float l1DustCover; varying float vL1DustCover;');
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vL1DustCover=l1DustCover;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n varying float vL1DustCover;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.215),vL1DustCover);');
        };
        material.customProgramCacheKey=()=> 'lunokhod1-dust-coated-stones-v1';
      }
      const stones = new THREE.InstancedMesh(stoneGeometry, material, hero ? capacity + 20000 : capacity);
      stones.castShadow = stones.receiveShadow = true;
      stones.frustumCulled = false;
      rocks.add(stones);
    }
    scene.add(rocks);
  }
  const batches = rocks.children as THREE.InstancedMesh[];
  batches.forEach(batch => { if (!batch.geometry.boundingBox) batch.geometry.computeBoundingBox(); });
  const samplesBySlot: { matrix: THREE.Matrix4; shade: number; scale: number }[] = [];
  const fineGravel: { matrix: THREE.Matrix4; shade: number; scale: number }[]=[];
  let gravelSeed=(hit.faceIndex+77123)>>>0;
  const gravelRandom=()=>{gravelSeed=(1664525*gravelSeed+1013904223)>>>0;return gravelSeed/4294967296;};
  const transform = new THREE.Object3D();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), point = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1), spin = new THREE.Quaternion();
  const tint = new THREE.Color();
  let seed = (hit.faceIndex + 1) >>> 0, count = 0, candidates = 0;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const first = Math.max(0, hit.faceIndex - 16384), last = Math.min(indices.count / 3, hit.faceIndex + 16385);
  for (let face = first; face < last; face++) {
    a.fromBufferAttribute(positions, indices.getX(face * 3)).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(positions, indices.getX(face * 3 + 1)).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(positions, indices.getX(face * 3 + 2)).applyMatrix4(mesh.matrixWorld);
    if (Math.min(a.distanceToSquared(hit.point), b.distanceToSquared(hit.point), c.distanceToSquared(hit.point)) > 10000) continue;
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const area = normal.length() / 2;
    normal.normalize();
    if (normal.z < 0) normal.negate();
    if(hero && fineGravel.length<20000) {
      for(let i=0,n=Math.min(24000,Math.ceil(area*24));i<n&&fineGravel.length<20000;i++) {
        const u=Math.sqrt(gravelRandom()),v=gravelRandom();
        point.copy(a).multiplyScalar(1-u).addScaledVector(b,u*(1-v)).addScaledVector(c,u*v);
        const d=point.distanceToSquared(hit.point);
        if(d>400||d<.0625) continue;
        const pocket=lunarDustPocket(point.x*.1+19,point.y*.1-7);
        if(gravelRandom()>.3+.7*pocket) continue;
        transform.position.copy(point);transform.position.z+=lunarDetailHeight(point.x,point.y,hit.point,true,detailRadius);
        transform.quaternion.setFromUnitVectors(up,normal);
        transform.quaternion.multiply(spin.setFromAxisAngle(up,gravelRandom()*Math.PI*2));
        const scale=.006+gravelRandom()*.012;
        transform.scale.set(scale,scale*(.7+gravelRandom()*.5),scale*(.6+gravelRandom()*.35));
        transform.updateMatrix();fineGravel.push({matrix:transform.matrix.clone(),shade:.8+gravelRandom()*.2,scale});
      }
    }
    const samples = Math.min(enriched ? 24000 : 120, Math.max(1, Math.ceil(area * (enriched ? 12 : .09))));
    for (let i = 0; i < samples; i++) {
      const u = Math.sqrt(random()), v = random();
      point.copy(a).multiplyScalar(1-u).addScaledVector(b, u*(1-v)).addScaledVector(c, u*v);
      const distance = point.distanceToSquared(hit.point);
      if (distance > 4900 || distance < (enriched ? .0625 : 4)) continue;
      if (enriched) {
        let probability=.08+.92*Math.exp(-distance/500);
        if(hero) probability*=.2+1.6*lunarDustPocket(point.x*.1+19,point.y*.1-7);
        if(random()>probability) continue;
      }
      candidates++;
      const slot = count < capacity ? count++ : Math.floor(random() * candidates);
      if (slot >= capacity) continue;
      transform.position.copy(point);
      transform.position.z += lunarDetailHeight(point.x, point.y, hit.point, enriched, detailRadius);
      transform.quaternion.setFromUnitVectors(up, normal);
      transform.quaternion.multiply(spin.setFromAxisAngle(up, random() * Math.PI * 2));
      // Many small fragments and occasional larger rocks, mostly buried in dust.
      const sizeRoll = random();
      const scale = enriched
        ? (sizeRoll < .90 ? .006 + Math.pow(random(), 2) * .018 : sizeRoll < .985 ? .025 + random() * .045 : sizeRoll < .999 ? .09 + random() * .11 : .20 + random() * .20)
        : .035 + Math.pow(random(), 3) * .42;
      transform.scale.set(scale, scale * (.65 + random() * .7), scale * (enriched && scans.length ? .75 + random() * .45 : .35 + random() * .38));
      transform.updateMatrix();
      samplesBySlot[slot] = { matrix: transform.matrix.clone(), shade: .65 + random() * .35, scale };
    }
  }
  samplesBySlot.push(...fineGravel);
  batches.forEach(batch => { batch.count = 0; });
  samplesBySlot.forEach((sample, slot) => {
    // Reserve photographed geometry for visible stones; fine gravel uses cheaper fragments.
    const variant = scans.length && enriched
      ? sample.scale >= .09 ? slot % scans.length : scans.length + slot % (variants - scans.length)
      : slot % variants;
    const batch = batches[variant]!;
    // Keep most of each stone above the regolith, with its lower portion embedded.
    const lift = enriched ? -.65 * batch.geometry.boundingBox!.min.z : 0;
    const elements = sample.matrix.elements;
    elements[12] += elements[8] * lift;
    elements[13] += elements[9] * lift;
    elements[14] += elements[10] * lift;
    batch.setMatrixAt(batch.count, sample.matrix);
    tint.setRGB(sample.shade, sample.shade, sample.shade * .98);
    batch.setColorAt(batch.count++, tint);
  });
  batches.forEach(batch => {
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
  });
  return rocks;
}

