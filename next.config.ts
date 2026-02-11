import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  basePath: isGitHubPages ? "/claude_test" : "",
  assetPrefix: isGitHubPages ? "/claude_test/" : "",
};

export default nextConfig;
