import { Link } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import { AsteroidShooterGame } from "../components/game/AsteroidShooterGame";

export function GamePage() {
  return (
    <article className="game-page" style={{ maxWidth: "860px", margin: "2rem auto", padding: "0 1rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            color: "#38bdf8",
            fontSize: "0.85rem",
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={16} /> Return to Mission Control
        </Link>
      </div>

      <AsteroidShooterGame />
    </article>
  );
}
