/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kol360/shared'],

  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Disable image optimization (can enable with external loader later)
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
