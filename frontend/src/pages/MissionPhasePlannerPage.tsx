import { Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { MissionPhasePlanner } from "../components/planner/MissionPhasePlanner";

export function MissionPhasePlannerPage() {
  return (
    <article className="phase-planner-page">
      <div className="planner-topline">
        <Link to="/">
          <ArrowLeft size={16} /> Back to overview
        </Link>
        <span>FLIGHT ARCHITECTURE · EDUCATIONAL REFERENCE</span>
      </div>

      <header className="planner-heading">
        <h1>Flight phases</h1>
        <p>Explore the stages of a reference lunar mission, from ascent to descent.</p>
        <p className="trip-note">Educational scenario: displayed times, altitudes, speeds and delta-v budgets are illustrative parameters, not validated vehicle performance or a calculated flight. Use <Link to="/trip">Plan a trip</Link> for the date-based SPICE transfer.</p>
      </header>

      <MissionPhasePlanner />
    </article>
  );
}
