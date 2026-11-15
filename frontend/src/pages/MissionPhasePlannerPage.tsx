import { Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { MissionPhasePlanner } from "../components/planner/MissionPhasePlanner";

export function MissionPhasePlannerPage() {
  return (
    <article className="trip-page phase-planner-page">
      <div className="trip-topline">
        <Link to="/">
          <ArrowLeft /> Back to overview
        </Link>
        <span>FLIGHT ARCHITECTURE · ORBITAL MECHANICS ENGINE</span>
      </div>

      <header className="trip-heading">
        <h1>Flight phases</h1>
        <p>Interactive cislunar trajectory stages from launch pad ascent through powered lunar touchdown.</p>
      </header>

      <MissionPhasePlanner />
    </article>
  );
}
