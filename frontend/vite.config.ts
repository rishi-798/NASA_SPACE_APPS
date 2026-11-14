import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumSource = "node_modules/cesium/Build/Cesium";

export default defineConfig(({ isSsrBuild }) => ({
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium"),
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(!isSsrBuild ? [viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Workers`, dest: "cesium", rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Assets`, dest: "cesium", rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Widgets`, dest: "cesium", rename: { stripBase: 4 } },
        { src: `${cesiumSource}/ThirdParty`, dest: "cesium", rename: { stripBase: 4 } },
        { src: "node_modules/three/examples/jsm/libs/draco/gltf/*", dest: "draco", rename: { stripBase: 7 } },
      ],
    })] : []),
  ],
  ssr: { noExternal: ["gsap", "@gsap/react"] },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  preview: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
}));
