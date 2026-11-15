import { useState, useSyncExternalStore } from "react";
import { GameController, WifiSlash } from "@phosphor-icons/react";
import { AsteroidModal } from "./AsteroidModal";

function subscribeConnection(update:()=>void) {
  window.addEventListener('online',update);window.addEventListener('offline',update);
  return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
}

export function OfflineNotice() {
  const isOffline=useSyncExternalStore(subscribeConnection,()=>navigator.onLine===false,()=>false);
  const [gameOpen,setGameOpen]=useState(false);

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
