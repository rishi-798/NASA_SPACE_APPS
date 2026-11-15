"""Export four unsmoothed Site04 source-pixel meshes in local ENU metres.

Usage: python scripts/blender/build_site04_glb.py SOURCE.tif OUTPUT_DIR
Requires numpy and rasterio. Outputs are Z-up GLB candidates, not standard
glTF Y-up assets; consumers must apply the documented axis conversion.
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

R = 1737400.0


def fixed(x, y, height):
    rho = np.hypot(x, y)
    lat = -np.pi / 2 + 2 * np.arctan(rho / (2 * R))
    lon = np.arctan2(x, y)
    radius = R + height
    return np.stack((radius*np.cos(lat)*np.cos(lon), radius*np.cos(lat)*np.sin(lon), radius*np.sin(lat)), axis=-1)


def write_glb(path, xyz, indices):
    positions = np.asarray(xyz, dtype='<f4').tobytes()
    triangles = np.asarray(indices, dtype='<u4').tobytes()
    lo, hi = xyz.min(axis=0).tolist(), xyz.max(axis=0).tolist()
    gltf = {'asset': {'version': '2.0', 'generator': 'Site04 DEM direct export; local ENU Z-up'},
            'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
            'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1, 'mode': 4}]}],
            'buffers': [{'byteLength': len(positions)+len(triangles)}],
            'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(positions), 'target': 34962},
                            {'buffer': 0, 'byteOffset': len(positions), 'byteLength': len(triangles), 'target': 34963}],
            'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': len(xyz), 'type': 'VEC3', 'min': lo, 'max': hi},
                          {'bufferView': 1, 'componentType': 5125, 'count': indices.size, 'type': 'SCALAR'}]}
    doc = json.dumps(gltf, separators=(',', ':')).encode()
    doc += b' ' * (-len(doc) % 4)
    length = 12 + 8 + len(doc) + 8 + len(positions) + len(triangles)
    with path.open('wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, length))
        f.write(struct.pack('<I4s', len(doc), b'JSON')); f.write(doc)
        f.write(struct.pack('<I4s', len(positions)+len(triangles), b'BIN\0'))
        f.write(positions); f.write(triangles)


def main(source, out):
    out.mkdir(parents=True, exist_ok=True)
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    with rasterio.open(source) as ds:
        if (ds.width, ds.height) != (3200, 3200) or ds.transform.a != 5 or ds.transform.e != -5:
            raise ValueError('Unexpected source DEM dimensions or pixel spacing')
        for name, row0, col0 in [('A', 0, 0), ('B', 1600, 0), ('C', 0, 1600), ('D', 1600, 1600)]:
            # Shared pixel-center edges at row/column 1600 ensure no seams.
            rows = min(1601, ds.height-row0); cols = min(1601, ds.width-col0)
            h = ds.read(1, window=Window(col0, row0, cols, rows)).astype(np.float64)
            if not np.isfinite(h).all():
                raise ValueError(f'{name}: source contains missing heights')
            x = ds.transform.c + (np.arange(col0, col0+cols) + .5) * 5
            y = ds.transform.f - (np.arange(row0, row0+rows) + .5) * 5
            xx, yy = np.meshgrid(x, y)
            x0, y0 = float((x[0]+x[-1])/2), float((y[0]+y[-1])/2)
            lat = -math.pi/2 + 2*math.atan(math.hypot(x0,y0)/(2*R))
            lon = math.atan2(x0,y0)
            east = np.array([-math.sin(lon), math.cos(lon), 0.0])
            north = np.array([-math.sin(lat)*math.cos(lon), -math.sin(lat)*math.sin(lon), math.cos(lat)])
            up = np.cross(east, north)
            basis = np.column_stack((east, north, up))
            origin = up*R
            xyz = ((fixed(xx, yy, h) - origin) @ basis).reshape(-1, 3).astype(np.float32)
            a = np.arange((rows-1)*(cols-1), dtype=np.uint32).reshape(rows-1, cols-1)
            a += np.arange(rows-1, dtype=np.uint32)[:, None]
            tri = np.stack((a, a+cols, a+cols+1, a, a+cols+1, a+1), axis=-1).reshape(-1,3)
            v = xyz[tri[0]]
            if np.cross(v[1]-v[0],v[2]-v[0])[2] < 0:
                tri[:, [1, 2]] = tri[:, [2, 1]]
            path = out / f'Site04 - Grid block {name} - Measured terrain candidate.glb'
            write_glb(path, xyz, tri)
            matrix = np.eye(4); matrix[:3,:3] = basis; matrix[:3,3] = origin
            meta = {'region_id': f'SITE04-BLOCK-{name}', 'production_ready': False,
                    'source': 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif',
                    'source_sha256': sha, 'source_frame': 'MOON_ME/DE421', 'source_resolution_m': 5,
                    'source_pixel_window': {'row_start': row0, 'column_start': col0, 'rows': rows, 'columns': cols},
                    'anchor': {'latitude_planetocentric_deg': math.degrees(lat), 'longitude_east_deg': math.degrees(lon)},
                    'anchor_sample_height_m': float(h[rows//2, cols//2]),
                    'anchor_sample_note': 'Nearest central source pixel; its center may be up to half a pixel from the anchor in each projected axis.',
                    'vertical_reference_radius_m': R, 'local_axes': {'x':'east','y':'north','z':'up'},
                    'local_to_moon_fixed_matrix_row_major': matrix.tolist(), 'mesh_units':'m',
                    'source_height_range_m':[float(h.min()), float(h.max())], 'vertex_count':len(xyz),
                    'triangle_count':len(tri), 'glb':path.name, 'glb_bytes':path.stat().st_size,
                    'axis_convention':'Raw local Z-up; standard glTF viewers expect Y-up and require explicit rotation.',
                    'geometry':'one vertex per original source pixel center, no smoothing or synthetic displacement',
                    'limitations':['Scientific GLB candidate; viewer placement and browser performance unverified.',
                                   'No normals are stored: Cesium 1.145 falls back to unlit material; viewer-side flat normals or another shading solution is required.',
                                   'Adjacent blocks share pixel centers; verify converted edge agreement.',
                                   'Source DEM is interpolated; 5 m pixels do not imply independent 5 m measurements.']}
            (out / f'Site04 block {name} measured terrain metadata.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
            print(json.dumps({'block':name,'vertices':len(xyz),'triangles':len(tri),'bytes':path.stat().st_size}),flush=True)


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
