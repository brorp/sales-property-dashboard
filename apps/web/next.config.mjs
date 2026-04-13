/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/wv/:path*',
        destination: 'http://localhost:3002/:path*', // Default config for Widari Village Local PM2 test
      },
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*', // Default config for Widari Residence Local PM2
      }
    ];
  }
};

export default nextConfig;
