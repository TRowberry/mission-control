/** @type {import('next').NextConfig} */
const nextConfig = {
  // Not using standalone - custom server.js with Socket.io
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
