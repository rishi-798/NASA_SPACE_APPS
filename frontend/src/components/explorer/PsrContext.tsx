import data from '../../../../data/psr_reference_craters.json';
import { nearestReferenceCrater } from '../../lib/psr';
export function PsrContext({latitude, longitude}: {latitude?: number; longitude?: number}) {
  const nearest = latitude === undefined || longitude === undefined ? null : nearestReferenceCrater(latitude, longitude, data.craters);
  if (!nearest) return null;
  return <article className="psr-context">
    <h3>Polar cold-trap context</h3>
    <p><a href={nearest.crater.source} target="_blank" rel="noreferrer">{nearest.crater.name}</a> · {nearest.distanceKm < 0.05 ? 'Inside approximate crater footprint' : `~${nearest.distanceKm.toFixed(1)} km to approximate crater edge`}</p>
    <dl><dt>PSR proximity</dt><dd>Exact permanent-shadow boundary not loaded.</dd>
      <dt>Subsurface thermal estimate</dt><dd>Not modeled at this point. Polar surface ice observations are associated with annual maximum temperatures below ~110 K; this is literature context, not a local temperature.</dd>
      <dt>ISRU potential</dt><dd>Prospecting target only. Local ice concentration and depth, including the top meter, are unverified.</dd></dl>
    <small>{data.note} <a href={data.thermalSource} target="_blank" rel="noreferrer">Ice evidence / methodology</a></small>
  </article>;
}
