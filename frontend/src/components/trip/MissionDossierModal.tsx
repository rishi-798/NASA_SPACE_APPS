import { useEffect, useRef, useState } from 'react';

type DossierProps = {latitude?: number; longitude?: number; siteId?: string | null; start: string; end?: string; stepMinutes?: number;
  launchSiteId?: string; launchVehicle?: string; liftoffUtc?: string; missionName?: string};

/** Native print preview: Save as PDF preserves charts and the source audit. */
export function MissionDossierModal(props: DossierProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const active = useRef<AbortController | null>(null);
  const [html, setHtml] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => active.current?.abort(), []);
  async function open() {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setHtml(''); setReady(false); setError(''); dialog.current?.showModal();
    try {
      const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
      const response = await fetch(`${base}/api/mission/briefing/html`, {
        method: 'POST', signal: controller.signal, headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({lat: props.latitude, lon: props.longitude, site_id: props.siteId,
          start: props.start, end: props.end, step_minutes: props.stepMinutes, launch_site_id: props.launchSiteId, launch_vehicle: props.launchVehicle,
          liftoff_utc: props.liftoffUtc || undefined, mission_name: props.missionName}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.detail === 'string' ? body.detail : 'Dossier is unavailable. Close and retry.');
      }
      const content = await response.text();
      if (!controller.signal.aborted) setHtml(content);
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Dossier is unavailable.'); }
  }
  return <>
    <button type="button" className="dossier-button" onClick={() => void open()}>Download Flight Readiness Dossier</button>
    <dialog className="mission-dossier" ref={dialog} onClose={() => active.current?.abort()}>
      <div className="dossier-toolbar"><h2>Flight Readiness Dossier</h2>
        <button type="button" disabled={!ready} onClick={() => { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); }}>Print / Save as PDF</button>
        <button type="button" autoFocus onClick={() => dialog.current?.close()}>Close</button></div>
      <p className="trip-note">Print opens your browser’s print dialog. Choose “Save as PDF” to download the briefing.</p>
      {error ? <p role="alert">{error}</p> : !html ? <p role="status">Calculating the observation window and assembling the source audit…</p> :
        <iframe ref={frame} title="Printable mission briefing" sandbox="allow-same-origin allow-modals" srcDoc={html} onLoad={() => setReady(true)} />}
    </dialog>
  </>;
}
