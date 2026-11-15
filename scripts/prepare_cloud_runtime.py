"""Fetch only the small public manifest during build, never the 55GB dataset."""
import json
import os
from pathlib import Path
import requests
from terrain.streaming import base_url

def main():
    base=base_url()
    if not base: raise ValueError('Set LUNAR_COG_BASE_URL to the published dataset resolve URL')
    response=requests.get(base+'/moon-dataset.json',timeout=30)
    response.raise_for_status()
    if len(response.content)>2*1024*1024: raise ValueError('Unexpected manifest size')
    data=response.json()
    if not data.get('sources') or any(not s.get('cloud_path','').startswith('cogs/') for s in data['sources']):
        raise ValueError('Manifest is not a verified COG release')
    root=Path(os.environ.get('LUNAR_DATASET_DIR','data/lunar-cloud'))
    root.mkdir(parents=True,exist_ok=True)
    (root/'moon-dataset.json').write_text(json.dumps(data,indent=2)+'\n')
    print('Small terrain manifest installed; raster bytes remain remote')

if __name__=='__main__': main()
