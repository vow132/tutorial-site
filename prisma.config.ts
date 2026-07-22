import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load production defaults first, then local defaults without overriding values
// already supplied by the shell/container environment.
if (process.env.NODE_ENV === "production") {
  loadEnv({ path: ".env.production" });
}
loadEnv({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});