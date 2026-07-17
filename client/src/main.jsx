import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const rootEl = document.getElementById("root");
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
// Menandai bahwa React berhasil mulai render, supaya error handler
// global di index.html tidak menimpa UI yang sudah berhasil tampil
// kalau ada error lain (tidak fatal) yang terjadi belakangan.
rootEl.dataset.appMounted = "1";
