"""Convert UTC to SPICE ET, including the 1961–1971 UTC drift era.

Drift coefficients: IERS UTC-TAI.history; SPICE kernels handle later leap seconds.
Call with SPICE kernels loaded and the process-wide SPICE lock held.
"""
from datetime import datetime, timedelta, timezone

import spiceypy


def historical_tai_minus_utc(utc: datetime) -> float | None:
    changes = [
        (1961, 1, 1.422818, 37300, .001296), (1961, 8, 1.372818, 37300, .001296),
        (1962, 1, 1.845858, 37665, .0011232), (1963, 11, 1.945858, 37665, .0011232),
        (1964, 1, 3.240130, 38761, .001296), (1964, 4, 3.340130, 38761, .001296),
        (1964, 9, 3.440130, 38761, .001296), (1965, 1, 3.540130, 38761, .001296),
        (1965, 3, 3.640130, 38761, .001296), (1965, 7, 3.740130, 38761, .001296),
        (1965, 9, 3.840130, 38761, .001296), (1966, 1, 4.313170, 39126, .002592),
        (1968, 2, 4.213170, 39126, .002592),
    ]
    if utc.tzinfo is None:
        raise ValueError('UTC time must include a timezone')
    utc = utc.astimezone(timezone.utc)
    if not 1961 <= utc.year < 1972:
        return None
    mjd = (utc - datetime(1858, 11, 17, tzinfo=timezone.utc)).total_seconds() / 86400
    _, _, base, reference, rate = next(row for row in reversed(changes) if (utc.year, utc.month) >= row[:2])
    return base + (mjd-reference)*rate


def utc_to_et(utc: datetime) -> float:
    if utc.tzinfo is None:
        raise ValueError('UTC time must include a timezone')
    utc = utc.astimezone(timezone.utc)
    offset = historical_tai_minus_utc(utc)
    if offset is None:
        return spiceypy.utc2et(utc.isoformat().replace('+00:00', 'Z'))
    tt = utc + timedelta(seconds=offset + 32.184)
    return spiceypy.str2et(tt.strftime('%Y-%m-%d %H:%M:%S.%f') + ' TDT')
