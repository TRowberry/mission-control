/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip ESLint during builds (workaround for scanner2.getTokenText error)
  eslint: {
    ignoreDuringBuilds: true,
  },
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
