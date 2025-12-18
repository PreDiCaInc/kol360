/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove 'export' - use standard build for SPA with CloudFront fallback
  // For S3/CloudFront: configure CloudFront to return index.html for 404s
  transpilePackages: ['@kol360/shared'],

  // Enable trailing slashes for cleaner S3 paths
  trailingSlash: true,

  // Disable image optimization for static hosting (use unoptimized or external loader)
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
