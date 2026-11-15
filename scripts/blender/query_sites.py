import urllib.request,json
sites=[('Apollo 11',0.67416,23.47314),('Apollo 14',-3.64589,-17.47194),('Apollo 15',26.13239,3.6333)]
for n,a,b in sites:
 d=json.load(urllib.request.urlopen('https://brahmos-lunar-browser.onrender.com/api/terrain/lookup?lat=%s&lon=%s'%(a,b)))
 print(n,d['grid_id'],d['terrain']['source_id'],d['terrain']['sample_spacing_x_m'],d['terrain']['elevation_m'],d['terrain']['source_url'])
