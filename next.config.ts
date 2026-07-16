import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Player photos are downscaled client-side, but allow headroom for uploads.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
