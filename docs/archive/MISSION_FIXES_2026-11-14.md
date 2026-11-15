# Mission archive and deployment fixes — 2026-11-14

Mission archive and timeline actions now share `missionExplorerUrl`. Named sites retain their site IDs; other active surface missions pass exact catalogue latitude/longitude and a readable name. The Explorer validates query coordinates and resets its workspace on URL changes, including browser history navigation. Catalogue coordinates describe landing areas and should not be treated as surveyed touchdown points.

Flybys and Earth-orbit demonstrations have no lunar surface action or dummy coordinates. Cancelled task orders are retained in a separate archive section. Timeline years derive from active/historical records; a year on the axis can represent launch, landing, or flight dates as stated on each card.

Every mission record includes `missionType`, `dateLabel`, `scheduleNote`, `lastVerified`, and `sources`. Sources were checked on 2026-11-14. Future schedules remain targets. Payload lists are highlights, not an assertion of a complete manifest.

Key corrections: Athena's operations concluded; Blue Ghost 1 completed surface operations in March 2025; Artemis II completed its flyby in April 2026; Artemis III is currently planned as a 2027 Earth-orbit demonstration; IM-3 targets early 2027; Griffin-1 targets late 2026 and carries FLIP; Draper CP-12 ended in July 2026. The source URLs for each change live beside the record in `data/missions.json`. Older general NASA provider pages can disagree with newer mission-specific releases; newer direct announcements take precedence.

## Reproducible Python deployment

Docker and the Ubuntu backend CI job install `requirements-linux-lock.txt`, followed by `pip check`. This lock targets Python 3.12 Linux and retains compatible existing pins while including requests and its transitive dependencies. The existing Windows lock is preserved for its original environment.

Regenerate deliberately, review the diff, and run the backend suite:

```sh
uv pip compile requirements.txt --constraint requirements-lock.txt --python-version 3.12 --python-platform x86_64-unknown-linux-gnu --output-file requirements-linux-lock.txt
python -m pip install -r requirements-linux-lock.txt
python -m pip check
python -m pytest -q
```

This pins Python packages; base-image tags and OS packages retain the existing Docker configuration.
