import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/weatherstack": {
        target: "http://api.weatherstack.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/weatherstack/, "")
      }
    }
  }
});
