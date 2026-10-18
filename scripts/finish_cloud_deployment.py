"""One-time local pipeline: verify full upload, pin its release, deploy, verify server."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from unittest.mock import patch
import requests
from scripts.verify_remote_terrain import point
from terrain import catalogue

URL='https://brahmos-lunar-browser.onrender.com'

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--folder',type=Path,required=True)
    parser.add_argument('--source-root',type=Path,required=True)
    args=parser.parse_args()
    repo=Path(__file__).resolve().parents[1]
    status_path=args.folder/'deployment-status.json'
    def status(state,**values):
        target=status_path.with_suffix('.tmp')
        target.write_text(json.dumps({'state':state,'url':URL,**values},indent=2)+'\n')
        target.replace(status_path)
        print(state,flush=True)
    def git(*arguments):
        return subprocess.run(['git',*arguments],cwd=repo,text=True,capture_output=True,check=True).stdout.strip()
    try:
        status('waiting_for_full_upload')
        deadline=time.monotonic()+36*3600
        while True:
            published=args.folder/'upload-status.json'
            if published.exists():
                release=json.loads(published.read_text())
                if release.get('state')=='published' and release.get('sources')==41:
                    break
            conversion=json.loads((args.folder/'conversion-status.json').read_text())
            if conversion['state']=='stopped':
                raise RuntimeError('Conversion stopped; inspect its saved error log')
            if time.monotonic()>deadline:
                raise RuntimeError('Full upload was not completed within 36 hours; originals preserved')
            time.sleep(30)
        status('verifying_all_41_sources',release=release['commit'])
        subprocess.run([sys.executable,'-m','scripts.verify_remote_terrain',
                        '--source-root',str(args.source_root),'--folder',str(args.folder),
                        '--base-url',release['base_url']],cwd=repo,check=True)
        manifest=json.loads((args.folder/'moon-dataset.json').read_text())
        if len(manifest['sources'])!=41:
            raise RuntimeError('Full release does not contain exactly 41 elevation sources')
        if git('remote','get-url','cloud')!='https://github.com/Deejee585/nasa-space-apps-cloud.git':
            raise RuntimeError('Deployment remote changed; refusing to push elsewhere')
        if git('diff','--name-only') or git('diff','--cached','--name-only'):
            raise RuntimeError('Tracked work changed during upload; review before deployment commit')
        release_file=repo/'data'/'cloud-release.json'
        release_file.write_text(json.dumps({'base_url':release['base_url'],'elevation_sources':41,
                                            'expected_elevation_sources':41,'complete':True},indent=2)+'\n')
        git('add','data/cloud-release.json')
        git('commit','-m','Deploy verified complete 41-source lunar terrain release')
        git('push','cloud','HEAD:main')
        status('waiting_for_render_deployment',release=release['commit'])
        # Render's existing GitHub integration builds the small release-pin commit.
        for _ in range(40):
            try:
                response=requests.get(URL+'/api/terrain/catalogue',params={'lat':0,'lon':0},timeout=45)
                if response.ok and response.json().get('expected_elevation_files')==41:
                    break
            except requests.RequestException:
                pass
            time.sleep(30)
        else:
            raise RuntimeError('Full release pushed, but Render did not expose all 41 sources within 20 minutes')
        os.environ.pop('LUNAR_COG_BASE_URL',None)
        os.environ.pop('LUNAR_COG_RELEASE_FILE',None)
        checks=[]
        for source in manifest['sources']:
            lat,lon=point(source)
            with patch.object(catalogue,'dataset_root',return_value=args.source_root):
                expected=catalogue.elevation(lat,lon)
            response=requests.get(URL+'/api/terrain/lookup',params={'lat':lat,'lon':lon},timeout=60)
            response.raise_for_status()
            actual=response.json()['terrain']
            if actual.get('elevation_m')!=expected['elevation_m'] or actual.get('source_id')!=expected['source_id']:
                raise RuntimeError('Public website point mismatch near '+source['id'])
            checks.append({'source_region':source['id'],'latitude':lat,'longitude':lon,
                           'elevation_m':expected['elevation_m'],'source_id':expected['source_id']})
        for path in ['/health','/explorer','/api/visibility?lat=0&lon=0&time=2026-10-12T00:00:00Z']:
            response=requests.get(URL+path,timeout=60)
            response.raise_for_status()
        status('complete',release=release['commit'],sources=41,checks=checks)
    except Exception as exc:
        status('needs_attention',error=str(exc))
        raise

if __name__=='__main__': main()
