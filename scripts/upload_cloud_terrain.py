"""Publish only verified scientific outputs. Credentials remain local, never in Git."""
import argparse
import hashlib
import json
import time
from pathlib import Path
from huggingface_hub import HfApi

REPO='Deejee-2-406/brahmos-lunar-terrain-cogs'

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--folder',type=Path,required=True)
    parser.add_argument('--token-file',type=Path,required=True)
    parser.add_argument('--follow-conversion',action='store_true',
                        help='Upload each verified output while conversion continues; publish manifest only on completion')
    args=parser.parse_args(); folder=args.folder.resolve()
    token=args.token_file.read_text().strip()
    api=HfApi(token=token)
    uploaded=follow_conversion(api, folder) if args.follow_conversion else {}
    data=json.loads((folder/'moon-dataset.json').read_text())
    if args.follow_conversion:
        if len(data['sources'])!=41:
            raise ValueError('Full publication requires all 41 elevation sources')
        data['cloud_rollout']={'complete':True,'expected_elevation_sources':41,
                               'published_elevation_sources':41}
        (folder/'moon-dataset.json').write_text(json.dumps(data,indent=2)+'\n')
    paths=[]
    for source in data['sources']:
        paths.append(source['cloud_path'])
        paths.extend(source.get('cloud_quality',{}).values())
    for name in sorted(set(paths)):
        path=folder/name
        report=json.loads(path.with_suffix('.verified.json').read_text())
        digest=hashlib.sha256()
        with path.open('rb') as file:
            for block in iter(lambda:file.read(8*1024*1024),b''): digest.update(block)
        if not report['all_pixels_verified'] or digest.hexdigest()!=report['sha256']:
            raise ValueError('Verification failed before upload: '+name)
    # No local logs, private credentials, original paths, Blender files or pending outputs.
    for name in sorted(set(paths)):
        if name in uploaded:
            continue
        api.upload_file(repo_id=REPO,repo_type='dataset',path_or_fileobj=folder/name,
                        path_in_repo=name,commit_message='Add verified lossless COG '+Path(name).name)
    shards=sorted((folder/'index').glob('*.json'))
    for offset in range(0,len(shards),50):
        api.upload_folder(repo_id=REPO,repo_type='dataset',folder_path=folder,
                          allow_patterns=[p.relative_to(folder).as_posix() for p in shards[offset:offset+50]])
    api.upload_file(repo_id=REPO,repo_type='dataset',path_or_fileobj=folder/'README.md',
                    path_in_repo='README.md',commit_message='Document scientific provenance and reuse')
    # Manifest is published last, after every referenced COG is present.
    commit=api.upload_file(repo_id=REPO,repo_type='dataset',path_or_fileobj=folder/'moon-dataset.json',
                          path_in_repo='moon-dataset.json',commit_message='Publish verified lossless terrain manifest')
    (folder/'upload-status.json').write_text(json.dumps({'state':'published',
        'repo':REPO,'commit':commit.oid,'sources':len(data['sources']),
        'base_url':f'https://huggingface.co/datasets/{REPO}/resolve/{commit.oid}'},indent=2)+'\n')
    print('Published verified terrain release: '+commit.oid)

def follow_conversion(api, folder):
    progress_file=folder/'upload-progress.json'
    uploaded=json.loads(progress_file.read_text()).get('uploaded',{}) if progress_file.exists() else {}
    while True:
        for report_path in sorted((folder/'cogs').glob('*.verified.json')):
            report=json.loads(report_path.read_text())
            name=report['cloud_path']; digest=report['sha256']
            if uploaded.get(name)==digest:
                continue
            path=folder/name
            actual=hashlib.sha256()
            with path.open('rb') as file:
                for block in iter(lambda:file.read(8*1024*1024),b''): actual.update(block)
            if not report['all_pixels_verified'] or actual.hexdigest()!=digest:
                raise ValueError('Verification failed before upload: '+name)
            print('Uploading verified output: '+name,flush=True)
            api.upload_file(repo_id=REPO,repo_type='dataset',path_or_fileobj=path,
                            path_in_repo=name,commit_message='Add verified lossless COG '+path.name)
            uploaded[name]=digest
            progress_file.write_text(json.dumps({'state':'uploading','uploaded':uploaded},indent=2)+'\n')
        status=json.loads((folder/'conversion-status.json').read_text())
        if status['state']=='complete':
            return uploaded
        if status['state']!='running':
            raise RuntimeError('Conversion stopped; published pilot remains intact. '+str(status.get('error','')))
        time.sleep(30)

if __name__=='__main__': main()
