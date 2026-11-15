"""Preserve mesh buffers/paint; export a small, deterministic glTF roughness texture."""
import io,json,math,pathlib,random,struct
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1]
FILES=['ares-i-a','ares-i-b','ariane-6-a64','atlas-v-401','falcon-9-block-5','h-iia-202-reference','jupiter-c','long-march-3b-reference','long-march-5-cz-5','lvm3-reference','proton-k-reference','saturn-v','sls-block-1','vulcan-centaur-vc2s']
def finish(path):
 raw=path.read_bytes();ln=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+ln]);off=20+ln;bl=struct.unpack_from('<I',raw,off)[0];data=bytearray(raw[off+8:off+8+bl])
 def append(b):
  while len(data)%4:data.append(0)
  offset=len(data);data.extend(b);g.setdefault('bufferViews',[]).append({'buffer':0,'byteOffset':offset,'byteLength':len(b)});return len(g['bufferViews'])-1
 # Cylindrical UVs for untextured meshes only. Existing image mapping is untouched.
 for mesh in g.get('meshes',[]):
  for p in mesh['primitives']:
   if 'TEXCOORD_0' in p['attributes']:continue
   if 'KHR_draco_mesh_compression' in p.get('extensions',{}):continue
   a=g['accessors'][p['attributes']['POSITION']];v=g['bufferViews'][a['bufferView']]
   if a['componentType']!=5126:continue
   start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',12)
   points=[struct.unpack_from('<fff',data,start+i*stride) for i in range(a['count'])]
   spans=[max(t[j] for t in points)-min(t[j] for t in points) for j in range(3)];axis=max(range(3),key=spans.__getitem__);other=[j for j in range(3) if j!=axis];low=min(t[axis] for t in points)
   uv=[((math.atan2(t[other[1]],t[other[0]])/math.tau)%1,(t[axis]-low)/max(spans[axis],1e-6)) for t in points]
   bv=append(b''.join(struct.pack('<ff',*t) for t in uv));g['accessors'].append({'bufferView':bv,'componentType':5126,'count':len(uv),'type':'VEC2'});p['attributes']['TEXCOORD_0']=len(g['accessors'])-1
 rng=random.Random(9347);im=Image.new('RGB',(128,128));im.putdata([(255,rng.randrange(243,256),255) for _ in range(128*128)]);buf=io.BytesIO();im.save(buf,format='PNG');bv=append(buf.getvalue())
 g.setdefault('images',[]).append({'name':'Subtle coating roughness · linear data','bufferView':bv,'mimeType':'image/png'});g.setdefault('samplers',[]).append({'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497});g.setdefault('textures',[]).append({'source':len(g['images'])-1,'sampler':len(g['samplers'])-1});tex=len(g['textures'])-1
 for m in g.get('materials',[]):
  p=m.setdefault('pbrMetallicRoughness',{});name=m.get('name','').lower()
  if any(t in name for t in ['engine-metal','engine metal','satin','structural aluminum']):p.update(metallicFactor=.75,roughnessFactor=.36)
  elif any(t in name for t in ['nozzle','bell']):p.update(metallicFactor=.6,roughnessFactor=.45)
  elif 'foam' in name or 'insulation' in name:p.update(metallicFactor=0,roughnessFactor=.9)
  elif 'white' in name or 'paint' in name or 'coating' in name:p.update(metallicFactor=0,roughnessFactor=.48)
  if 'metallicRoughnessTexture' not in p:p['metallicRoughnessTexture']={'index':tex}
 g['buffers'][0]['byteLength']=len(data)
 g.setdefault('asset',{}).setdefault('extras',{})['surface_revision']='2026-11-15 · restrained PBR finishes; original paint and mesh identity retained'
 jb=json.dumps(g,separators=(',',':')).encode();jb+=b' '*((-len(jb))%4);data+=b'\0'*((-len(data))%4)
 result=struct.pack('<III',0x46546c67,2,28+len(jb)+len(data))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(data),0x004e4942)+data
 path.write_bytes(result);print(path.name,len(raw),'->',len(result))
if __name__=='__main__':
 for f in FILES:finish(ROOT/'frontend/public'/f'{f}.glb')
