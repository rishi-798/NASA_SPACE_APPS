"""Publish an honest staged manifest referencing only remotely hash-verified COGs."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from huggingface_hub import HfApi
from scripts.upload_cloud_terrain import REPO

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--folder',type=Path,required=True)
    parser.add_argument('--source-root',type=Path,required=True)
    parser.add_argument('--token-file',type=Path,required=True)
    args=parser.parse_args()
    api=HfApi(token=args.token_file.read_text().strip())
    data=json.loads((args.folder/'moon-dataset.json').read_text())
    original=json.loads((args.source_root/'moon-dataset.json').read_text())
    candidates={s['id']:s for s in data['sources']}
    reports={json.loads(p.read_text())['cloud_path']:json.loads(p.read_text())
             for p in (args.folder/'cogs').glob('*.verified.json')}
    # Pilot geotiff metadata and quality mappings are already validated.
    pilot=json.loads((args.folder.parent/'cloud-terrain-pilot'/'moon-dataset.json').read_text())
    for source in pilot['sources']:
        candidates.setdefault(source['id'],source)
    for source in original['sources']:
        name='cogs/'+source['id']+'.tif'
        if source['id'] not in candidates and name in reports and source.get('format')!='geotiff-metres':
            candidates[source['id']]={**source,'cloud_path':name}
    names={s['cloud_path'] for s in candidates.values()}
    names.update(n for s in candidates.values() for n in s.get('cloud_quality',{}).values())
    remote={p.path:p for p in api.get_paths_info(REPO,sorted(names),repo_type='dataset')}
    def verified(name):
        info=remote.get(name); report=reports.get(name)
        if not info or not report or not report['all_pixels_verified']:
            return False
        if info.lfs:
            return info.lfs.sha256==report['sha256']
        # Tiny COGs are regular Git blobs rather than LFS objects.
        if info.size>5*1024*1024:
            return False
        content=(args.folder/name).read_bytes()
        blob=hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
        return blob==info.blob_id and hashlib.sha256(content).hexdigest()==report['sha256']
    release=copy.deepcopy(data)
    release['sources']=[s for s in candidates.values() if verified(s['cloud_path'])
                        and all(verified(n) for n in s.get('cloud_quality',{}).values())]
    release['cloud_rollout']={'complete':len(release['sources'])==41,
                              'expected_elevation_sources':41,
                              'published_elevation_sources':len(release['sources'])}
    if not any(s['id']=='LOLA64-SVS' for s in release['sources']):
        raise ValueError('Verified full Moon baseline is required for staged rollout')
    out=args.folder/'rollout'; out.mkdir(exist_ok=True)
    (out/'moon-dataset.json').write_text(json.dumps(release,indent=2)+'\n')
    commit=api.upload_file(repo_id=REPO,repo_type='dataset',path_or_fileobj=out/'moon-dataset.json',
                          path_in_repo='moon-dataset.json',commit_message='Publish hash-verified staged global terrain coverage')
    result={'sources':len(release['sources']),'commit':commit.oid,
            'base_url':f'https://huggingface.co/datasets/{REPO}/resolve/{commit.oid}'}
    (out/'upload-status.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))

if __name__=='__main__': main()
