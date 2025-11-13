# AR-Gym

A modern Vite-based AR Fitness Tracker application with PeerJS support for side camera connections and WebSocket proxy support for connecting to local servers from Vercel deployments.

## Features

- ✅ Vite-based modern build system
- ✅ PeerJS integration for side camera WebRTC connections
- ✅ WebSocket proxy/tunnel support for local server connections
- ✅ Real-time pose detection and feedback
- ✅ Performance metrics tracking
- ✅ Responsive mobile and desktop UI

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate SSL Certificates (for HTTPS)

```bash
npm run generate-ssl
```

### 3. Development

**HTTP (standard):**
```bash
npm run dev
```
The app will be available at `http://localhost:3000`

**HTTPS (recommended for camera access):**
```bash
npm run dev:https
```
The app will be available at `https://localhost:3000`

> **Note:** HTTPS is recommended for camera access and WebRTC connections. See [HTTPS-SETUP.md](./HTTPS-SETUP.md) for details.

### 4. Build for Production

```bash
npm run build
```

### 5. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

## Configuration

### Relay Server Connection

The app needs to connect to your local Python server (`visualizer_server.py`). There are two ways to configure this:

#### Option 1: Direct Connection (Local Development)

1. Start your local server: `python AR/relay-server/visualizer_server.py`
2. The app will auto-detect the server on `localhost:8080`
3. Or manually configure the WebSocket URL in Relay Settings

#### Option 2: Proxy/Tunnel (Vercel Deployment)

When deployed on Vercel, you need a WebSocket proxy/tunnel to connect to your local server:

1. **Using ngrok:**
   ```bash
   ngrok http 8080
   # Use the WebSocket URL: wss://your-tunnel.ngrok.io
   ```

2. **Using Cloudflare Tunnel:**
   ```bash
   cloudflared tunnel --url localhost:8080
   ```

3. **Configure in App:**
   - Open Relay Settings
   - Enter the proxy/tunnel URL in "Proxy/Tunnel URL" field
   - Save configuration

### Side Camera Connection (PeerJS)

1. Open the app on your main AR device
2. Click "Connect Side Camera"
3. A Room ID will be generated and copied to clipboard
4. Open the side camera device and connect using the Room ID
5. The side camera stream will appear in the side view panel

## Project Structure

```
vite-ar-app/
├── src/
│   ├── js/
│   │   ├── relay-config.js      # Relay configuration management
│   │   ├── relay-connection.js   # WebSocket connection with proxy support
│   │   └── side-camera-manager.js # PeerJS side camera manager
│   ├── main.js                   # Main entry point
│   └── styles.css                # Application styles
├── index.html                    # Main HTML file
├── package.json                  # Dependencies
├── vite.config.js               # Vite configuration
└── vercel.json                   # Vercel deployment config
```

## Key Features

### WebSocket Proxy Support

The app supports connecting to local servers from Vercel deployments using:
- Proxy URL configuration
- Auto-detection for local development
- Fallback mechanisms

### PeerJS Integration

- Automatic peer ID generation
- Room-based connections
- Video and data channel support
- Automatic reconnection handling

## Troubleshooting

### Connection Issues

1. **Can't connect to relay server:**
   - Check if local server is running
   - Verify WebSocket URL in Relay Settings
   - For Vercel: Configure proxy/tunnel URL

2. **Side camera not connecting:**
   - Ensure both devices are on the same network
   - Check PeerJS server connectivity
   - Verify Room ID is correct

3. **Proxy connection fails:**
   - Ensure tunnel/proxy service is running
   - Check WebSocket URL format (wss:// for secure)
   - Verify firewall settings

## Development Notes

- The app uses ES modules
- PeerJS is used instead of Firebase for signaling
- WebSocket connections support both direct and proxy modes
- All configuration is stored in localStorage

## License

MIT

