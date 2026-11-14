/** Display/refinement settings. Original terrain heights and imagery remain intact. */
export function applyMoonQuality(viewer, moonTileset, {screenSpaceError = 2, resolutionScale = 1} = {}) {
  if (!(screenSpaceError > 0 && Number.isFinite(screenSpaceError))) throw new Error('Invalid screen space error');
  if (!(resolutionScale > 0 && resolutionScale <= 2)) throw new Error('Resolution scale must be between 0 and 2');
  moonTileset.maximumScreenSpaceError = screenSpaceError;
  viewer.useBrowserRecommendedResolution = false;
  viewer.resolutionScale = resolutionScale;
  viewer.scene.requestRender();
}
