import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE_URL = (process.env.BRAHMOS_BASE_URL || 'https://brahm0s.earth').replace(/\/$/, '');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.join(__dirname, 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

async function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE_PATH) {
    candidates.push(process.env.PLAYWRIGHT_MODULE_PATH);
  }
  const require = createRequire(import.meta.url);
  try {
    candidates.push(require.resolve('playwright'));
  } catch {
    // Fallback to common global or npx cache locations on Windows/Unix
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const npxRoot = path.join(localAppData, 'npm-cache', '_npx');
    if (fs.existsSync(npxRoot)) {
      for (const dir of fs.readdirSync(npxRoot)) {
        const candidate = path.join(npxRoot, dir, 'node_modules', 'playwright', 'index.mjs');
        if (fs.existsSync(candidate)) candidates.push(candidate);
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const modUrl = candidate.startsWith('file://') ? candidate : pathToFileURL(candidate).href;
      return await import(modUrl);
    } catch {
      // Try next candidate
    }
  }
  throw new Error(
    'Playwright package not found. Install playwright or set PLAYWRIGHT_MODULE_PATH.',
  );
}

async function launchBrowser(playwright) {
  const launchErrors = [];
  for (const opts of [
    { channel: 'chrome', headless: true },
    { channel: 'msedge', headless: true },
    { headless: true },
  ]) {
    try {
      return await playwright.chromium.launch(opts);
    } catch (err) {
      launchErrors.push(`${opts.channel || 'bundled'}: ${err.message.split('\n')[0]}`);
    }
  }
  throw new Error(`Unable to launch Chromium: ${launchErrors.join(' | ')}`);
}

async function waitForSettle(page, timeoutMs = 450) {
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForFunction(() => !document.querySelector('.route-loading'), { timeout: 6000 });
  } catch {
    // Route may stay loading or be non-SPA page
  }
  await page.waitForTimeout(timeoutMs);
}

async function inspectVisiblePage(page) {
  return page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent?.trim() || null;
    const h2 = document.querySelector('h2')?.textContent?.trim() || null;
    const main = document.querySelector('main');
    const heroCovered = document.querySelector('.hero')?.hasAttribute('data-covered') ?? null;
    const launching = document.documentElement.hasAttribute('data-launching');
    const bodySnippet = (document.body?.innerText || '').trim().slice(0, 180).replace(/\s+/g, ' ');
    return {
      url: location.href,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      title: document.title,
      h1,
      h2,
      scrollY: Math.round(window.scrollY),
      mainInert: main ? main.inert : null,
      heroCovered,
      launching,
      bodySnippet,
    };
  });
}

async function saveShot(page, name) {
  const safeName = name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase() + '.png';
  const target = path.join(EVIDENCE_DIR, safeName);
  await page.screenshot({ path: target, fullPage: false });
  return `tests/brahmos-e2e/evidence/${safeName}`;
}

