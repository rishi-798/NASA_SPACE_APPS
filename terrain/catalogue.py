"""Scientific terrain lookup. Original files are immutable; returned heights are metres.

Set LUNAR_DATASET_DIR to the directory containing the catalogue index.
Point-height sampling also requires moon-dataset.json and its original rasters.
No Earth EPSG CRS, smoothing, synthetic displacement or blind overlap averaging.
"""
import json
import math
import os
import requests
from pathlib import Path
import sqlite3
from functools import lru_cache
from contextlib import closing
from terrain import streaming

from terrain.grid_scheme import RADIUS_M, coordinates, describe, identify, site04_id


class TerrainUnavailable(RuntimeError):
    pass


def dataset_root():
    configured = os.environ.get('LUNAR_DATASET_DIR')
    project = Path(__file__).resolve().parents[1]
    bundled = project / 'data' / 'lunar'
    root = Path(configured) if configured else bundled if bundled.is_dir() else project
    if not root.is_dir():
        raise TerrainUnavailable('Set LUNAR_DATASET_DIR to the downloaded Moon dataset directory')
    return root


def manifest():
    path = dataset_root()/'moon-dataset.json'
    if not path.is_file():
        raise TerrainUnavailable('Point-height sampling requires moon-dataset.json and its original elevation rasters')
    return json.loads(path.read_text(encoding='utf-8'))


def source_ready(source):
    if streaming.ready(source, dataset_root()):
        return True
    path=dataset_root()/source['path']
    return path.exists() and (not source.get('expected_bytes') or path.stat().st_size == source['expected_bytes'])


@lru_cache(maxsize=32)
def _geotiff_info(path):
    import rasterio
    from pyproj import CRS, Transformer
    with rasterio.open(path) as image:
        crs=CRS.from_wkt(image.crs.to_wkt())
        transform=Transformer.from_crs(crs.geodetic_crs,crs,always_xy=True)
        return transform,image.transform,image.width,image.height


@lru_cache(maxsize=16)
def _mission_transform(wkt):
    from pyproj import CRS, Transformer
    crs=CRS.from_wkt(wkt)
    return Transformer.from_crs(crs.geodetic_crs,crs,always_xy=True)


