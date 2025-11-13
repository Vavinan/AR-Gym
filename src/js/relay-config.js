// Relay Node Configuration with Proxy/Tunnel Support for Vercel Deployment
export class RelayNodeConfig {
  constructor() {
    this.defaultConfig = {
      enabled: true,
      url: '',  // Will be auto-detected based on local IP or use proxy
      proxyUrl: '', // Proxy/tunnel URL for connecting from Vercel to local server
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      dataTransmissionInterval: 100,
      enableBiometricData: true,
      enablePoseData: true,
      enableRepDetection: true,
      enableVideoFrames: false,
      compressionEnabled: true,
      encryptionEnabled: false
    }
  }

  loadConfig() {
    const config = { ...this.defaultConfig }
    
    const storedConfig = localStorage.getItem('relayNodeConfig')
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig)
        Object.assign(config, parsed)
      } catch (error) {
        console.warn('Failed to parse stored relay config, using defaults:', error)
      }
    }
    
    return config
  }

  saveConfig(config) {
    try {
      localStorage.setItem('relayNodeConfig', JSON.stringify(config))
      console.log('Relay node configuration saved')
    } catch (error) {
      console.error('Failed to save relay node configuration:', error)
    }
  }

  updateConfig(updates) {
    const currentConfig = this.loadConfig()
    const newConfig = { ...currentConfig, ...updates }
    this.saveConfig(newConfig)
    return newConfig
  }

  resetConfig() {
    this.saveConfig(this.defaultConfig)
    return this.defaultConfig
  }

  validateConfig(config) {
    const errors = []
    
    if (config.url && !this.isValidWebSocketUrl(config.url)) {
      errors.push('Invalid WebSocket URL format')
    }
    
    // Proxy URL can be HTTPS (will be converted to WSS) or WSS
    if (config.proxyUrl && !this.isValidWebSocketUrl(config.proxyUrl) && !this.isValidProxyUrl(config.proxyUrl)) {
      errors.push('Invalid Proxy URL format (use https:// or wss://)')
    }
    
    if (config.reconnectInterval < 1000) {
      errors.push('Reconnect interval must be at least 1000ms')
    }
    
    if (config.maxReconnectAttempts < 0) {
      errors.push('Max reconnect attempts must be non-negative')
    }
    
    if (config.dataTransmissionInterval < 50) {
      errors.push('Data transmission interval must be at least 50ms')
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    }
  }

  isValidWebSocketUrl(url) {
    try {
      const urlObj = new URL(url)
      return urlObj.protocol === 'ws:' || urlObj.protocol === 'wss:'
    } catch {
      return false
    }
  }

  isValidProxyUrl(url) {
    try {
      const urlObj = new URL(url)
      // Accept HTTPS URLs for proxy (will be converted to WSS)
      return urlObj.protocol === 'https:'
    } catch {
      return false
    }
  }

  // Get the effective WebSocket URL (proxy if available, otherwise direct)
  getEffectiveUrl() {
    const config = this.loadConfig()
    // Prefer proxy URL if available (for Vercel deployment)
    if (config.proxyUrl) {
      return config.proxyUrl
    }
    // Fallback to direct URL
    return config.url || ''
  }

  getConnectionStatusText(isConnected, reconnectAttempts, maxAttempts) {
    if (isConnected) {
      return 'Connected to Relay Node'
    } else if (reconnectAttempts > 0) {
      return `Reconnecting... (${reconnectAttempts}/${maxAttempts})`
    } else {
      return 'Disconnected from Relay Node'
    }
  }

  getConnectionStatusClass(isConnected, reconnectAttempts) {
    if (isConnected) {
      return 'relay-status-connected'
    } else if (reconnectAttempts > 0) {
      return 'relay-status-reconnecting'
    } else {
      return 'relay-status-disconnected'
    }
  }
}

