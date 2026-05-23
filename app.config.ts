import { defineConfig } from "@tanstack/react-start/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    tsr: {
    appDirectory: "src",
      },
        vite: {
    plugins: [tsConfigPaths()],
      },
        server: {
    preset: "cloudflare-worker",
      },
});
