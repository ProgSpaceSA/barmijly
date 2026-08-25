import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "barmijly.ai", pathname: "/**" },
      { protocol: "http", hostname: "localhost", port: "3001", pathname: "/**" },
      { protocol: "http", hostname: "localhost", port: "3002", pathname: "/**" },
    ],
  },
  // Root package-lock.json (Husky) must not become the Next.js workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
