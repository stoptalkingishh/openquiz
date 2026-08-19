const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

module.exports = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  basePath,
}