/** @type {import('next').NextConfig} */
const apiOrigin = process.env.API_BASE_URL || "http://72.56.5.153:8080";

const nextConfig = {
  reactStrictMode: true,
  // Allow YouTube thumbnails when we wire real data in
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
  },
  // Public env consumed by lib/api.ts
  env: {
    API_BASE_URL: apiOrigin,
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
