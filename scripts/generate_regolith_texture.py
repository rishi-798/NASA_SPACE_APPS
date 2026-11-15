"""Generate an illustrative, seamless lunar regolith material; no terrain heights are changed."""
from pathlib import Path
import numpy as np
from PIL import Image

SIZE = 1024
METERS = 24.0
rng = np.random.default_rng(19690720)
frequencies = np.fft.fftfreq(SIZE)
fy, fx = np.meshgrid(frequencies, frequencies, indexing='ij')
freq2 = fx * fx + fy * fy

def noise(sigma, amplitude):
    field = np.fft.ifft2(np.fft.fft2(rng.standard_normal((SIZE, SIZE))) *
                         np.exp(-2 * np.pi**2 * sigma**2 * freq2)).real
    return field / field.std() * amplitude

# Broad weathered undulations, finer dust, and shallow overlapping depressions.
height = noise(60, .018) + noise(22, .012) + noise(6, .005) + noise(1.5, .0015)
y, x = np.mgrid[:SIZE, :SIZE]
for _ in range(75):
    cx, cy = rng.uniform(0, SIZE, 2)
    radius = rng.uniform(12, 54) ** 1.05
    dx = (x - cx + SIZE / 2) % SIZE - SIZE / 2
    dy = (y - cy + SIZE / 2) % SIZE - SIZE / 2
    angle = rng.uniform(0, np.pi)
    major = (dx * np.cos(angle) + dy * np.sin(angle)) / rng.uniform(.85, 1.2)
    minor = -dx * np.sin(angle) + dy * np.cos(angle)
    r = np.sqrt(major**2 + minor**2) / radius
    depth = rng.uniform(.008, .045)
    height += -depth * np.exp(-r*r*2.5) + depth * .20 * np.exp(-((r - 1.0) / .25)**2)

# Normals encode apparent slopes only, without altering the elevation mesh.
step = METERS / SIZE
nx = -(np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * step)
ny = -(np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * step)
length = np.sqrt(nx*nx + ny*ny + 1)
normal = np.stack((nx / length, ny / length, 1 / length), axis=-1)
image = np.uint8(np.clip((normal * .5 + .5) * 255, 0, 255))
root = Path(__file__).resolve().parents[1]
Image.fromarray(image, 'RGB').save(root / 'frontend/public/terrain/lunar-regolith-normal.png', optimize=True)
