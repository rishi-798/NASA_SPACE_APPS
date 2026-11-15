# Meteomatics launch-site weather

The Departure step offers an on-demand 24-hour Earth forecast for the selected launch site. Temperature at 2 m (°C), wind speed at 10 m (m/s), optional total cloud cover (%), and precipitation accumulated over the preceding hour (mm water equivalent) come from Meteomatics. This is context for approximate Earth launch-pad coordinates, not a launch clearance, operational launch window, or lunar weather model. It does not modify SPICE calculations or depend on the planner's lunar observation date.

## Backend configuration

The service reads `METEOMATICS_USERNAME` and `METEOMATICS_PASSWORD` from the backend process environment. `.env.example` documents the names; local `.env` files are ignored by Git. The app does not automatically load a .env file. Inject the values through your process manager or deployment secret store. For Cloud Run, bind two Secret Manager secret versions to those environment variables using the service's runtime identity. No frontend `VITE_` variable should contain either value. No credentials are needed at frontend build time or in GitHub CI. Do not place credentials in source, URLs, Docker build arguments, or image layers.

Accounts must permit the three requested parameters and the current-to-next-day forecast. Public display, attribution, redistribution, and query allowances depend on the user's Meteomatics account terms. Confirm these with the provider before a public demo. The feature displays provider attribution and never returns the upstream account field.

## Endpoint

`GET /api/weather/launch-sites/{site_id}` accepts only the eight IDs in `data/launch_sites.json`, shared with the frontend catalogue. Unknown sites return 404 without an upstream call. Arbitrary upstream URLs, coordinates, parameters, date ranges, and cache bypasses are not accepted.

The window starts at the current UTC hour and ends 24 hours later, with 25 hourly samples. The response contains site identity/coordinates, provider, fetch/generation timestamps, window boundaries, partial-data flag, and typed weather readings. The UI labels the first sample as an hourly forecast, rather than a measured current observation. Missing or reserved values become null and display as unavailable; valid zero precipitation remains zero.

The optional `include_cloud=true` query requests `total_cloud_cover:p` in addition to the three core fields. The launch-site panel and dossier use this fixed option. Cloud percentages outside 0–100 are discarded. If the subscription rejects the extended parameter set with HTTP 403, the gateway retries the core set once and reports cloud cover as unavailable. Other errors are not retried.

The backend makes an HTTPS request with HTTP Basic authentication, a fixed host, redirects disabled, and connection/read timeouts. Errors are sanitised: unconfigured/access-denied 503, provider quota 429, timeout 504, other invalid/unavailable upstream data 502. Failed requests have a 60-second cooldown. Successful responses are shared for the current UTC hour per site, with concurrent requests coalesced per process. The two fixed parameter sets have independent hourly cache entries, preventing alternating core/cloud requests from bypassing the cache. At eight sites, both sets together allow up to 384 successful window fetches per UTC day per continuously running process; cloud-denial fallbacks, restarts, replicas, credential rotation and errors add requests. Multiple production instances should use a shared cache/quota control if account limits require it. The browser does not automatically poll or load forecasts on pad selection.

A real account was verified on November 14, 2026: Meteomatics returned HTTP 200 and 25 hourly readings for temperature, wind, precipitation, and cloud cover. Credentials are not included in the repository or this document. Automated tests continue to mock provider responses and require no credentials. Missing configuration leaves the rest of the planner usable.

For the local Docker backend, supply the private ignored file with `docker run --env-file .env.meteomatics.local …`. Native Uvicorn can use `--env-file .env.meteomatics.local` when `python-dotenv` is installed, or inherit the two process environment variables. Recreate the backend container after changing its environment; frontend rebuilds alone cannot attach backend credentials. Existing hosted services need the same two variables set in their runtime configuration; a Git push cannot supply them.

## Verification

Run `python -m pytest tests/test_meteomatics.py -q` and the full backend suite. Run frontend lint, tests and build. Browser checks should cover a successful forecast, missing access, retry, site changes during a request, and mobile table scrolling. Never commit real responses containing an account username.

Provider documentation:
- https://www.meteomatics.com/en/api/getting-started/
- https://www.meteomatics.com/en/api/response/json/
- https://www.meteomatics.com/en/api/request/required-parameters/date-time-description/
- https://www.meteomatics.com/en/api/response/reserved-values/
