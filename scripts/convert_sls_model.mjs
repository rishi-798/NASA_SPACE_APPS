// Convert the official NASA printable mesh without inventing flight textures.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import { STLLoader } from '../frontend/node_modules/three/examples/jsm/loaders/STLLoader.js';
import { GLTFExporter } from '../frontend/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from '../frontend/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';

// GLTFExporter uses browser FileReader for Blob output. Node provides Blob.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then(result => {
      this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const source = await readFile(new URL('../tmp/sls-block-1-source.stl', import.meta.url));
const geometry = new STLLoader().parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
if (!geometry.getAttribute('position')?.count) throw new Error('NASA STL contains no geometry');
const indexed = mergeVertices(geometry, 0.00001);
indexed.computeBoundingBox();
const mesh = new THREE.Mesh(indexed, new THREE.MeshStandardMaterial({color:0xd4d1cc, roughness:.65}));
mesh.name = 'NASA SLS Block 1 printable geometry';
mesh.userData = {
  credit:'NASA / Marshall Space Flight Center',
  source:'https://science.nasa.gov/3d-resources/space-launch-system-sls-block-1/',
  material:'Neutral presentation material; original STL does not supply textures.',
  source_sha256:createHash('sha256').update(source).digest('hex'),
};
const output = await new GLTFExporter().parseAsync(mesh, {binary:true});
await writeFile(new URL('../frontend/public/sls-block-1.glb', import.meta.url), Buffer.from(output));
console.log(JSON.stringify({triangles:geometry.getAttribute('position').count/3,vertices:indexed.getAttribute('position').count,bytes:output.byteLength,source_sha256:mesh.userData.source_sha256,bounds:indexed.boundingBox}));
