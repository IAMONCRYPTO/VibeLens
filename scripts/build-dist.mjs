import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const build = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VIBELENS_STATIC_EXPORT: "true",
    NEXT_PUBLIC_ENABLE_FIREBASE_MUTATE: process.env.NEXT_PUBLIC_ENABLE_FIREBASE_MUTATE ?? "true",
  },
});

if (build.error) throw build.error;
process.exitCode = build.status ?? 1;
