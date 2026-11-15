import { useEffect } from "react";
import { AsteroidShooterGame } from "./AsteroidShooterGame";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  calculationReady?: boolean;
  onCalculationFinished?: () => void;
};

export function AsteroidModal({ isOpen, onClose, calculationReady, onCalculationFinished }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="game-modal-backdrop" role="dialog" aria-modal="true" aria-label="Asteroid Defense Mini-Game">
      <AsteroidShooterGame
        onClose={onClose}
        isOverlay={false}
        calculationReady={calculationReady}
        onCalculationFinished={onCalculationFinished}
      />
    </div>
  );
}
