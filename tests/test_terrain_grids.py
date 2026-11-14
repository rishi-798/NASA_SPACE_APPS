import math, random
import pytest
from terrain.grid_scheme import RADIUS_M, LATITUDE_ROWS, columns, describe, identify, site04_id


def test_all_parent_centers_round_trip_and_cover_longitudes():
    for row in range(LATITUDE_ROWS):
        first=describe(f'MOON-R{row:04d}-C0000')['bounds']
        last=describe(f'MOON-R{row:04d}-C{columns(row)-1:04d}')['bounds']
        assert first['west']==-180
        assert last['east']==180
        for col in (0,columns(row)//2,columns(row)-1):
            gid=f'MOON-R{row:04d}-C{col:04d}'
            b=describe(gid)['bounds']
            assert identify((b['north']+b['south'])/2,(b['west']+b['east'])/2)['parent_grid_id']==gid


def test_poles_antimeridian_and_every_point_has_a_child():
    for pole in (-90,90):
        assert len({identify(pole,lon)['grid_id'] for lon in (-180,-90,0,90,180)})==1
    for lat in (-89,-60,0,60,89):
        assert identify(lat,-180)==identify(lat,180)
    rng=random.Random(42)
    for _ in range(10000):
        lat,lon=rng.uniform(-90,90),rng.uniform(-180,180)
        b=identify(lat,lon)['bounds']
        assert b['south']-1e-12<=lat<=b['north']+1e-12
        assert b['west']-1e-12<=lon<=b['east']+1e-12


def test_all_256_legacy_cells_keep_their_ids():
    for row in range(16):
        for col in range(16):
            x=-8500+col*1000
            y=500-row*1000
            lat=-90+math.degrees(2*math.atan(math.hypot(x,y)/(2*RADIUS_M)))
            lon=math.degrees(math.atan2(x,y))
            assert site04_id(lat,lon)==f'SITE04-{chr(65+col)}{row+1}'


@pytest.mark.parametrize('lat,lon',[(91,0),(0,181),(float('nan'),0),(0,float('inf'))])
def test_invalid_coordinates_rejected(lat,lon):
    with pytest.raises(ValueError):
        identify(lat,lon)


@pytest.mark.parametrize('gid',['MOON-R9999-C0000','MOON-R0000-C9999','MOON-R0000-C0000-r10-c0','G7'])
def test_bad_global_ids_rejected(gid):
    with pytest.raises(ValueError):
        describe(gid)


def test_terrain_api_returns_shared_identity(monkeypatch):
    from fastapi.testclient import TestClient
    from backend.app import app
    expected={'grid_id':'SITE04-G7','blender_object_name':'SITE04-G7'}
    monkeypatch.setattr('backend.terrain_api.lookup',lambda lat,lon:expected)
    client=TestClient(app)
    assert client.get('/api/terrain/lookup?lat=-89.8&lon=-155').json()==expected
    assert client.get('/api/terrain/lookup?lat=91&lon=0').status_code==422


def test_missing_terrain_returns_503_and_unknown_grid_returns_404(monkeypatch):
    from fastapi.testclient import TestClient
    from backend.app import app
    from terrain.catalogue import TerrainUnavailable
    def unavailable(*args):raise TerrainUnavailable('Dataset not downloaded')
    def unknown(*args):raise ValueError('Unknown grid ID')
    monkeypatch.setattr('backend.terrain_api.lookup',unavailable)
    monkeypatch.setattr('backend.terrain_api.grid_record',unknown)
    client=TestClient(app)
    assert client.get('/api/terrain/lookup?lat=0&lon=0').status_code==503
    assert client.get('/api/terrain/grids/missing').status_code==404


@pytest.mark.parametrize('south,north',[(0,30),(30,60),(-30,0),(-60,-30)])
def test_native_tile_southern_edge_uses_last_pixel_not_out_of_bounds(monkeypatch,tmp_path,south,north):
    import numpy as np
    from terrain.catalogue import sample_source
    class NativePixels:
        def __getitem__(self,index):
            row,col=index
            assert 0<=row<15360 and 0<=col<23040
            return np.float32(1.25)
    monkeypatch.setattr('terrain.catalogue.dataset_root',lambda:tmp_path)
    monkeypatch.setattr(np,'memmap',lambda *args,**kwargs:NativePixels())
    source={'id':'native','format':'sldem-float32','south':south,'north':north,
            'west':0,'east':45,'path':'native.img','url':'https://example.test/source'}
    value=sample_source(source,south,0)
    assert value['pixel_row']==15359
    assert value['elevation_m']==1250


def test_grid_lookup_releases_database_for_dataset_updates(monkeypatch,tmp_path):
    import sqlite3
    from terrain.catalogue import _catalogue_row
    path=tmp_path/'moon-grid-index.sqlite'
    connection=sqlite3.connect(path)
    connection.execute('CREATE TABLE grids (grid_id TEXT, record_json TEXT)')
    connection.execute('INSERT INTO grids VALUES (?,?)',('SITE04-G7','{"grid_id":"SITE04-G7"}'))
    connection.commit()
    connection.close()
    connect=sqlite3.connect
    retained=[]
    def observed_connect(*args,**kwargs):
        connection=connect(*args,**kwargs)
        retained.append(connection)
        return connection
    monkeypatch.setattr('terrain.catalogue.dataset_root',lambda:tmp_path)
    monkeypatch.setattr(sqlite3,'connect',observed_connect)
    assert _catalogue_row('SITE04-G7')['grid_id']=='SITE04-G7'
    with pytest.raises(sqlite3.ProgrammingError):
        retained[0].execute('SELECT 1')


def test_catalogue_metadata_is_available_without_raster_manifest(monkeypatch,tmp_path):
    import sqlite3
    from fastapi.testclient import TestClient
    from backend.app import app
    with sqlite3.connect(tmp_path/'moon-grid-index.sqlite') as connection:
        connection.execute('CREATE TABLE grids (grid_id TEXT PRIMARY KEY, record_json TEXT)')
        connection.execute('INSERT INTO grids VALUES (?,?)',
                           ('SITE04-G7','{"grid_id":"SITE04-G7"}'))
    monkeypatch.setenv('LUNAR_DATASET_DIR',str(tmp_path))
    client=TestClient(app)
    response=client.get('/api/terrain/grids/SITE04-G7')
    assert response.status_code==200
    assert response.json()['grid_id']=='SITE04-G7'
    response=client.get('/api/terrain/lookup?lat=0&lon=0')
    assert response.status_code==503
    assert 'moon-dataset.json' in response.json()['detail']
