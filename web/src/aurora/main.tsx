import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./aurora.css";
import { HERMES_BASE_PATH } from "@/lib/api";
import { AuroraApp } from "./AuroraApp";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter basename={HERMES_BASE_PATH || undefined}>
    <AuroraApp />
  </BrowserRouter>,
);
