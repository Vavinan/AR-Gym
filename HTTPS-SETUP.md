# HTTPS Setup Guide

This guide explains how to set up HTTPS for the AR Fitness Vite app, which is required for:
- Camera access (browsers require HTTPS for `getUserMedia` in many cases)
- WebRTC/PeerJS connections
- Secure WebSocket (WSS) connections
- Production deployments

## Quick Start

### 1. Generate SSL Certificates

```bash
npm run generate-ssl
```

This will create self-signed SSL certificates in the `ssl/` directory.

### 2. Start Development Server with HTTPS

```bash
npm run dev:https
```

The app will be available at `https://localhost:3000`

## Detailed Setup

### Option 1: Using Generated Certificates (Recommended for Development)

1. **Generate certificates:**
   ```bash
   npm run generate-ssl
   ```

2. **Start HTTPS server:**
   ```bash
   npm run dev:https
   ```

3. **Accept security warning:**
   - Your browser will show a security warning (self-signed certificate)
   - Click "Advanced" → "Proceed to localhost (unsafe)"
   - This is safe for local development

### Option 2: Using Vite's Built-in HTTPS

If you don't want to generate certificates, Vite can create temporary ones:

```bash
npm run dev:https
```

This uses Vite's built-in certificate generation (less secure, but faster for quick testing).

### Option 3: Using Existing Certificates

If you have existing SSL certificates:

1. Place them in the `ssl/` directory:
   - `ssl/cert.pem` - Certificate file
   - `ssl/key.pem` - Private key file

2. Start the server:
   ```bash
   npm run dev:https
   ```

## Configuration

### Vite Configuration

The `vite.config.js` automatically detects SSL certificates in the `ssl/` directory:

```javascript
// Automatically loads certificates if they exist
const httpsConfig = existsSync(certFile) && existsSync(keyFile) ? {
  cert: readFileSync(certFile),
  key: readFileSync(keyFile)
} : undefined
```

### WebSocket Connection

The app automatically upgrades WebSocket connections to WSS when served over HTTPS:

- HTTP page → `ws://` connections
- HTTPS page → `wss://` connections (secure)

## Production Deployment

### Vercel

Vercel automatically provides HTTPS for all deployments. No additional configuration needed.

### Other Platforms

For other hosting platforms:

1. **Use platform-provided SSL:**
   - Most platforms (Netlify, Cloudflare Pages, etc.) provide free SSL
   - No additional setup required

2. **Custom SSL certificates:**
   - Upload your certificates through the platform's dashboard
   - Configure the platform to use them

## Troubleshooting

### Certificate Generation Fails

**Problem:** `npm run generate-ssl` fails

**Solutions:**
- **Windows:** Install OpenSSL from https://slproweb.com/products/Win32OpenSSL.html
- **macOS:** `brew install openssl` (if not already installed)
- **Linux:** `sudo apt-get install openssl` (Ubuntu/Debian)

### Browser Security Warning

**Problem:** Browser shows "Not Secure" or certificate warning

**Solution:**
- This is expected for self-signed certificates
- Click "Advanced" → "Proceed anyway"
- For local development, this is safe

### Camera Not Working

**Problem:** Camera access denied even with HTTPS

**Solutions:**
1. Ensure you're accessing via `https://` (not `http://`)
2. Check browser console for errors
3. Verify camera permissions in browser settings
4. Try a different browser (Chrome, Firefox, Edge)

### WebSocket Connection Fails

**Problem:** Can't connect to relay server over WSS

**Solutions:**
1. Ensure your Python server is configured for WSS (SSL enabled)
2. Check that certificates match between client and server
3. Verify firewall allows WSS connections (port 8080 or your configured port)
4. Check browser console for connection errors

## Security Notes

### Development (Self-Signed Certificates)

- Self-signed certificates are **only for development**
- Browsers will show security warnings
- This is normal and safe for local development
- Never use self-signed certificates in production

### Production

- Use proper SSL certificates from a Certificate Authority (CA)
- Vercel and most platforms provide free SSL automatically
- Ensure all WebSocket connections use WSS (not WS)
- Keep certificates up to date

## Certificate Management

### Regenerating Certificates

To regenerate certificates:

1. Delete existing certificates:
   ```bash
   rm -rf ssl/
   ```

2. Generate new ones:
   ```bash
   npm run generate-ssl
   ```

### Certificate Expiration

Self-signed certificates are valid for 365 days. To renew:

1. Delete old certificates
2. Run `npm run generate-ssl` again

## Network Access

### Accessing from Mobile Device

1. Find your computer's IP address:
   - **Windows:** `ipconfig` (look for IPv4 Address)
   - **macOS/Linux:** `ifconfig` or `ip addr`

2. Access from mobile:
   ```
   https://YOUR_IP_ADDRESS:3000
   ```

3. Accept the security warning on mobile device

4. Grant camera permissions when prompted

### Firewall Configuration

Ensure your firewall allows:
- Incoming connections on port 3000 (HTTPS)
- Incoming connections on port 8080 (WSS relay server)

## Additional Resources

- [Vite HTTPS Documentation](https://vitejs.dev/config/server-options.html#server-https)
- [WebRTC Security](https://webrtc.org/getting-started/overview)
- [OpenSSL Documentation](https://www.openssl.org/docs/)

