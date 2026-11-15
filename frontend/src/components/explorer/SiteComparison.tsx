import type { AnalysisResult, LandingSite } from "../../types";
export type ComparisonEntry = { site: LandingSite; result?: AnalysisResult; error?: string };
export function SiteComparison({ entries, loading }: { entries: ComparisonEntry[]; loading: boolean }) {
  return <section className="site-comparison" aria-labelledby="comparison-title" aria-busy={loading}>
    <div className="visualization-heading"><div><p className="eyebrow">04 / Compare the same UTC interval</p><h2 id="comparison-title">Athena & Odysseus</h2></div></div>
    <p className="analysis-note">Visibility opportunities, not a landing-safety ranking. Athena includes terrain; Odysseus uses a flat horizon, so the models are not equivalent.</p>
    {loading ? <p role="status">Calculating both sites…</p> : !entries.length ? <p className="analysis-note">Press Analyze to compare sunlight, Earth visibility and joint windows.</p> :
    <div className="comparison-scroll"><table><caption>Duration-weighted results over the selected range. Joint visibility requires both Sun and Earth.</caption><thead><tr><th>Site / horizon</th><th>Sunlight</th><th>Earth visible</th><th>Joint visibility</th><th>Longest dark</th><th>Longest Earth-hidden</th></tr></thead><tbody>
      {entries.map(({site, result, error}) => <tr key={site.id}><th scope="row">{site.mission}<small>{result?.provenance.horizon_mode ?? "Unavailable"}</small></th>
        {result ? <><td>{result.summary.sunlight_percent}%</td><td>{result.summary.earth_visible_percent}%</td><td>{result.summary.both_available_percent}%</td><td>{result.summary.longest_darkness_minutes} min</td><td>{result.summary.longest_comm_blackout_minutes} min</td></> : <td colSpan={5} role="status">{error ?? "No data returned"}</td>}
      </tr>)}
    </tbody></table></div>}
  </section>;
}
