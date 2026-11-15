import * as THREE from 'three';

/** Decorative cold-gas jets in model-local coordinates; never applies a force to the transfer. */
export function createThrusterPuffs() {
  const count=96,positions=new Float32Array(count*3),colors=new Float32Array(count*3);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d');
  if(ctx){const gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#effaff');gradient.addColorStop(.3,'#a3dcf0aa');gradient.addColorStop(1,'#8cc9e000');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);}
  const material=new THREE.PointsMaterial({map:new THREE.CanvasTexture(canvas),size:.004,vertexColors:true,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const points=new THREE.Points(geometry,material);points.name='Illustrative thruster gas';points.frustumCulled=false;
  return {points,update:(seconds:number,active:boolean,scale:number)=>{
    points.visible=active;if(!active)return;
    material.size=.004*scale/.06;
    for(let i=0;i<count;i++){
      const age=(seconds*1.1+i/count)%1,side=i%2===0?-1:1;
      const burst=Math.floor(seconds*1.1+i/count)%3!==2;
      const spread=age*.08,seed=Math.sin(i*127.1)*.5;
      positions[i*3]=side*(.045+age*.17)+Math.sin(i*2.4)*spread;
      positions[i*3+1]=-.18-age*.32+seed*spread;
      positions[i*3+2]=Math.cos(i*3.7)*spread;
      const fade=burst?Math.pow(1-age,2)*.85:0;
      colors[i*3]=fade*.65;colors[i*3+1]=fade*.85;colors[i*3+2]=fade;
    }
    geometry.attributes.position!.needsUpdate=true;geometry.attributes.color!.needsUpdate=true;
  }};
}
