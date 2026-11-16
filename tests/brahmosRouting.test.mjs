import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../brahmos-redesign/app-links.js', import.meta.url), 'utf8');
function run(path, hrefs = []) {
  let destination;
  const url = new URL(path, 'https://app.test');
  const anchors = hrefs.map(href => ({href, getAttribute: () => href}));
  vm.runInNewContext(source, {
    location: {pathname:url.pathname, search:url.search, hash:url.hash,
      origin:url.origin, href:url.href, replace: value => { destination = value; }},
    document: {querySelectorAll: () => anchors}, URL, URLSearchParams,
  });
  return {destination, anchors};
}

test('all cinematic tool links target the existing application instead of the preview calculators', () => {
  const views = ['analyze', 'trip', 'phases', 'missions'];
  const result = run('/brahmos/index.html', views.map(view => `workspace.html?view=${view}`));
  assert.deepEqual(result.anchors.map(a=>a.href),
    ['/explorer?ui=brahmos','/trip?ui=brahmos','/planner?ui=brahmos','/missions?ui=brahmos']);
  assert.equal(result.destination, undefined);
});

test('legacy workspace links preserve selected coordinates, UTC epoch and fragment', () => {
  const {destination} = run('/brahmos/workspace.html?view=analyze&lat=38.315&lon=-35.0081&time=2026-10-23T12%3A00%3A00Z#surface');
  const url = new URL(destination, 'https://app.test');
  assert.equal(url.pathname, '/explorer');
  assert.equal(url.searchParams.get('lat'), '38.315');
  assert.equal(url.searchParams.get('lon'), '-35.0081');
  assert.equal(url.searchParams.get('time'), '2026-10-23T12:00:00Z');
  assert.equal(url.hash, '#surface');
});

test('in-page About, external citations and standalone previews retain their destinations', () => {
  const hrefs = ['#about','https://naif.jpl.nasa.gov/'];
  assert.deepEqual(run('/brahmos/index.html', hrefs).anchors.map(a=>a.href), hrefs);
  assert.equal(run('/brahmos/workspace.html?view=unknown').destination, undefined);
  assert.equal(run('/index.html', ['workspace.html?view=trip']).anchors[0].href, 'workspace.html?view=trip');
});
