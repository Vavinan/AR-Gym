# Setup Guide - AR Fitness Vite App

## Quick Start

### 1. Install Dependencies

```bash
cd vite-ar-app
npm install
```

### 2. Generate SSL Certificates (Optional but Recommended)

For HTTPS support (required for camera access):

```bash
npm run generate-ssl
```

### 3. Start Development Server

**HTTP:**
```bash
npm run dev
```
The app will be available at `http://localhost:3000`

**HTTPS (Recommended):**
```bash
npm run dev:https
```
The app will be available at `https://localhost:3000`

> **Important:** HTTPS is required for camera access in most browsers. See [HTTPS-SETUP.md](./HTTPS-SETUP.md) for detailed setup instructions.

### 4. Start Your Python Server

In a separate terminal, start your local Python server:

```bash
cd AR/relay-server
python visualizer_server.py
```

The server will start on `ws://localhost:8080` (or the port you configured)

## Connecting to Local Server

### Local Development

When running locally, the app will automatically try to connect to `localhost:8080`. If your server is on a different port, configure it in Relay Settings.

### Vercel Deployment

When deployed on Vercel, you need a WebSocket proxy/tunnel to connect to your local server:

#### Option 1: Using ngrok

1. Install ngrok: https://ngrok.com/download
2. Start tunnel:
   ```bash
   ngrok http 8080
   ```
3. Copy the WebSocket URL (e.g., `wss://abc123.ngrok.io`)
4. In the app, go to Relay Settings
5. Enter the proxy URL in "Proxy/Tunnel URL" field
6. Save configuration

#### Option 2: Using Cloudflare Tunnel

1. Install Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/
2. Start tunnel:
   ```bash
   cloudflared tunnel --url localhost:8080
   ```
3. Use the provided WebSocket URL in Relay Settings

## Side Camera Setup

### Main Device (AR App)

1. Open the main AR app
2. Click "Connect Side Camera"
3. A Peer ID will be generated and copied to clipboard
4. The Peer ID will be displayed in the Connection Panel

### Side Camera Device

1. Open `side-camera.html` on the side camera device
   - Local: `http://localhost:3000/side-camera.html`
   - Vercel: `https://your-app.vercel.app/side-camera.html`
2. Enter the Peer ID from the main device
3. Click "Connect"
4. Allow camera access when prompted
5. The side camera stream will appear on the main device

## Deployment to Vercel

### 1. Build the App

```bash
npm run build
```

### 2. Deploy to Vercel

```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# Deploy
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

### 3. Configure Proxy URL

After deployment:
1. Set up a tunnel/proxy to your local server (see above)
2. Open the deployed app
3. Go to Relay Settings
4. Enter the proxy/tunnel URL
5. Save configuration

## Troubleshooting

### Connection Issues

**Problem:** Can't connect to relay server
- **Solution:** 
  - Check if Python server is running
  - Verify WebSocket URL in Relay Settings
  - For Vercel: Ensure proxy/tunnel is configured and running

**Problem:** Side camera not connecting
- **Solution:**
  - Verify Peer ID is correct
  - Check if both devices are online
  - Ensure camera permissions are granted
  - Try refreshing both pages

**Problem:** Proxy connection fails
- **Solution:**
  - Verify tunnel/proxy service is running
  - Check WebSocket URL format (use `wss://` for secure)
  - Ensure firewall allows connections
  - Test the proxy URL directly in browser

### Build Issues

**Problem:** Build fails on Vercel
- **Solution:**
  - Ensure `vercel-build` script is in package.json
  - Check that all dependencies are listed in package.json
  - Verify Node.js version compatibility

## Configuration Files

- `vite.config.js` - Vite build configuration
- `vercel.json` - Vercel deployment configuration
- `package.json` - Dependencies and scripts

## Environment Variables

No environment variables are required for basic setup. All configuration is done through the UI.

## Support

For issues or questions, check:
- README.md for general information
- Console logs for debugging information
- Network tab for connection issues

