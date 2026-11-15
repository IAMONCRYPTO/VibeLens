import type { NextConfig } from "next";

const staticExport = process.env.VIBELENS_STATIC_EXPORT === "true";

const config: NextConfig = {
  distDir: staticExport ? "dist" : process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  ...(staticExport && { output: "export", images: { unoptimized: true } }),
  poweredByHeader: false,
  devIndicators: false,
  agentRules: false,
};

export default config;
