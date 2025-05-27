/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configure webpack
  webpack: (config) => {
    // Configure module resolution
    config.resolve.alias = {
      ...config.resolve.alias,
      // Ensure alias resolution works properly
      '@': __dirname,
      '@lib': __dirname + '/lib',
    };
    return config;
  },
};

module.exports = nextConfig;
