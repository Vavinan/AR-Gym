import { defineConfig } from 'vite'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Check for SSL certificates
const sslDir = join(__dirname, 'ssl')
const certFile = join(sslDir, 'cert.pem')
const keyFile = join(sslDir, 'key.pem')

// Check if HTTPS is requested via environment variable
const useHttps = process.env.VITE_HTTPS === 'true' || process.env.VITE_HTTPS === '1'

// HTTPS configuration
let httpsConfig = undefined
if (useHttps) {
  if (existsSync(certFile) && existsSync(keyFile)) {
    // Use custom certificates if available
    httpsConfig = {
      cert: readFileSync(certFile),
      key: readFileSync(keyFile)
    }
    console.log('✓ Using custom SSL certificates from ssl/ directory')
  } else {
    // Use Vite's built-in certificate generation
    httpsConfig = true
    console.log('✓ Using Vite\'s built-in HTTPS (temporary certificates)')
  }
}

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    https: httpsConfig,
    strictPort: false
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  define: {
    // Define environment variables if needed
  }
})

