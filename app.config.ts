import { defineConfig } from "@tanstack/react-start/config";

export default defineConfig({
      tsr: {
              appDirectory: "src",
      },
      server: {
              preset: "cloudflare-worker",
      },
});
