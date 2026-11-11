import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const chunkGroups: Record<string, string> = {
  react: "vendor-react",
  "react-dom": "vendor-react",
  scheduler: "vendor-react",
  "react-router": "vendor-router",
  "react-router-dom": "vendor-router",
  "date-fns": "vendor-date",
  "@date-fns/tz": "vendor-date",
  "@e965/xlsx": "vendor-xlsx",
  "react-day-picker": "vendor-ui",
  "lucide-react": "vendor-ui",
};

/** Pacotes usados só por páginas abertas sob demanda (gráficos da página inicial). */
const lazyPackages = /^(recharts|d3-[a-z-]+|victory-vendor|eventemitter3|@reduxjs\/toolkit|react-redux|redux|redux-thunk|reselect|immer|decimal\.js-light|es-toolkit|tiny-invariant|internmap|use-sync-external-store)$/;

function getPackageName(id: string) {
  const [, pathAfterNodeModules] = id.split("node_modules/");
  if (!pathAfterNodeModules) return null;

  const parts = pathAfterNodeModules.split("/");
  if (parts[0].startsWith("@") && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    target: "esnext",
    sourcemap: false,
    outDir: "dist",
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          const pkgName = getPackageName(id);
          if (!pkgName) return "vendor";
          // Gráficos só aparecem na página inicial: ficam no pedaço dela, carregado
          // só quando ela abre, e não atrasam a abertura do programa.
          if (lazyPackages.test(pkgName)) return;

          return chunkGroups[pkgName] ?? "vendor";
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [react(), tailwindcss()],
});
