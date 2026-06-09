/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg is a Node-only dependency; keep it external to the server bundle.
  serverExternalPackages: ['pg'],
};

export default nextConfig;
