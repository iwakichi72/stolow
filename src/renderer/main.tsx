import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { SettingsApp } from "./settings/SettingsApp";
import "./styles.css";

const url = new URL(window.location.href);
const view = url.searchParams.get("view") ?? "main";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {view === "settings" ? <SettingsApp /> : <App />}
  </React.StrictMode>
);
