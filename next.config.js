/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Ensure the window-display photo folder is bundled with the serverless
  // function so /api/window/photos can list it at runtime on Vercel.
  outputFileTracingIncludes: {
    '/api/window/photos': ['./public/window/**'],
  },
}

module.exports = nextConfig
