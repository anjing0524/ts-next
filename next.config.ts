const nextConfig = {
  output: 'standalone',
  async headers() {
    // Define cross-origin isolation headers
    const crossOriginIsolationHeaders = [
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
      { key: 'Permissions-Policy', value: 'interest-cohort=()' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
    ];

    return [
      {
        source: '/:path*',
        headers: crossOriginIsolationHeaders,
      },
    ];
  },
};

export default nextConfig;
