import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // StellarWalletsKit membawa dependency (WalletConnect, NEAR wallet, dll)
  // yang mengasumsikan environment Node.js dan pakai variabel global `global`.
  // Vite tidak polyfill ini secara default (beda dari Webpack), jadi perlu
  // didefinisikan manual supaya tidak error "global is not defined" di browser.
  define: {
    global: "globalThis",
  },
  server: {
    port: 5173,
  },
  test: {
    environment: "node",
    globals: false,
  },
});
