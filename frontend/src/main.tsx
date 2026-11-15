import "@fontsource-variable/outfit";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";
import "./cinematic.css";
import "./asteroid-game.css";

// Register Service Worker for offline capability and cached asset delivery
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("CLPS Lunar ServiceWorker registered:", reg.scope);
      })
      .catch((err) => {
        console.warn("ServiceWorker registration failed:", err);
      });
  });
}

const application = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

const container = document.getElementById("root")!;
if (container.hasChildNodes() && window.location.pathname === "/") {
  hydrateRoot(container, application);
} else {
  createRoot(container).render(application);
}
