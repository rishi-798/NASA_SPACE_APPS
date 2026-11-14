"""Versioned lunar grid IDs, shared by API, catalogue and Blender.

Longitude is east-positive in [-180,180). Latitude is planetocentric.
This is an indexing grid, not a statement of DEM resolution or uncertainty.
"""
import math
import re

RADIUS_M = 1737400.0
SCHEME = 'moon-grid-v1'
LATITUDE_ROWS = math.ceil(math.pi * RADIUS_M / 10000)
SUBDIVISIONS = 10


def coordinates(latitude, longitude):
    if not (math.isfinite(latitude) and math.isfinite(longitude)):
        raise ValueError('Coordinates must be finite')
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise ValueError('Latitude must be [-90,90] and longitude [-180,180]')
    # A pole has a single position, regardless of supplied longitude.
    return latitude, 0.0 if abs(latitude) == 90 else (longitude + 180) % 360 - 180


def columns(row):
    if not 0 <= row < LATITUDE_ROWS:
        raise ValueError('Grid row out of range')
    middle = 90 - (row + .5) * 180 / LATITUDE_ROWS
    return max(1, math.ceil(2 * math.pi * RADIUS_M * math.cos(math.radians(middle)) / 10000))


def parent_bounds(row, column):
    count = columns(row)
    if not 0 <= column < count:
        raise ValueError('Grid column out of range')
    return {'north':90-row*180/LATITUDE_ROWS, 'south':90-(row+1)*180/LATITUDE_ROWS,
            'west':-180+column*360/count, 'east':-180+(column+1)*360/count}


def identify(latitude, longitude):
    latitude, longitude = coordinates(latitude, longitude)
    row = min(LATITUDE_ROWS-1, math.floor((90-latitude)*LATITUDE_ROWS/180))
    column = min(columns(row)-1, math.floor((longitude+180)*columns(row)/360))
    bounds = parent_bounds(row,column)
    child_row = min(9, math.floor((bounds['north']-latitude)/(bounds['north']-bounds['south'])*10))
    child_column = min(9, math.floor((longitude-bounds['west'])/(bounds['east']-bounds['west'])*10))
    parent = f'MOON-R{row:04d}-C{column:04d}'
    return {'parent_grid_id':parent, 'grid_id':f'{parent}-r{child_row}-c{child_column}',
            'scheme':SCHEME,'bounds':describe(f'{parent}-r{child_row}-c{child_column}')['bounds']}


def describe(grid_id):
    match = re.fullmatch(r'MOON-R(\d{4})-C(\d{4})(?:-r([0-9])-c([0-9]))?',grid_id)
    if not match:
        raise ValueError('Unknown global grid ID')
    row,column = map(int,match.group(1,2))
    bounds = parent_bounds(row,column)
    parent = f'MOON-R{row:04d}-C{column:04d}'
    if match[3] is not None:
        child_row,child_column = int(match[3]),int(match[4])
        dy=(bounds['north']-bounds['south'])/10
        dx=(bounds['east']-bounds['west'])/10
        bounds={'north':bounds['north']-child_row*dy,'south':bounds['north']-(child_row+1)*dy,
                'west':bounds['west']+child_column*dx,'east':bounds['west']+(child_column+1)*dx}
    return {'grid_id':grid_id,'parent_grid_id':parent,'bounds':bounds,'scheme':SCHEME,
            'child_grid_count':100 if match[3] is None else 0}


def site04_id(latitude,longitude):
    latitude,longitude=coordinates(latitude,longitude)
    if latitude > -89:
        return None
    rho=2*RADIUS_M*math.tan(math.radians(latitude+90)/2)
    x=rho*math.sin(math.radians(longitude))
    y=rho*math.cos(math.radians(longitude))
    # Numerical roundoff at exact kilometre boundaries must not move cells.
    x,y=round(x,7),round(y,7)
    if not (-9000 <= x < 7000 and -15000 < y <= 1000):
        return None
    column=math.floor((x+9000)/1000)
    row=math.floor((1000-y)/1000)
    return f'SITE04-{chr(65+column)}{row+1}'