async function main() {
  const playwright = await loadPlaywright();
  const buildInfo = await (await fetch(`${BASE_URL}/build-info.json`)).json();
  const browser = await launchBrowser(playwright);

  const report = {
    executed_at_utc: new Date().toISOString(),
    base_url: BASE_URL,
    deployed_build_info: buildInfo,
    browser_version: browser.version(),
    work_package_a: { transitions: [], checks: [] },
    work_package_b: { browser_checks: [] },
    work_package_c: { viewports: [], accessibility: [], interactive_scenes: [] },
    work_package_e: { cycle_results: [], post_unmount_check: null },
  };

  // =========================================================================
  // WORK PACKAGE A: Navigation Reliability (Isolated Context)
  // =========================================================================
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const http4xx = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push({ url: page.url(), text: m.text() });
    });
    page.on('pageerror', (e) => pageErrors.push({ url: page.url(), text: e.message }));
    page.on('response', (res) => {
      if (res.status() >= 400) http4xx.push({ page: page.url(), status: res.status(), resource: res.url() });
    });

    async function recordStep(stepName, fromUrl, actionLabel, fn, expectFn) {
      const startConsoleLen = consoleErrors.length;
      const errBefore = pageErrors.length;
      const httpBefore = http4xx.length;
      let actionError = null;
      try {
        await fn();
      } catch (err) {
        actionError = err.message.split('\n')[0];
      }
      await waitForSettle(page, 600);
      const state = await inspectVisiblePage(page);
      const passed = !actionError && (expectFn ? expectFn(state) : true);
      const newConsole = consoleErrors.slice(startConsoleLen);
      const newPageErrors = pageErrors.slice(errBefore);
      const newHttp4xx = http4xx.slice(httpBefore);
      let screenshot = null;
      if (!passed) {
        screenshot = await saveShot(page, `wp-a-${stepName}`);
      }
      report.work_package_a.transitions.push({
        step: stepName,
        starting_url: fromUrl,
        action: actionLabel,
        resulting_url: state.url,
        visible_page: state.h1 || state.h2 || state.title,
        scroll_y: state.scrollY,
        title: state.title,
        passed,
        action_error: actionError,
        screenshot,
        console_errors: newConsole,
        page_errors: newPageErrors,
        http_4xx: newHttp4xx,
      });
      return state;
    }

    // Step 1: Root entry -> redirects to /brahmos/index.html
    await page.goto(`${BASE_URL}/?return=1#top`, { waitUntil: 'domcontentloaded' });
    await waitForSettle(page, 600);
    let cur = await inspectVisiblePage(page);
    report.work_package_a.transitions.push({
      step: '01-root-redirect',
      starting_url: `${BASE_URL}/?return=1#top`,
      action: 'Initial GET /?return=1#top',
      resulting_url: cur.url,
      visible_page: cur.h1 || cur.title,
      scroll_y: cur.scrollY,
      title: cur.title,
      passed: cur.pathname === '/brahmos/index.html',
      screenshot: cur.pathname === '/brahmos/index.html' ? null : await saveShot(page, '01-root'),
      console_errors: [],
      page_errors: [],
    });

    // Deliberate transitions using links, Back/Forward, Reload, About, 3D interaction, Return Home
    // 2: Cinematic Home -> Missions (topbar nav)
    cur = await recordStep('02-home-to-missions', cur.url, 'Click Missions in cinematic header', async () => {
      await page.locator('.topbar a[href*="missions"]:visible, .desktop-nav a[href*="missions"]:visible').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/missions');

    // 3: Missions -> Timeline link (or footer Timeline)
    cur = await recordStep('03-missions-to-timeline', cur.url, 'Navigate Missions -> Timeline', async () => {
      await page.locator('a[href="/timeline"]:visible').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/timeline');

    // 4: Timeline -> Flight phases (/planner)
    cur = await recordStep('04-timeline-to-planner', cur.url, 'Navigate Timeline -> Flight phases (/planner)', async () => {
      await page.locator('.desktop-nav a[href="/planner"], a[href="/planner"]').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/planner');

    // 5: Interact with 3D canvas on Flight Phases, then navigate to Trip
    cur = await recordStep('05-planner-3d-drag-then-trip', cur.url, 'Drag 3D Flight Phases canvas then click Plan a trip', async () => {
      const box = await page.locator('canvas').first().boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 - 40, { steps: 6 });
        await page.mouse.up();
      }
      await page.locator('.desktop-nav a[href="/trip"]').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/trip');

    // 6: Deep link / selection refresh on Trip
    cur = await recordStep('06-trip-reload', cur.url, 'Browser reload on /trip', async () => {
      await page.reload();
    }, (s) => s.pathname === '/trip');

    // 7: Trip -> Explorer
    cur = await recordStep('07-trip-to-explorer', cur.url, 'Click Open Explorer CTA / NavLink', async () => {
      await page.locator('.desktop-nav a[href="/explorer"]').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/explorer');

    // 8: Interact with Explorer 3D globe/canvas, then navigate to Missions
    cur = await recordStep('08-explorer-interact-then-missions', cur.url, 'Drag Explorer 3D viewport then click Missions', async () => {
      const box = await page.locator('.explorer-visual').first().boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 5 });
        await page.mouse.up();
      }
      await page.locator('.desktop-nav a[href="/missions"]').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/missions');

    // 9: Missions -> Discover
    cur = await recordStep('09-missions-to-discover', cur.url, 'Click Discover in footer', async () => {
      await page.locator('.site-footer a[href="/discover"]').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/discover');

    // 10: Discover -> Timeline (footer)
    cur = await recordStep('10-discover-to-timeline', cur.url, 'Click Timeline in footer', async () => {
      await page.locator('.site-footer a[href="/timeline"]').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/timeline');

    // 11: Browser Back (Timeline -> Discover)
    cur = await recordStep('11-back-to-discover', cur.url, 'Browser Back button', async () => {
      await page.goBack();
    }, (s) => s.pathname === '/discover');

    // 12: Browser Back (Discover -> Missions)
    cur = await recordStep('12-back-to-missions', cur.url, 'Browser Back button', async () => {
      await page.goBack();
    }, (s) => s.pathname === '/missions');

    // 13: Browser Forward (Missions -> Discover)
    cur = await recordStep('13-forward-to-discover', cur.url, 'Browser Forward button', async () => {
      await page.goForward();
    }, (s) => s.pathname === '/discover');

    // 14: Discover -> About (/brahmos/index.html?return=1#about)
    cur = await recordStep('14-discover-to-about', cur.url, 'Click About in desktop nav -> #about', async () => {
      await page.locator('.desktop-nav a[href*="index.html"][href*="#about"]').first().click({ timeout: 6000 });
      await page.waitForTimeout(900);
    }, (s) => s.pathname === '/brahmos/index.html' && s.hash === '#about' && s.scrollY > 100);

    // 15: Direct About entry (/about -> /brahmos/index.html#about)
    cur = await recordStep('15-direct-about-route', cur.url, 'Direct GET /about', async () => {
      await page.goto(`${BASE_URL}/about`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
    }, (s) => s.pathname === '/brahmos/index.html' && s.hash === '#about' && s.scrollY > 100);

    // 16: Direct About on cinematic path -> Open Explorer inside About (.about-card__action)
    cur = await recordStep('16-about-to-explorer', cur.url, 'Click Open Explorer inside About section', async () => {
      await page.locator('#about a.about-card__action').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/explorer');

    // 17: Deep link reload on Explorer with coordinates & site
    cur = await recordStep('17-explorer-deeplink-reload', cur.url, 'Navigate to /explorer?site=athena-im2&time=2026-10-23T12:00:00Z then reload', async () => {
      await page.goto(`${BASE_URL}/explorer?site=athena-im2&time=2026-10-23T12%3A00%3A00Z`, { waitUntil: 'domcontentloaded' });
      await waitForSettle(page, 400);
      await page.reload();
    }, (s) => s.pathname === '/explorer' && s.search.includes('athena-im2'));

    // 18: Explorer -> Planner -> Deliberate "Back to overview" link in PlannerPage header!
    cur = await recordStep('18-explorer-to-planner', cur.url, 'Navigate Explorer -> Planner', async () => {
      await page.locator('.desktop-nav a[href="/planner"]').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/planner');

    cur = await recordStep('19-planner-back-to-overview-link', cur.url, 'Click "Back to overview" (<Link to="/">) in Planner heading', async () => {
      await page.locator('.planner-topline a[href="/"]').first().click({ timeout: 6000 });
      await page.waitForTimeout(900);
    }, (s) => s.pathname === '/brahmos/index.html');

    // 20: Escape launch screen if triggered on Home, then navigate Header -> Plan a trip
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
    cur = await recordStep('20-home-to-trip', cur.url, 'Navigate Home -> Plan a trip', async () => {
      await page.locator('.topbar a[href*="trip"]:visible, nav a[href*="trip"]:visible').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/trip');

    // 21: Trip -> Missions -> Explorer -> Trip rapid multi-hop check
    cur = await recordStep('21-trip-to-missions', cur.url, 'Trip -> Missions', async () => {
      await page.locator('.desktop-nav a[href="/missions"]').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/missions');

    cur = await recordStep('22-missions-to-timeline-2', cur.url, 'Missions -> Timeline via footer', async () => {
      await page.locator('.site-footer a[href="/timeline"]').first().click({ timeout: 6000 });
    }, (s) => s.pathname === '/timeline');

    cur = await recordStep('23-timeline-to-wordmark-home', cur.url, 'Intentional BRAHMOS wordmark Return Home (?return=1#top)', async () => {
      await page.locator('a.wordmark').first().click({ timeout: 6000 });
      await page.waitForTimeout(500);
    }, (s) => s.pathname === '/brahmos/index.html' && !s.launching);

    // Check legacy /workspace.html redirects and coordinate/time preservation!
    const legacyCases = [
      {
        name: 'legacy-workspace-analyze-coords',
        path: '/workspace.html?view=analyze&lat=38.315&lon=-35.0081&time=2026-10-23T12%3A00%3A00Z',
        expectedPath: '/explorer',
      },
      { name: 'legacy-workspace-trip', path: '/workspace.html?view=trip', expectedPath: '/trip' },
      { name: 'legacy-workspace-phases', path: '/workspace.html?view=phases', expectedPath: '/planner' },
      { name: 'legacy-workspace-missions', path: '/workspace.html?view=missions', expectedPath: '/missions' },
      {
        name: 'legacy-brahmos-workspace-analyze',
        path: '/brahmos/workspace.html?view=analyze&lat=38.315&lon=-35.0081&time=2026-10-23T12%3A00%3A00Z',
        expectedPath: '/explorer',
      },
    ];
    for (const lc of legacyCases) {
      await page.goto(`${BASE_URL}${lc.path}`, { waitUntil: 'domcontentloaded' });
      await waitForSettle(page, 700);
      const st = await inspectVisiblePage(page);
      let extra = {};
      if (lc.expectedPath === '/explorer' && st.pathname === '/explorer') {
        extra = await page.evaluate(() => {
          const coords = document.querySelector('.context-coordinates')?.textContent || '';
          const startDate = document.querySelector('input[type="date"]')?.value || null;
          const startTime = document.querySelector('input[type="time"]')?.value || null;
          return { coordsText: coords.replace(/\s+/g, ' ').trim(), startDate, startTime };
        });
      }
      const passed = st.pathname === lc.expectedPath && (
        lc.name !== 'legacy-workspace-analyze-coords' ||
        (st.search.includes('lat=38.315') && st.search.includes('lon=-35.0081') && st.search.includes('2026-10-23T12'))
      );
      report.work_package_a.checks.push({
        check: lc.name,
        input_url: `${BASE_URL}${lc.path}`,
        resulting_url: st.url,
        expected_path: lc.expectedPath,
        passed,
        extra,
        screenshot: passed ? null : await saveShot(page, `wp-a-${lc.name}`),
      });
    }

    // Check unknown route behavior: Backend HTTP vs React SPA router
    const unknownPath = '/nonexistent-brahmos-route-404';
    const backendUnknown = await fetch(`${BASE_URL}${unknownPath}`);
    const backendUnknownBody = await backendUnknown.text();
    // Test SPA UnknownRoute via client-side navigation from an active SPA page (/missions)
    await page.goto(`${BASE_URL}/missions`, { waitUntil: 'domcontentloaded' });
    await waitForSettle(page, 500);
    await page.evaluate((p) => {
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, unknownPath);
    await waitForSettle(page, 400);
    const spaUnknownState = await inspectVisiblePage(page);
    // Also test direct browser navigation to /nonexistent-brahmos-route-404
    const directRes = await page.goto(`${BASE_URL}${unknownPath}`, { waitUntil: 'domcontentloaded' });
    const directState = await inspectVisiblePage(page);
    report.work_package_a.checks.push({
      check: 'unknown-route-backend-vs-spa',
      unknown_path: unknownPath,
      backend_direct_fetch: { status: backendUnknown.status, content_type: backendUnknown.headers.get('content-type'), body: backendUnknownBody.slice(0, 120) },
      browser_direct_nav: { status: directRes?.status(), url: directState.url, bodySnippet: directState.bodySnippet },
      spa_in_app_nav: {
        url: spaUnknownState.url,
        h1: spaUnknownState.h1,
        reported_not_found: Boolean(spaUnknownState.h1?.includes('flight plan')),
      },
    });

    await ctx.close();
  }

  // =========================================================================
  // WORK PACKAGE B: Browser Trip-State Restoration (Isolated Context)
  // =========================================================================
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    // Test what live /trip currently does when saved stage is 'landing' or 'reveal'
    await page.goto(`${BASE_URL}/trip`, { waitUntil: 'domcontentloaded' });
    await waitForSettle(page, 500);

    const savedCases = [
      { label: 'live-saved-stage-landing', stage: 'landing', rocketId: 'saturn-v', departureId: 'kennedy-39a' },
      { label: 'live-saved-stage-reveal', stage: 'reveal', rocketId: 'saturn-v', departureId: 'kennedy-39a' },
      { label: 'live-malformed-json', rawOverride: '{bad-json' },
      { label: 'live-removed-rocket', stage: 'moon', rocketId: 'removed-vehicle', departureId: 'kennedy-39a' },
      { label: 'live-invalid-coords', stage: 'landing', rocketId: 'saturn-v', departureId: 'kennedy-39a', landing: { latitude: 95, longitude: 0, name: 'Bad' } },
    ];

    for (const sc of savedCases) {
      await page.evaluate((item) => {
        if (item.rawOverride !== undefined) {
          localStorage.setItem('nasa-lunar-trip-v1', item.rawOverride);
          return;
        }
        localStorage.setItem('nasa-lunar-trip-v1', JSON.stringify({
          version: 1,
          stage: item.stage,
          departureId: item.departureId,
          rocketId: item.rocketId,
          landing: item.landing || { latitude: -84.79, longitude: 29.2, name: 'Athena IM-2', destinationId: 'athena-im2' },
          utcTime: '2027-01-03T06:00:00Z',
          transferDepartureUtcTime: '2026-12-30T22:00:00Z',
          parkingAltitudeKm: 200,
          revision: 3,
          result: { stale: true },
          resultRevision: 3,
          error: null,
        }));
      }, sc);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForSettle(page, 600);
      try {
        await page.waitForSelector('[aria-current="step"]', { timeout: 6000 });
      } catch {
        // Record if stage indicator never mounted
      }
      const ui = await page.evaluate(() => {
        const activeTab = document.querySelector('[aria-current="step"]')?.textContent?.trim() || null;
        const h1 = document.querySelector('h1, h2')?.textContent?.trim() || null;
        const stored = localStorage.getItem('nasa-lunar-trip-v1');
        return { activeTab, h1, storedSnippet: stored?.slice(0, 180) };
      });
      report.work_package_b.browser_checks.push({
        case: sc.label,
        deployed_sha: buildInfo.source_commit,
        active_step_in_ui: ui.activeTab,
        heading: ui.h1,
        stored_after_load: ui.storedSnippet,
      });
    }
    await ctx.close();
  }

  // =========================================================================
  // WORK PACKAGE C: Mobile & Accessibility Audits (320, 390, 768, 1440 px)
  // =========================================================================
  {
    const widths = [320, 390, 768, 1440];
    const routes = [
      '/brahmos/index.html?return=1#top',
      '/explorer',
      '/trip',
      '/planner',
      '/missions',
      '/timeline',
    ];

    for (const width of widths) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await ctx.newPage();

      for (const route of routes) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await waitForSettle(page, 600);

        const metrics = await page.evaluate((vw) => {
          const overflowPx = Math.round(document.documentElement.scrollWidth - window.innerWidth);
          const protruding = [];
          if (overflowPx > 1) {
            for (const el of document.querySelectorAll('header, nav, main, section, h1, button, a, table, .hero-footer')) {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.right > window.innerWidth + 2) {
                protruding.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''}(right=${Math.round(r.right)})`);
                if (protruding.length >= 6) break;
              }
            }
          }

          // Check small touch targets on mobile (<=768px), excluding inline prose citations
          const smallTargets = [];
          if (vw <= 768) {
            for (const el of document.querySelectorAll('button, summary, input[type="button"], input[type="submit"], nav a, .about-card__action, .mission-explore-link, .topbar a, .planner-topline a')) {
              const style = getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              // Skip elements clipped by responsive display:none ancestor or collapsed/inert containers
              if (el.offsetParent === null && style.position !== 'fixed') continue;
              if (el.closest('[inert], [hidden]')) continue;
              if (r.height < 40 || r.width < 40) {
                smallTargets.push({
                  label: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 32),
                  w: Math.round(r.width),
                  h: Math.round(r.height),
                });
                if (smallTargets.length >= 8) break;
              }
            }
          }

          // Check topbar menu button overlay collision / elementFromPoint
          const blockedControls = [];
          for (const el of document.querySelectorAll('.menu-button, .desktop-nav a, .topbar .brand, h1')) {
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4 || r.top < 0 || r.bottom > window.innerHeight) continue;
            if (el.closest('[inert], [hidden]')) continue;
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const hit = document.elementFromPoint(cx, cy);
            if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
              blockedControls.push({
                target: (el.textContent || el.className).trim().slice(0, 30),
                coveredBy: `${hit.tagName.toLowerCase()}.${String(hit.className || '').trim().split(/\s+/)[0]}`,
              });
            }
          }

          return { overflowPx, protruding, smallTargetsCount: smallTargets.length, smallTargets, blockedControls };
        }, width);

        let shot = null;
        if (metrics.overflowPx > 2 || metrics.blockedControls.length > 0) {
          shot = await saveShot(page, `wp-c-${width}-${route.replace(/[^a-z0-9]/gi, '_')}`);
        }
        report.work_package_c.viewports.push({
          width,
          route,
          ...metrics,
          screenshot: shot,
        });
      }
      await ctx.close();
    }

    // Accessibility: Mobile Menu Escape Focus Restoration + Keyboard Tab + Reduced Motion + 3D Scene Interactions
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/missions`, { waitUntil: 'domcontentloaded' });
      await waitForSettle(page, 500);
      const menuBtn = page.locator('button.menu-button');
      await menuBtn.focus();
      await menuBtn.click();
      await page.waitForTimeout(200);
      const openBeforeEsc = await page.locator('#mobile-navigation').isVisible();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const escapeState = await page.evaluate(() => ({
        menuStillOpen: Boolean(document.querySelector('#mobile-navigation')),
        activeClass: document.activeElement?.className || null,
        activeTag: document.activeElement?.tagName || null,
      }));
      report.work_package_c.accessibility.push({
        check: 'mobile-menu-escape-and-focus-restore',
        deployed_sha: buildInfo.source_commit,
        opened_cleanly: openBeforeEsc,
        closed_on_escape: !escapeState.menuStillOpen,
        focus_restored_to_button: String(escapeState.activeClass).includes('menu-button'),
        active_element_after_esc: `${escapeState.activeTag}.${escapeState.activeClass}`,
      });
      await ctx.close();
    }

    // Reduced Motion + Keyboard Tab + 3D Interactive Scene Check (1440px)
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}/brahmos/index.html`, { waitUntil: 'domcontentloaded' });
      await waitForSettle(page, 1300);
      const rmHome = await page.evaluate(() => ({
        stillLaunchingAfter1300ms: document.documentElement.hasAttribute('data-launching'),
        scrollY: Math.round(window.scrollY),
        openExplorerDisabled: document.querySelector('.primary-action')?.disabled ?? null,
      }));
      report.work_package_c.accessibility.push({ check: 'reduced-motion-cinematic-home', ...rmHome });

      // Check skip-link and focus styling on /explorer
      await page.goto(`${BASE_URL}/explorer`, { waitUntil: 'domcontentloaded' });
      await waitForSettle(page, 600);
      await page.waitForSelector('h1', { timeout: 6000 });
      await page.keyboard.press('Tab');
      const skipFocus = await page.evaluate(() => {
        const el = document.activeElement;
        const s = el ? getComputedStyle(el) : null;
        return {
          text: el?.textContent?.trim(),
          outline: s?.outline,
          boxShadow: s?.boxShadow,
        };
      });
      report.work_package_c.accessibility.push({ check: 'keyboard-skip-link-focus', ...skipFocus });

      // Check Explorer Cesium canvas interactivity
      const expBox = await page.locator('.moon-stage canvas').first().boundingBox();
      let expHit = null;
      if (expBox) {
        expHit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName || null, {
          x: expBox.x + expBox.width / 2,
          y: expBox.y + expBox.height / 2,
        });
        await page.mouse.move(expBox.x + expBox.width / 2, expBox.y + expBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(expBox.x + expBox.width / 2 + 50, expBox.y + expBox.height / 2 + 25, { steps: 4 });
        await page.mouse.up();
      }
      report.work_package_c.interactive_scenes.push({
        scene: 'Explorer Cesium MoonMap',
        element_at_center: expHit,
        interactive_canvas_unobstructed: expHit === 'CANVAS',
      });

      // Interactive 3D canvas test on /planner
      await page.goto(`${BASE_URL}/planner`, { waitUntil: 'domcontentloaded' });
      await waitForSettle(page, 700);
      const plannerBox = await page.locator('canvas').first().boundingBox();
      let plannerHit = null;
      if (plannerBox) {
        plannerHit = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          return el?.tagName || null;
        }, { x: plannerBox.x + plannerBox.width / 2, y: plannerBox.y + plannerBox.height / 2 });
        await page.mouse.move(plannerBox.x + plannerBox.width / 2, plannerBox.y + plannerBox.height / 2);
        await page.mouse.wheel(0, -120);
      }
      report.work_package_c.interactive_scenes.push({
        scene: 'FlightPhases CislunarOrbitalCanvas',
        element_at_center: plannerHit,
        interactive_canvas_unobstructed: plannerHit === 'CANVAS',
      });
      await ctx.close();
    }
  }

  // =========================================================================
  // WORK PACKAGE E: Rendering Lifecycle & Cleanup
  // =========================================================================
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    const errors = [];
    const contextLosses = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__rafCount = 0;
      const origRaf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => {
        window.__rafCount++;
        return origRaf(cb);
      };
      window.addEventListener('webglcontextlost', (e) => {
        window.__webglLost = (window.__webglLost || 0) + 1;
      }, true);
    });

    const cycleRoutes = ['/explorer', '/planner', '/trip', '/missions'];
    for (let cycle = 1; cycle <= 6; cycle++) {
      for (const route of cycleRoutes) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
        await waitForSettle(page, 380);
      }
      const stat = await page.evaluate(() => ({
        canvasesRemainingOnMissions: document.querySelectorAll('canvas').length,
        webglLostCount: window.__webglLost || 0,
      }));
      report.work_package_e.cycle_results.push({ cycle, ...stat });
    }

    // Measure RAF activity on non-canvas page (/missions) vs active canvas page (/planner)
    await page.goto(`${BASE_URL}/missions`, { waitUntil: 'domcontentloaded' });
    await waitForSettle(page, 800);
    await page.evaluate(() => { window.__rafCount = 0; });
    await page.waitForTimeout(1000);
    const missionsRafPerSec = await page.evaluate(() => ({
      rafCallbacksIn1s: window.__rafCount,
      canvasCount: document.querySelectorAll('canvas').length,
      webglLost: window.__webglLost || 0,
      heapUsedMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null,
    }));

    report.work_package_e.post_unmount_check = {
      ...missionsRafPerSec,
      console_errors: errors.slice(0, 15),
      total_console_errors: errors.length,
    };
    await ctx.close();
  }

  await browser.close();
  const outPath = path.join(__dirname, 'artifacts-summary.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Saved full verification report to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
