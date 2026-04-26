/** @type {import('next').NextConfig} */
// Read API_BASE_URL at server start (rewrites destination) AND let server-side
// modules read process.env.API_BASE_URL at runtime — do NOT pass it through
// the `env` config option, which would inline the build-time value into
// bundles and override the docker-set env var on the running container.
const apiOrigin = process.env.API_BASE_URL || "http://localhost:8080";

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
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
