/** @type {import('next').NextConfig} */
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
    API_BASE_URL: process.env.API_BASE_URL || "http://localhost:8080",
  },
};

module.exports = nextConfig;
