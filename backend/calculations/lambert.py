"""Bounded universal-variable Lambert solver: short-way, zero revolutions only.

Distances km, times seconds, mu km^3/s^2. The first universal-variable branch
z < 4*pi^2 excludes multiple revolutions. No ephemerides or rendering live here.
"""
import math
import numpy as np


class TransferError(ValueError):
    pass


def stumpff(z):
    if abs(z) < 1e-5:
        return 0.5-z/24+z*z/720-z**3/40320, 1/6-z/120+z*z/5040-z**3/362880
    if z > 0:
        q = math.sqrt(z)
        return (1-math.cos(q))/z, (q-math.sin(q))/q**3
    q = math.sqrt(-z)
    return (math.cosh(q)-1)/(-z), (math.sinh(q)-q)/q**3


def solve_lambert(r1, r2, seconds, mu):
    r1, r2 = np.asarray(r1, dtype=float), np.asarray(r2, dtype=float)
    if r1.shape != (3,) or r2.shape != (3,) or not np.isfinite([*r1, *r2, seconds, mu]).all():
        raise TransferError('Lambert inputs must be finite three-vectors and scalars.')
    n1, n2 = float(np.linalg.norm(r1)), float(np.linalg.norm(r2))
    if min(n1, n2, seconds, mu) <= 0:
        raise TransferError('Lambert radii, duration and gravitational parameter must be positive.')
    cosine = float(np.clip(np.dot(r1, r2)/(n1*n2), -1, 1))
    sine = float(np.linalg.norm(np.cross(r1, r2))/(n1*n2))
    if sine < 1e-8:
        raise TransferError('Collinear endpoints are singular for this Lambert branch.')
    a = sine * math.sqrt(n1*n2/(1-cosine))

    def evaluate(z):
        c, s = stumpff(z)
        if c <= 0:
            return None
        y = n1+n2+a*(z*s-1)/math.sqrt(c)
        if y < 0:
            return None
        t = ((y/c)**1.5*s+a*math.sqrt(y))/math.sqrt(mu)
        return t, y

    previous = None
    bracket = None
    # A fixed scan and fixed bisection bound cap runtime, including nonconvergence.
    for z in np.linspace(-4*math.pi**2+1e-6, 4*math.pi**2-1e-6, 500):
        result = evaluate(float(z))
        if result is None:
            continue
        residual = result[0]-seconds
        if previous and previous[1] <= 0 <= residual:
            bracket = (previous[0], float(z))
            break
        previous = (float(z), residual)
    if bracket is None:
        raise TransferError('No bracketed zero-revolution solution for these endpoints and dates.')
    low, high = bracket
    for iteration in range(80):
        z = (low+high)/2
        result = evaluate(z)
        if result is None:
            raise TransferError('Lambert iteration left its valid branch.')
        residual = result[0]-seconds
        if abs(residual) < 1e-6:
            break
        if residual < 0:
            low = z
        else:
            high = z
    else:
        raise TransferError('Lambert solver did not converge within 80 iterations.')
    y = result[1]
    f, g, gdot = 1-y/n1, a*math.sqrt(y/mu), 1-y/n2
    if abs(g) < 1e-10:
        raise TransferError('Lambert velocity reconstruction is singular.')
    v1, v2 = (r2-f*r1)/g, (gdot*r2-r1)/g
    if not np.isfinite([*v1, *v2]).all():
        raise TransferError('Lambert solution produced non-finite velocities.')
    return v1, v2, {'iterations': iteration+1, 'time_residual_seconds': abs(residual)}


def minimum_transfer_radius(r1, v1, r2, v2, mu):
    """Analytic minimum on a short-way arc; a periapsis occurs if radial v turns +."""
    n1, n2 = np.linalg.norm(r1), np.linalg.norm(r2)
    if np.dot(r1, v1) < 0 < np.dot(r2, v2):
        h = np.cross(r1, v1)
        e = np.linalg.norm(np.cross(v1, h)/mu-r1/n1)
        return float(np.dot(h, h)/(mu*(1+e)))
    return float(min(n1, n2))
