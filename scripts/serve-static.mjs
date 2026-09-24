import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve, extname, isAbsolute, relative } from 'node:path'

const outputDirectory = resolve(process.cwd(), 'out')
const port = Number.parseInt(process.env.PORT || '3000', 10)
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
}

if (!existsSync(outputDirectory)) {
  throw new Error('Static export not found. Run `npm run build` before `npm start`.')
}

createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost')
  const requestedPath = decodeURIComponent(requestUrl.pathname)
  const candidate = resolve(outputDirectory, `.${requestedPath}`)
  const relativePath = relative(outputDirectory, candidate)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  const filePath = existsSync(candidate) && statSync(candidate).isDirectory()
    ? resolve(candidate, 'index.html')
    : candidate
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404)
    response.end('Not found')
    return
  }

  response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' })
  createReadStream(filePath).pipe(response)
}).listen(port, () => {
  console.log(`Serving ${outputDirectory} at http://localhost:${port}`)
})
