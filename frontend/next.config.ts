import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { domains: ["barmijly.ai"] },
  // Root package-lock.json (Husky) must not become the Next.js workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
