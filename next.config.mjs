/** @type {import('next').NextConfig} */
const nextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    experimental: {
        serverActions: {
            allowedOrigins: ['localhost:3000', 'bi-flow.vercel.app']
        }
    }
};

export default nextConfig;
