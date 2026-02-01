/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@pkg/agent", "@pkg/db", "@pkg/retrieval", "@pkg/shared"],
  experimental: {
    serverComponentsExternalPackages: ["@mastra/core"],
  },
};

export default nextConfig;
