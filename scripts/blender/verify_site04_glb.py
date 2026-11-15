"""Validate Site04 GLB positions against the source DEM and shared boundaries."""
import json
import struct
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.warp import transform

R = 1737400.0
source, out = map(Path, sys.argv[1:3])
results, edges = [], {}
with rasterio.open(source) as ds:
    # Independent projection check of the inverse spherical formula at controls.
    xs, ys = [-9000., -2500., 7000.], [1000., -5500., -15000.]
    lon_ref, lat_ref = transform(ds.crs, ds.crs.geodetic_crs, xs, ys)
    lon = np.degrees(np.arctan2(xs, ys))
    lat = np.degrees(-np.pi/2 + 2*np.arctan(np.hypot(xs,ys)/(2*R)))
    projection_error = float(max(np.max(np.abs(lon-np.array(lon_ref))), np.max(np.abs(lat-np.array(lat_ref)))))
    assert projection_error < 1e-8, projection_error
    for name in 'ABCD':
        meta = json.loads((out / f'Site04 block {name} measured terrain metadata.json').read_text(encoding='utf-8'))
        path = out / meta['glb']
        with path.open('rb') as f:
            magic, version, length = struct.unpack('<4sII',f.read(12))
            json_len, chunk = struct.unpack('<I4s',f.read(8))
            doc = json.loads(f.read(json_len))
            bin_len, bin_tag = struct.unpack('<I4s', f.read(8))
            offset = f.tell()
        assert magic == b'glTF' and version == 2 and length == path.stat().st_size and bin_tag == b'BIN\0'
        info = meta['source_pixel_window']; rows, cols = info['rows'], info['columns']
        count = rows*cols
        assert doc['accessors'][0]['count'] == count
        vertices = np.memmap(path, dtype='<f4',mode='r',offset=offset,shape=(count,3)).astype(np.float64)
        triangle_count = 2*(rows-1)*(cols-1)
        assert doc['accessors'][1]['count'] == 3*triangle_count
        index_offset = offset + doc['bufferViews'][1]['byteOffset']
        indices = np.memmap(path, dtype='<u4', mode='r', offset=index_offset, shape=(triangle_count, 3))
        assert int(indices.max()) < count
        cell = np.arange((rows-1)*(cols-1),dtype=np.uint32).reshape(rows-1,cols-1)
        cell += np.arange(rows-1,dtype=np.uint32)[:,None]
        expected = np.stack((cell,cell+cols,cell+cols+1,cell,cell+cols+1,cell+1),axis=-1).reshape(-1,3)
        actual_sorted = np.sort(indices,axis=1)
        assert np.array_equal(actual_sorted,np.sort(expected,axis=1)), name
        for start in range(0, triangle_count, 200000):
            tri = vertices[indices[start:start+200000]]
            normals = np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
            radial = tri.mean(axis=1)
            radial[:,2] += R
            assert np.all(np.einsum('ij,ij->i',normals,radial)>0), f'{name}: inward or degenerate triangle'
        matrix = np.array(meta['local_to_moon_fixed_matrix_row_major'])
        basis = matrix[:3,:3]
        assert np.allclose(basis.T @ basis, np.eye(3), atol=1e-10) and abs(np.linalg.det(basis)-1)<1e-10
        fixed = vertices @ basis.T + matrix[:3,3]
        radius = np.linalg.norm(fixed,axis=1)
        heights = ds.read(1,window=Window(info['column_start'],info['row_start'],cols,rows)).reshape(-1)
        height_error = float(np.max(np.abs(radius-R-heights)))
        assert height_error < .01, (name,height_error)
        lat_actual = np.arcsin(fixed[:,2]/radius)
        lon_actual = np.arctan2(fixed[:,1],fixed[:,0])
        rho = 2*R*np.tan((lat_actual+np.pi/2)/2)
        x, y = rho*np.sin(lon_actual), rho*np.cos(lon_actual)
        expected_x = np.tile(ds.transform.c+(np.arange(info['column_start'],info['column_start']+cols)+.5)*5,rows)
        expected_y = np.repeat(ds.transform.f-(np.arange(info['row_start'],info['row_start']+rows)+.5)*5,cols)
        xy_error = float(max(np.max(np.abs(x-expected_x)),np.max(np.abs(y-expected_y))))
        assert xy_error < .01, (name,xy_error)
        grid = fixed.reshape(rows,cols,3)
        edges[name] = {'north':grid[0].copy(),'south':grid[-1].copy(),'west':grid[:,0].copy(),'east':grid[:,-1].copy()}
        results.append({'block':name,'vertices_checked':count,'triangles_checked':triangle_count,'all_triangle_normals_outward':True,'max_height_error_m':height_error,'max_projected_error_m':xy_error})
    joins=[]
    for a, side_a, b, side_b in [('A','south','B','north'),('A','east','C','west'),('B','east','D','west'),('C','south','D','north')]:
        error=float(np.max(np.linalg.norm(edges[a][side_a]-edges[b][side_b],axis=1)))
        assert error < .01,(a,b,error)
        joins.append({'blocks':[a,b],'max_moon_fixed_gap_m':error})
report={'projection_control_max_error_deg':projection_error,'blocks':results,'joins':joins,
        'scope':'Every GLB position checked against DEM pixel location and height; every triangle checked for grid connectivity and outward radial orientation; four shared block edges checked in Moon-fixed coordinates. Does not validate lighting, rendering, glTF client interpretation or production integration.'}
(out/'Site04 GLB source and alignment verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
