/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@chatbox/types', '@chatbox/config', '@chatbox/validation'],
};

export default nextConfig;
