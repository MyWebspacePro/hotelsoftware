import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Dev-Proxy: /api → Fastify (Produktion übernimmt nginx im Container)
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
});
