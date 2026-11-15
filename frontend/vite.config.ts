import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "node_modules/cesium/Build/Cesium";

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium"),
  },
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Workers`, dest: "cesium", rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Assets`, dest: "cesium", rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Widgets`, dest: "cesium", rename: { stripBase: 4 } },
        { src: `${cesiumSource}/ThirdParty`, dest: "cesium", rename: { stripBase: 4 } },
      ],
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
