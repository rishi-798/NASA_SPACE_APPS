import { Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { MissionPhasePlanner } from "../components/planner/MissionPhasePlanner";

import "../components/redesign/phases-workspace.css";

export function MissionPhasePlannerPage() {
  return (
    <article className="phase-planner-page phases-workspace">
      <div className="planner-topline">
        <Link to="/">
          <ArrowLeft size={16} /> Back to overview
        </Link>
        <span>BRAHMOS / FLIGHT DYNAMICS</span>
      </div>

      <header className="planner-heading">
        <p className="pw-eyebrow">EARTH → MOON / EDUCATIONAL WORKSPACE</p>
        <h1>Flight phases<span>.</span></h1>
        <p>Explore the stages of a reference lunar mission, from ascent to descent.</p>
        <p className="trip-note">Educational scenario: displayed times, altitudes, speeds and delta-v budgets are illustrative parameters, not validated vehicle performance or a calculated flight. Use <Link to="/trip">Plan a trip</Link> for the date-based SPICE transfer.</p>
      </header>

      <MissionPhasePlanner />
    </article>
  );
}
