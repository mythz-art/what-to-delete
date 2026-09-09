import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@/styles/globals.css";
import App from "@/App";
import { TerminalWindowApp } from "@/components/TerminalConsole";

const isTerminalWindow =
  typeof window !== "undefined" && window.location.hash.includes("terminal");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isTerminalWindow ? <TerminalWindowApp /> : <App />}
  </React.StrictMode>
);
