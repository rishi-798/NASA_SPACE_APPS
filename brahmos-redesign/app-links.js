// The deployed cinematic landing opens the application's full scientific tools.
// Keep the portable workspace preview available when this folder is opened locally.
(() => {
  if (!location.pathname.startsWith('/brahmos/')) return;
  const routes = { analyze: '/explorer', trip: '/trip', phases: '/planner', missions: '/missions' };
  if (location.pathname.endsWith('/workspace.html')) {
    const query = new URLSearchParams(location.search);
    const route = routes[query.get('view') || 'analyze'];
    if (route) {
      query.delete('view');
      query.set('ui', 'brahmos');
      location.replace(route + '?' + query.toString() + location.hash);
    }
    return;
  }
  document.querySelectorAll('a[href]').forEach(anchor => {
    const url = new URL(anchor.getAttribute('href'), location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith('/workspace.html')) return;
    const route = routes[url.searchParams.get('view')];
    if (!route) return;
    url.searchParams.delete('view');
    url.searchParams.set('ui', 'brahmos');
    anchor.href = route + '?' + url.searchParams.toString() + url.hash;
  });
})();
