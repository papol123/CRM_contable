/** @type {import('next').NextConfig} */
const backendTarget =
  process.env.BACKEND_API_URL ||
  'https://crm-contable-api-916812392845.us-east1.run.app/api/v1';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