def sample_source(source, latitude, longitude):
    """Nearest original pixel, not interpolated. Return None outside valid footprint."""
    import numpy as np
    latitude,longitude=coordinates(latitude,longitude)
    root=dataset_root()
    kind=source['format']
    if kind == 'sldem-float32':
        west,east=source['west'],source['east']
        lon=longitude%360
        if not (source['south'] <= latitude < source['north'] and west <= lon < east):
            return None
        # Southern tile edges belong to this tile; their nearest centre is its last row.
        row=min(15359,math.floor((source['north']-latitude)*512))
        col=math.floor((lon-west)*512)
        if source.get('cloud_path') and streaming.ready(source, root):
            z=float(streaming.read_pixel(source,root,row,col))*1000
        else:
            data=np.memmap(root/source['path'],dtype='<f4',mode='r',shape=(15360,23040))
            z=float(data[row,col])*1000
        spacing=math.pi*RADIUS_M/180/512
        pixel_latitude=source['north']-(row+.5)/512
        return _sample(z,source,row,col,spacing*math.cos(math.radians(pixel_latitude)),spacing)
    if kind == 'polar-float32':
        if source['pole']=='n' and latitude<60 or source['pole']=='s' and latitude>-60:
            return None
        rho=2*RADIUS_M*math.tan(math.radians(90-abs(latitude))/2)
        x=rho*math.sin(math.radians(longitude))
        y=rho*math.cos(math.radians(longitude))*(-1 if source['pole']=='n' else 1)
        col=math.floor(x/60+15520)
        row=math.floor(15520-y/60)
        if not (0<=row<31040 and 0<=col<31040):
            return None
        if source.get('cloud_path') and streaming.ready(source, root):
            height=float(streaming.read_pixel(source,root,row,col))
        else:
            data=np.memmap(root/source['path'],dtype='<f4',mode='r',shape=(31040,31040))
            height=float(data[row,col])
        ground_spacing=60*(1+math.sin(math.radians(abs(latitude))))/2
        result=_sample(height*1000,source,row,col,ground_spacing,ground_spacing)
        if result:
            result['projected_sample_spacing_m']=60
        return result
    if kind == 'lola-global-tiff':
        import rasterio
        from rasterio.windows import Window
        with rasterio.open(streaming.raster_path(source,root)) as image:
            col=min(image.width-1,math.floor((longitude+180)/360*image.width))
            row=min(image.height-1,math.floor((90-latitude)/180*image.height))
            z=float(image.read(1,window=Window(col,row,1,1))[0,0])*1000
            spacing=math.pi*RADIUS_M/180/64
            pixel_latitude=90-(row+.5)/64
            return _sample(z,source,row,col,spacing*math.cos(math.radians(pixel_latitude)),spacing)
    if kind == 'geotiff-metres':
        import rasterio
        from rasterio.windows import Window
        metadata=source.get('cloud_metadata')
        if metadata:
            from affine import Affine
            projector=_mission_transform(metadata['crs_wkt'])
            affine=Affine(*metadata['affine'])
            width,height=metadata['width'],metadata['height']
        else:
            projector,affine,width,height=_geotiff_info(streaming.raster_path(source,root))
        x,y=projector.transform(longitude,latitude)
        if not (math.isfinite(x) and math.isfinite(y)):
            return None
        col_float,row_float=(~affine)*(x,y)
        col,row=math.floor(col_float),math.floor(row_float)
        if not (0<=row<height and 0<=col<width):
            return None
        with rasterio.open(streaming.raster_path(source,root)) as image:
            # Derive the lunar geographic CRS from the source; never use Earth's EPSG:4326.
            z=image.read(1,window=Window(col,row,1,1),masked=True)[0,0]
            if np.ma.is_masked(z):
                return None
            result=_sample(float(z),source,row,col,abs(image.transform.a),abs(image.transform.e))
        if result and source['id']=='SITE04-5M':
            for field,path in [('height_uncertainty_rms_m','Site04_final_adj_5mpp_toterr.tif'),('lola_shot_count','Site04_final_adj_5mpp_ldec.tif')]:
                quality_path=source.get('cloud_quality',{}).get(field)
                quality_source={'path':path, 'cloud_path':quality_path} if quality_path else {'path':path}
                with rasterio.open(streaming.raster_path(quality_source,root)) as quality:
                    value=quality.read(1,window=Window(col,row,1,1),masked=True)[0,0]
                    result[field]=float(value) if not np.ma.is_masked(value) and np.isfinite(value) else None
        return result
    if kind == 'lunokhod1-native-crop-metres':
        # Existing SW-origin array, cropped from the native 512ppd product.
        center_row=int((60-38.315)*512)
        center_col=int(((-35.0081)%360-315)*512)
        row=math.floor((60-latitude)*512)-(center_row-10)
        col=math.floor((longitude%360-315)*512)-(center_col-12)
        if not (0<=row<21 and 0<=col<25):
            return None
        if source.get('cloud_path') and streaming.ready(source, root):
            height=float(streaming.read_pixel(source,root,row,col))
        else:
            data=np.load(root/source['path'],mmap_mode='r')
            height=float(data[20-row,col])
        spacing=math.pi*RADIUS_M/180/512
        return _sample(height,source,row,col,spacing*math.cos(math.radians(latitude)),spacing)
    raise ValueError('Unknown source format: '+kind)


def _sample(z,source,row,col,dx,dy):
    if not math.isfinite(z) or not -20000 < z < 20000:
        return None
    return {'elevation_m':z,'source_id':source['id'],'source_url':source['url'],
            'pixel_row':row,'pixel_column':col,'sample_spacing_x_m':dx,'sample_spacing_y_m':dy,
            'sampling':'nearest original pixel','vertical_reference_radius_m':RADIUS_M,
            'coordinate_frame':'ME/DE421','uncertainty':source.get('uncertainty','not supplied')}


def elevation(latitude,longitude):
    coordinates(latitude,longitude)
    data=manifest()
    for source in sorted(data['sources'],key=lambda item:item.get('priority',9999)):
        if source.get('role') != 'elevation' or not source_ready(source):
            continue
        try:
            result=sample_source(source,latitude,longitude)
        except (OSError, requests.RequestException) as exc:
            raise TerrainUnavailable('Terrain source could not be read: '+source['id']) from exc
        if result is not None:
            return result
    raise TerrainUnavailable('No downloaded valid elevation source covers this point')


def _catalogue_row(grid_id):
    path=dataset_root()/'moon-grid-index.sqlite'
    if not path.exists():
        if streaming.base_url():
            geometry=describe(grid_id) if grid_id.startswith('MOON-') else None
            shard=geometry['parent_grid_id'].split('-C')[0] if geometry else 'local'
            try:
                rows=streaming.index_shard(shard)
                if rows and grid_id in rows:
                    return rows[grid_id]
            except (OSError, ValueError, requests.RequestException) as exc:
                raise TerrainUnavailable('Remote grid catalogue is unavailable') from exc
            raise ValueError('Unknown grid ID')
        raise TerrainUnavailable('Moon grid index has not been built')
    with closing(sqlite3.connect(f'file:{path.as_posix()}?mode=ro',uri=True)) as connection:
        row=connection.execute('SELECT record_json FROM grids WHERE grid_id=?',(grid_id,)).fetchone()
    if row is None:
        raise ValueError('Unknown grid ID')
    return json.loads(row[0])


