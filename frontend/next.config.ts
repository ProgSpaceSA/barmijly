import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: { domains: ["barmijly.ai"] },
};

export default nextConfig;
