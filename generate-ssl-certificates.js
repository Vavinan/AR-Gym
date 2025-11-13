#!/usr/bin/env node
/**
 * Generate self-signed SSL certificates for local HTTPS development
 * This allows camera access when serving the AR app over HTTPS
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const sslDir = join(__dirname, 'ssl')
const certFile = join(sslDir, 'cert.pem')
const keyFile = join(sslDir, 'key.pem')

function generateCertificates() {
  // Create ssl directory if it doesn't exist
  if (!existsSync(sslDir)) {
    mkdirSync(sslDir, { recursive: true })
    console.log('✓ Created ssl directory')
  }

  // Check if certificates already exist
  if (existsSync(certFile) && existsSync(keyFile)) {
    console.log('✓ SSL certificates already exist in ssl/ directory')
    console.log(`  - Certificate: ${certFile}`)
    console.log(`  - Private Key: ${keyFile}`)
    console.log('\nTo regenerate, delete the existing certificates first.')
    return true
  }

  console.log('\nGenerating self-signed SSL certificates...')
  console.log('='.repeat(60))

  try {
    // Get local IP address (optional, for better certificate)
    let commonName = 'localhost'
    try {
      // Try to get local IP (simplified - may need adjustment for Windows)
      const os = await import('os')
      const interfaces = os.networkInterfaces()
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            commonName = iface.address
            break
          }
        }
        if (commonName !== 'localhost') break
      }
    } catch (e) {
      // Fallback to localhost
      commonName = 'localhost'
    }

    // OpenSSL command to generate self-signed certificate
    const opensslCmd = [
      'openssl',
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      keyFile,
      '-out',
      certFile,
      '-days',
      '365',
      '-nodes',
      '-subj',
      `/CN=${commonName}/O=AR Fitness App/C=US`
    ]

    execSync(opensslCmd.join(' '), { stdio: 'inherit' })

    console.log('\n' + '='.repeat(60))
    console.log('✓ SSL certificates generated successfully!')
    console.log('='.repeat(60))
    console.log(`\nCertificate: ${certFile}`)
    console.log(`Private Key: ${keyFile}`)
    console.log('\n⚠️  IMPORTANT:')
    console.log('   - These are self-signed certificates for development only')
    console.log('   - Your browser will show a security warning')
    console.log('   - Click "Advanced" and "Proceed anyway" to continue')
    console.log('   - This is safe for local development')
    console.log('\n✓ You can now run: npm run dev:https')
    console.log('='.repeat(60) + '\n')
    return true
  } catch (error) {
    console.error('\n❌ Error generating certificates:', error.message)
    console.log('\nMake sure OpenSSL is installed:')
    console.log('  - Windows: Install from https://slproweb.com/products/Win32OpenSSL.html')
    console.log('  - macOS: Already installed (or: brew install openssl)')
    console.log('  - Linux: sudo apt-get install openssl')
    return false
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateCertificates()
}

export { generateCertificates }