def grid_record(grid_id):
    if grid_id.startswith('MOON-'):
        geometry=describe(grid_id)
        parent=_catalogue_row(geometry['parent_grid_id'])
        # Parent summaries are NOT invented child summaries.
        return {**geometry,'parent_statistics':parent,'blender_object_name':grid_id,
                'scene_build_state':'not generated' if '-r' in grid_id else 'catalogue only'}
    return _catalogue_row(grid_id)


def selection_grid_id(latitude,longitude,data):
    """Resolve a scene footprint without requiring its raster or exported GLB."""
    local=site04_id(latitude,longitude)
    if local is None:
        # Use the exact existing scene footprint, not the full surrounding DTM.
        for mission in data.get('existing_mission_scenes',[]):
            if mission['id']=='lunokhod-1':
                dx=math.pi*RADIUS_M/180*math.cos(math.radians(mission['latitude']))*(longitude-mission['longitude'])
                dy=math.pi*RADIUS_M/180*(latitude-mission['latitude'])
                inside=abs(dx)<=12*mission['spacing_x_m'] and abs(dy)<=10*mission['spacing_y_m']
            else:
                x,y=_mission_transform(mission['crs_wkt']).transform(longitude,latitude)
                ox,oy=mission['origin_xy_m']
                inside=ox<=x<=ox+1000 and oy<=y<=oy+1000
            if inside:
                local='MISSION-'+mission['id'].upper()
                break
    return local or identify(latitude,longitude)['grid_id']


def catalogue_selection(latitude,longitude):
    """CSV summaries are regional statistics, never point-height measurements."""
    latitude,longitude=coordinates(latitude,longitude)
    cell=identify(latitude,longitude)
    try:
        data=manifest()
    except TerrainUnavailable:
        data={}
    grid_id=selection_grid_id(latitude,longitude,data)
    record=grid_record(grid_id)
    statistics=record.get('parent_statistics',record)
    # File presence is checked locally; upstream 'downloaded' flags are ignored.
    sources=data.get('sources',[])
    elevation_sources=[s for s in sources if s.get('role')=='elevation']
    point_terrain = None
    point_note = None
    try:
        point_terrain = elevation(latitude, longitude)
    except TerrainUnavailable as exc:
        point_note = str(exc)
    return {'latitude':latitude,'longitude':longitude,'grid_id':grid_id,
            'global_child_grid_id':cell['grid_id'],'global_parent_grid_id':cell['parent_grid_id'],
            'bounds':cell['bounds'],'blender_object_name':grid_id,
            'statistics_grid_id':statistics['grid_id'],
            'statistics_scope':'parent grid (about 10 km)' if 'parent_statistics' in record else 'catalogued local region',
            'statistics':{key:statistics.get(key) for key in (
                'elevation_min_m','elevation_max_m','elevation_mean_m','source_resolution_m',
                'terrain_source','source_url','coordinate_frame','vertical_reference_radius_m',
                'native_elevation_min_m','native_elevation_max_m','native_elevation_mean_m',
                'native_statistics_spacing_m','native_statistics_source_ids','native_statistics_scope',
                'height_uncertainty_rms_m_median','height_uncertainty_rms_m_p95')},
            'point_elevation_m':point_terrain['elevation_m'] if point_terrain else None,
            'point_terrain':point_terrain,'point_elevation_note':point_note,'scene_available':False,
            'local_elevation_files':sum(source_ready(s) for s in elevation_sources),
            'expected_elevation_files':len(elevation_sources),
            'note':'Regional summaries and original-pixel point heights are separate. No local mesh or landing-safety claim.'}


def lookup(latitude,longitude):
    latitude,longitude=coordinates(latitude,longitude)
    global_cell=identify(latitude,longitude)
    grid_id=selection_grid_id(latitude,longitude,manifest())
    result=grid_record(grid_id)
    height=elevation(latitude,longitude)
    return {'grid_id':grid_id,'global_parent_grid_id':global_cell['parent_grid_id'],
            'global_child_grid_id':global_cell['grid_id'],'latitude':latitude,'longitude':longitude,
            'grid':result,'terrain':height,'blender_object_name':grid_id,
            'scene_build_state':result.get('scene_build_state','not generated'),
            'lighting_state':'Sun/Earth ephemerides must be supplied separately',
            'cosmetic_details_affect_scientific_terrain':False}
