import { defineConfig, globalIgnores } from "eslint/config";
import coreVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...coreVitals,
  ...nextTypescript,
  globalIgnores([".next/**", ".next-dev/**", "dist/**", "next-env.d.ts"]),
]);
