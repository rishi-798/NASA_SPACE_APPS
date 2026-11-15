import { useEffect, useState } from "react";
import { GameController, WifiSlash } from "@phosphor-icons/react";
import { AsteroidModal } from "./AsteroidModal";

export function OfflineNotice() {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [gameOpen, setGameOpen] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <>
      {isOffline && (
        <aside className="offline-status-banner" role="status" aria-live="polite">
          <div className="offline-status-left">
            <span className="offline-status-pulse" />
            <WifiSlash size={16} />
            <span>Connection offline. Using cached assets from your previous visit.</span>
          </div>
          <button
            type="button"
            className="offline-game-trigger-btn"
            onClick={() => setGameOpen(true)}
            title="Launch offline Asteroid Defense game"
          >
            <GameController size={16} />
            Play Asteroid Defense
          </button>
        </aside>
      )}

      <AsteroidModal isOpen={gameOpen} onClose={() => setGameOpen(false)} />
    </>
  );
}
