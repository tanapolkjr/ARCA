import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // "@" is used by the Sourcing module (TypeScript). Platform code keeps
  // relative imports; both styles work.
  resolve: { alias: { "@": path.resolve(root, "src") } },
  server: { host: true, port: 5173 },
});
