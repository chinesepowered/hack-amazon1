import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strands Agents SDK dynamically imports optional AWS packages; keep it out of the bundler.
  serverExternalPackages: ["@strands-agents/sdk"],
  async headers() {
    return [
      {
        source: "/.well-known/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
