"""Resumable lossless COG export. Never changes or deletes source rasters."""
import argparse
import hashlib
import json
import shutil
import sqlite3
from pathlib import Path
import numpy as np
import rasterio
from pyproj import CRS
from rasterio.shutil import copy as raster_copy
from rasterio.transform import from_origin
from rasterio.windows import Window
from xml.sax.saxutils import escape

RADIUS=1737400

def write_json(path, value):
    temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(value,indent=2)+'\n',encoding='utf-8')
    temporary.replace(path)

def input_image(source, root, staging):
    kind=source['format']
    original=root/source['path']
    if kind in ('geotiff-metres','lola-global-tiff'):
        return original, False
    geographic=f'+proj=longlat +R={RADIUS} +no_defs'
    if kind=='sldem-float32':
        shape=(15360,23040)
        data=np.memmap(original,dtype='<f4',mode='r',shape=shape)
        transform=from_origin(source['west'],source['north'],1/512,1/512)
        crs=geographic
    elif kind=='polar-float32':
        shape=(31040,31040)
        data=np.memmap(original,dtype='<f4',mode='r',shape=shape)
        transform=from_origin(-15520*60,15520*60,60,60)
        crs=f"+proj=stere +lat_0={90 if source['pole']=='n' else -90} +lat_ts={90 if source['pole']=='n' else -90} +lon_0=0 +R={RADIUS} +units=m +no_defs"
    elif kind=='lunokhod1-native-crop-metres':
        data=np.load(original,mmap_mode='r')[::-1]
        shape=data.shape
        center_row=int((60-38.315)*512)
        center_col=int(((-35.0081)%360-315)*512)
        transform=from_origin(315+(center_col-12)/512,60-(center_row-10)/512,1/512,1/512)
        crs=geographic
    else:
        raise ValueError(kind)
    if kind in ('sldem-float32','polar-float32'):
        # A tiny GDAL raw-band descriptor streams original rows directly: no duplicate staging raster.
        vrt=original.parent/('.brahmos-'+source['id']+'.vrt')
        wkt=rasterio.crs.CRS.from_string(crs).to_wkt()
        geo=','.join(str(v) for v in transform.to_gdal())
        vrt.write_text(f'<VRTDataset rasterXSize="{shape[1]}" rasterYSize="{shape[0]}"><SRS>{escape(wkt)}</SRS><GeoTransform>{geo}</GeoTransform><VRTRasterBand dataType="Float32" band="1" subClass="VRTRawRasterBand"><SourceFilename relativeToVRT="1">{escape(original.name)}</SourceFilename><ImageOffset>0</ImageOffset><PixelOffset>4</PixelOffset><LineOffset>{shape[1]*4}</LineOffset><ByteOrder>LSB</ByteOrder></VRTRasterBand></VRTDataset>')
        return vrt,True
    # Tiny crop uses disk-backed blocks. Source dtype stays intact.
    with rasterio.open(staging,'w',driver='GTiff',height=shape[0],width=shape[1],count=1,
                       dtype=data.dtype,crs=crs,transform=transform,tiled=True,
                       blockxsize=512,blockysize=512,compress='DEFLATE',predictor=3,
                       zlevel=3,BIGTIFF='IF_SAFER',num_threads=1) as dst:
        for _,window in dst.block_windows(1):
            r,c=int(window.row_off),int(window.col_off)
            dst.write(data[r:r+int(window.height),c:c+int(window.width)],1,window=window)
    return staging, True

