# Validation against real CLPS landings

Do this backend's Sun and Earth predictions line up with what actually happened to the
Intuitive Machines landers Odysseus (IM-1, 2024) and Athena (IM-2, 2025)?

The short answer has two parts:
- **At site scale, the predictions match.** The coordinates agree with the LOLA elevation map to within 15 m, and both
  missions' plans fit inside the sunlit periods the model predicts.
- **Both landers lost power while the model says their sites were still in sunlight.** Both came to rest on their
  sides; Athena lay in a crater far smaller than the terrain map can resolve. This is exactly why the app says
  visibility does not, by itself, prove adequate power.

Reproduce everything below with:

```bash
python -m scripts.fetch_lola_dem        # once: local copy of the LOLA 80 S DEM (189 MB)
python -m scripts.validate_missions     # about 2 s; add --json docs/validation/missions.json to save the numbers
```

All numbers come from this backend: SPICE geometry, Athena's saved LOLA profile, and the LOLA profile generator
for Odysseus. Crossings are refined to 1 minute. The tests lock them in (`tests/test_mission_validation.py`).

## Odysseus (IM-1): 80.13° S, 1.44° E

| | |
|---|---|
| Landed | about 23:23 UTC, 22 Feb 2024 |
| Reported end | went dormant on 29 Feb 2024, entering lunar night; final image received that day |
| Reported condition | on its side, in a small degraded crater with a 12° slope. On 26 Feb operators said they would collect data "until sunlight no longer shines on the solar panels", expected "Tuesday morning" (27 Feb) "based on the position of Earth and the moon", which was "two to three days short" of plan |
| LOLA elevation at the published coordinates | **2,594 m** (published: about 2,579 m) |
| Terrain sunset at the site (LOLA) | **14:14 UTC, 2 Mar 2024**, behind 1.5° terrain at azimuth 273°. That is 8.6 days of direct sunlight after landing |
| Flat-horizon sunset | 07:13 UTC, 3 Mar 2024 (about 17 h later) |
| Maximum Sun elevation per day | 10.9° (23 Feb) → 9.5° (27 Feb) → 6.6° (29 Feb) → 2.7° (2 Mar) |
| Earth | above the flat horizon throughout (6.8° minimum on 29 Feb) |

**What this shows**
- The published position lands on terrain 15 m from the published elevation. That independently checks the
  coordinates, the lunar frame, and how the map's elevation values are read.
- The original plan (about 29 Feb–1 Mar) ends before the predicted site sunset (2 Mar), and the shortened end
  (27 Feb) ends earlier still. Both are consistent with the model.
- The Sun was still 6.6° up on the day Odysseus went dormant, and terrain did not block it. The loss of power came
  2½–3½ days before site sunset. It is consistent with a tipped lander whose panels received less and less light
  as the Sun sank, which is the reason operators gave.

**What it does not show:** the backend does not model solar-panel power, so it cannot predict the dormancy date.

**Terrain caveat:** Odysseus is only 4 km inside the map's edge. The generator therefore refuses a full 40 km
horizon ("DEM coverage does not reach 40000 m in every azimuth"), and it now refuses that instead of silently
truncating. The validation builds a partial horizon and uses it only for azimuths whose terrain reaches the full
40 km, 82.5°–274.5°, which includes the western sunset. Northern azimuths, where Earth sits, are not
terrain-checked beyond about 4–6 km.

## Athena (IM-2): 84.79° S, 29.20° E (LROC: 84.7906° S, 29.1957° E)

| | |
|---|---|
| Landed | about 17:30 UTC, 6 Mar 2025 (sources differ by a few minutes) |
| Reported end | 06:15 UTC, 7 Mar 2025: about 12 h 45 min on the surface, against 10 days planned |
| Reported condition | on its side in a crater about 20 m across (LROC), "where sunlight could not reach the solar cells". The company cited the Sun's direction, the solar-panel orientation and the cold in the crater |
| Sun during those 12¾ h | **2.5–3.0° up, at least 1.6° above the LOLA terrain horizon**, visible in every sample |
| Earth during those 12¾ h | visible in every sample |
| Shadow cast by 1 m of relief at that Sun height | **19–23 m** on level ground |
| Predicted terrain sunset | 17:44 UTC, 19 Mar 2025: **13.0 days** after landing. The elevated site sets 6 h after the flat horizon |

**What this shows**
- The planned 10 days fit inside the 13-day sunlit period the model predicts.
- At the scale of the 80 m terrain map, the site was sunlit and in view of Earth. A tool that stopped at site-scale
  visibility would have reported this site as fine.
- Athena's crater is about 20 m across: smaller than one map pixel, and inside the 160 m the horizon deliberately
  excludes. With the Sun only 2.5–3° up, relief just 1 m high shades 19–23 m of ground. A crater rim that small can
  therefore keep a 20 m crater floor dark while the surrounding site is sunlit. That is consistent with the
  reported cause, though the model cannot confirm it.

**Lesson:** the visibility analysis was right at site scale, and it still could not see what ended the mission.
Metre-scale terrain, lander orientation and a power model are separate problems. That is why every response says:
*"Visibility does not by itself prove adequate power, a working communications link, or a safe landing."*

## Sources

- Odysseus position and elevation: LROC, https://www.lroc.asu.edu/images/1360
- Odysseus timeline: AP via PBS NewsHour (26 Feb 2024),
  https://www.pbs.org/newshour/amp/science/private-u-s-lunar-lander-to-cease-operations-tuesday-after-landing-sideways ;
  Universe Today, https://www.universetoday.com/articles/lunar-night-permanently-ends-the-odysseus-mission ;
  Reuters via BusinessDay,
  https://www.businessday.co.za/bd/world/2024-03-01-us-moon-lander-odysseus-goes-dark-a-week-after-hard-soft-landing/
- Athena position and crater: LROC, https://lroc.im-ldi.com/images/1408
- Athena timeline and cause: SpacePolicyOnline, https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/ ;
  Spaceflight Now, https://spaceflightnow.com/2025/03/07/intuitive-machines-im-2-mission-ends-with-lander-on-its-side-on-the-moon/
- Terrain: NASA GSFC PGDA, LOLA `LDEM_80S_80MPP_ADJ`, https://pgda.gsfc.nasa.gov/products/90
