/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip ESLint during builds (workaround for scanner2.getTokenText error)
  typescript: { ignoreBuildErrors: true },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Keep ws and bufferutil as external (not bundled) so native bindings work
  serverExternalPackages: ['ws', 'bufferutil', 'utf-8-validate'],
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
