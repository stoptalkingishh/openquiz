const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
const buildVersion =
  process.env.NEXT_PUBLIC_BUILD_VERSION || process.env.GITHUB_SHA || `local-${Date.now()}`

module.exports = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  basePath,
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
}