def convert(source,root,out):
    target=out/'cogs'/f"{source['id']}.tif"
    report=target.with_suffix('.verified.json')
    if target.exists() and report.exists():
        return json.loads(report.read_text())
    reserve=(root/source['path']).stat().st_size*1.2+5*1024**3
    if shutil.disk_usage(out).free<reserve:
        raise RuntimeError('Insufficient free disk for safe conversion; originals retained')
    staging=target.with_suffix('.staging.tif')
    image,temporary=input_image(source,root,staging)
    pending=target.with_suffix('.pending.tif')
    with rasterio.open(image) as src:
        predictor='FLOATING_POINT' if src.dtypes[0].startswith('float') else 'STANDARD'
        raster_copy(src,pending,driver='COG',COMPRESS='DEFLATE',LEVEL=6,
                    PREDICTOR=predictor,BLOCKSIZE=256,NUM_THREADS=1,
                    OVERVIEWS='NONE',BIGTIFF='IF_SAFER')
        with rasterio.open(pending) as dst:
            same_crs=(src.crs is None and dst.crs is None) or (src.crs is not None and dst.crs is not None and CRS(src.crs).equals(CRS(dst.crs),ignore_axis_order=True))
            if (src.width,src.height,src.dtypes,src.transform)!=(dst.width,dst.height,dst.dtypes,dst.transform) or not same_crs:
                raise RuntimeError('COG metadata differs from original')
            if dst.tags(ns='IMAGE_STRUCTURE').get('LAYOUT')!='COG':
                raise RuntimeError('Output lacks COG layout')
            # Every full-resolution pixel is checked, including NaNs and original masks.
            for _,window in dst.block_windows(1):
                if not np.array_equal(src.read(1,window=window),dst.read(1,window=window),equal_nan=True):
                    raise RuntimeError('Lossless pixel verification failed')
                if not np.array_equal(src.read_masks(1,window=window),dst.read_masks(1,window=window)):
                    raise RuntimeError('Mask verification failed')
    pending.replace(target)
    digest=hashlib.sha256()
    with target.open('rb') as file:
        for block in iter(lambda:file.read(8*1024*1024),b''): digest.update(block)
    result={'source_id':source['id'],'cloud_path':'cogs/'+target.name,
            'original_bytes':(root/source['path']).stat().st_size,'cog_bytes':target.stat().st_size,
            'sha256':digest.hexdigest(),'all_pixels_verified':True,'overviews':'none; scientific native pixels only'}
    write_json(report,result)
    if temporary: image.unlink()  # Only our intermediate, never an original.
    return result

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-root',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--source-id',action='append')
    parser.add_argument('--index',action='store_true')
    args=parser.parse_args()
    root=args.source_root.resolve(); out=args.output.resolve()
    if out==root: raise ValueError('Output must be separate from original dataset')
    (out/'cogs').mkdir(parents=True,exist_ok=True)
    data=json.loads((root/'moon-dataset.json').read_text())
    reports=[]
    try:
        for source in data['sources']:
            if source.get('role')!='elevation': continue
            if args.source_id and source['id'] not in args.source_id: continue
            print('Converting '+source['id'],flush=True)
            result=convert(source,root,out); reports.append(result)
            source['cloud_path']=result['cloud_path']
            if source['format']=='geotiff-metres':
                with rasterio.open(out/result['cloud_path']) as image:
                    source['cloud_metadata']={'crs_wkt':image.crs.to_wkt(),
                        'affine':list(image.transform)[:6],'width':image.width,'height':image.height}
            if source['id']=='SITE04-5M':
                source['cloud_quality']={}
                for field,name in [('height_uncertainty_rms_m','Site04_final_adj_5mpp_toterr.tif'),('lola_shot_count','Site04_final_adj_5mpp_ldec.tif')]:
                    quality={'id':field,'path':name,'format':'geotiff-metres'}
                    source['cloud_quality'][field]=convert(quality,root,out)['cloud_path']
            write_json(out/'conversion-status.json',{'state':'running','verified_sources':reports})
            published={**data,'sources':[s for s in data['sources'] if s.get('cloud_path')]}
            write_json(out/'moon-dataset.json',published)
        # A pilot includes only its verified sources; never pretend absent files exist.
        data['sources']=[s for s in data['sources'] if s.get('cloud_path')]
        data['cloud_storage']='lossless COG; original units, pixels, grid scheme and datum retained'
        write_json(out/'moon-dataset.json',data)
        if args.index:
            (out/'index').mkdir(exist_ok=True)
            with sqlite3.connect(f'file:{(root/"moon-grid-index.sqlite").as_posix()}?mode=ro',uri=True) as conn:
                current=None; rows={}
                for grid_id,record in conn.execute("SELECT grid_id,record_json FROM grids ORDER BY CASE WHEN grid_id LIKE 'MOON-%' THEN grid_id ELSE '0000'||grid_id END"):
                    name=grid_id.split('-C')[0] if grid_id.startswith('MOON-') else 'local'
                    if current is not None and current!=name:
                        write_json(out/'index'/f'{current}.json',rows); rows={}
                    current=name
                    rows[grid_id]=json.loads(record)
                if current is not None: write_json(out/'index'/f'{current}.json',rows)
        write_json(out/'conversion-status.json',{'state':'complete','verified_sources':reports,
                    'cog_bytes':sum(x['cog_bytes'] for x in reports)})
    except Exception as exc:
        write_json(out/'conversion-status.json',{'state':'stopped','error':str(exc),'verified_sources':reports})
        raise

if __name__=='__main__': main()
