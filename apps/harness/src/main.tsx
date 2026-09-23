import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { IS_MAC_TAURI } from "./lib/platform";
import "./index.css";

// Before first paint, so the transparent (vibrancy) background never flashes solid.
if (IS_MAC_TAURI) document.documentElement.classList.add("is-mac-tauri");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
