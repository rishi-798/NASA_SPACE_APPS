import type { ReactNode } from "react";

type RouteIntroProps = {
  eyebrow: string;
  title: ReactNode;
  description: string;
  side?: ReactNode;
};

export function RouteIntro({ eyebrow, title, description, side }: RouteIntroProps) {
  return (
    <header className="route-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="route-intro-copy">
        <p>{description}</p>
        {side}
      </div>
    </header>
  );
}
