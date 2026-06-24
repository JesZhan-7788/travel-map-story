import React from "react";
import ReactDOM from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { App } from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

try {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  root.innerHTML = `<main class="state-screen">页面加载失败，请刷新后重试。${String(error)}</main>`;
}
