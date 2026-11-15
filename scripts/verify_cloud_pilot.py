"""Exercise actual HTTP range reads against verified pilot COGs, without uploading."""
import argparse
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.parse import unquote, urlsplit
import rasterio
from terrain import catalogue, streaming

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-root',type=Path,required=True)
    parser.add_argument('--pilot',type=Path,required=True)
    args=parser.parse_args()
    root=args.source_root.resolve(); pilot=args.pilot.resolve()
    counts={'bytes_sent':0,'range_requests':0}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def serve(self,body):
            path=(pilot/unquote(urlsplit(self.path).path).lstrip('/')).resolve()
            if not path.is_relative_to(pilot) or not path.is_file():
                self.send_error(404); return
            size=path.stat().st_size; start=0; end=size-1
            request=self.headers.get('Range')
            if request:
                match=re.fullmatch(r'bytes=(\d+)-(\d*)',request)
                if not match: self.send_error(416); return
                start=int(match[1]); end=min(int(match[2]) if match[2] else end,end)
                if start>end: self.send_error(416); return
                counts['range_requests']+=1
            self.send_response(206 if request else 200)
            self.send_header('Content-Length',str(end-start+1))
            self.send_header('Accept-Ranges','bytes')
            if request: self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            self.end_headers()
            if body:
                with path.open('rb') as file:
                    file.seek(start); block=file.read(end-start+1)
                    self.wfile.write(block); counts['bytes_sent']+=len(block)
        def do_GET(self): self.serve(True)
        def do_HEAD(self): self.serve(False)
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    original=json.loads((root/'moon-dataset.json').read_text())
    converted=json.loads((pilot/'moon-dataset.json').read_text())
    pairs={s['id']:s for s in original['sources']}
    checks=[]
    try:
        for source in converted['sources']:
            lat,lon=(-89.9,180) if source['id']=='SITE04-5M' else (38.315,-35.0081)
            with patch.object(catalogue,'dataset_root',return_value=root):
                expected=catalogue.sample_source(pairs[source['id']],lat,lon)
            def remote(s,r):
                return f'http://127.0.0.1:{server.server_port}/'+s['cloud_path']
            with patch.object(catalogue,'dataset_root',return_value=pilot),patch.object(streaming,'raster_path',side_effect=remote):
                with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_TIMEOUT='10'):
                    actual=catalogue.sample_source(source,lat,lon)
            if actual is None or actual!=expected: raise AssertionError((source['id'],expected,actual))
            checks.append({'source':source['id'],'latitude':lat,'longitude':lon,'matches_original':True,'elevation_m':actual['elevation_m']})
        if not counts['range_requests']: raise AssertionError('No range requests observed')
        report={'checks':checks,**counts,'tested_transport':'local HTTP range server; public host still needs separate validation'}
        (pilot/'streaming-verification.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report,indent=2))
    finally: server.shutdown(); server.server_close()

if __name__=='__main__': main()
