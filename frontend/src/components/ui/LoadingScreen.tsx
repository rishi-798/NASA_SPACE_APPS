export function LoadingScreen({ visible, message = "Calculating Sun and Earth geometry" }: { visible: boolean; message?: string }) {
  if (!visible) return null;
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-orbit" aria-hidden="true">
        <span className="loading-moon" />
        <span className="loading-ring loading-ring-a"><i /></span>
        <span className="loading-ring loading-ring-b"><i /></span>
      </div>
      <p className="loading-title">{message}</p>
      <p className="loading-sub">SPICE ephemeris · terrain horizon</p>
      <span className="loading-bar" aria-hidden="true" />
    </div>
  );
}
