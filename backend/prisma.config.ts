import "dotenv/config";
import { defineConfig } from "prisma/config";

// Rodado sempre com --config backend/prisma.config.ts (ver os scripts do
// package.json). Os caminhos abaixo são relativos a este arquivo.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node backend/prisma/seed.js",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
