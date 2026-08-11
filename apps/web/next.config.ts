import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/core", "@repo/db"],
  typedRoutes: true,
};

export default nextConfig;
