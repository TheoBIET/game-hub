import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Avatar upload sends a base64 data URI through a server action. With an
    // 8 MB raw cap the data URI lands around ~10.7 MB, so the default 1 MB
    // body limit rejects the request with a 500 before our action runs.
    serverActions: { bodySizeLimit: '12mb' },
  },
  transpilePackages: [
    '@tabswitch/connect4',
    '@tabswitch/db',
    '@tabswitch/gif-battle',
    '@tabswitch/rps',
    '@tabswitch/tictactoe',
    '@tabswitch/types',
    '@tabswitch/ui',
  ],
  // Prisma 7 client + pg driver adapter run server-side only; keep them
  // external so the generated client and pg's dynamic requires aren't bundled.
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-pg',
    '@prisma/client-runtime-utils',
    'pg',
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.giphy.com' },
      { protocol: 'https', hostname: 'media0.giphy.com' },
      { protocol: 'https', hostname: 'media1.giphy.com' },
      { protocol: 'https', hostname: 'media2.giphy.com' },
      { protocol: 'https', hostname: 'media3.giphy.com' },
      { protocol: 'https', hostname: 'media4.giphy.com' },
      { protocol: 'https', hostname: 'i.giphy.com' },
      { protocol: 'https', hostname: 'media.tenor.com' },
      { protocol: 'https', hostname: 'media1.tenor.com' },
      { protocol: 'https', hostname: 'media2.tenor.com' },
      { protocol: 'https', hostname: 'c.tenor.com' },
    ],
  },
  webpack: (config) => {
    // Resolve .js imports to .ts in workspace packages (NodeNext-style).
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
