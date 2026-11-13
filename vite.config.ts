import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const bridgeTarget = {
    target: `http://127.0.0.1:${env.SEIDR_COPILOT_PORT || 3001}`,
    changeOrigin: true,
    timeout: 210_000,
    proxyTimeout: 210_000,
  };
  const copilotProxy = {
    "/api/copilot": bridgeTarget,
    "/api/crawl": bridgeTarget,
  };
  return {
    server: {
      host: "127.0.0.1",
      port: 8080,
      strictPort: true,
      proxy: copilotProxy,
    },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true, proxy: copilotProxy },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
