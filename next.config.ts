import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
     rules: {
        '*.txt': {
          loaders: ['raw-loader'],
          as: '*.js',
        },
     },
  },
};

export default nextConfig;
