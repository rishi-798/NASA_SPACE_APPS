import { Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { MissionPhasePlanner } from "../components/planner/MissionPhasePlanner";

export function MissionPhasePlannerPage() {
  return (
    <article className="planner-page" style={{ padding: "1.5rem 1rem 3rem" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto 1.25rem" }}>
        <Link
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            color: "#38bdf8",
            fontSize: "0.85rem",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} /> Return to Mission Control
        </Link>
      </div>

      <MissionPhasePlanner />
    </article>
  );
}
