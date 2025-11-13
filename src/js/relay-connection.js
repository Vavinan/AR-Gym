// Relay Connection Manager with Proxy/Tunnel Support
import { RelayNodeConfig } from './relay-config.js'

export class RelayConnection {
  constructor() {
    this.config = new RelayNodeConfig()
    this.websocket = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.reconnectTimer = null
    this.deviceId = this.generateDeviceId()
    this.currentExerciseType = null
    
    // Event handlers
    this.onMessageHandlers = []
    this.onConnectHandlers = []
    this.onDisconnectHandlers = []
  }

  generateDeviceId() {
    return 'ar-device-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now()
  }

  async connect() {
    const config = this.config.loadConfig()
    const url = this.config.getEffectiveUrl()
    
    // On Vercel/production, require proxy URL if not on localhost
    const isProduction = window.location.hostname.includes('vercel.app') || 
                        (window.location.hostname.includes('.') && 
                         !window.location.hostname.includes('localhost') &&
                         !window.location.hostname.includes('127.0.0.1'))
    
    if (!url) {
      console.warn('No WebSocket URL configured. Attempting to auto-detect...')
      // Try to detect local IP or use proxy
      await this.attemptAutoConnect()
      return
    }
    
    // Warn if trying to use direct URL on production without proxy
    if (isProduction && !config.proxyUrl && url && !url.includes('ngrok') && !url.includes('cloudflare')) {
      console.warn('⚠️ On production (Vercel), you should use a proxy/tunnel URL (ngrok, etc.)')
      console.warn('⚠️ Direct WebSocket connections may not work from HTTPS pages')
    }

    this.connectToUrl(url)
  }

  async attemptAutoConnect() {
    // First, try to use proxy URL if configured
    const config = this.config.loadConfig()
    if (config.proxyUrl) {
      console.log('Using configured proxy URL:', config.proxyUrl)
      this.connectToUrl(config.proxyUrl)
      return
    }

    // Determine protocol based on current page protocol
    const isSecure = window.location.protocol === 'https:'
    const protocol = isSecure ? 'wss:' : 'ws:'
    
    // Try to detect local server (only works in local development)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // Try common local server ports
      const ports = [8080, 8081, 9000]
      for (const port of ports) {
        const url = `${protocol}//localhost:${port}`
        console.log(`Attempting to connect to ${url}...`)
        try {
          await this.testConnection(url)
          this.connectToUrl(url)
          return
        } catch (e) {
          console.log(`Failed to connect to ${url}`)
        }
      }
    }

    // If we're on Vercel or production, we need a proxy URL
    if (window.location.hostname.includes('vercel.app') || window.location.hostname.includes('.')) {
      console.warn('⚠️ Running on production. Please configure a proxy/tunnel URL in Relay Settings.')
      console.warn('💡 Use services like ngrok, Cloudflare Tunnel, or similar to expose your local server.')
      this.updateStatus('Disconnected - Proxy URL required', false)
    }
  }

  async testConnection(url) {
    return new Promise((resolve, reject) => {
      const testWs = new WebSocket(url)
      testWs.onopen = () => {
        testWs.close()
        resolve()
      }
      testWs.onerror = () => reject()
      setTimeout(() => reject(new Error('Timeout')), 2000)
    })
  }

  connectToUrl(url) {
    try {
      // Ensure URL uses correct protocol based on current page
      let finalUrl = url
      const isSecure = window.location.protocol === 'https:'
      
      // Convert HTTPS to WSS for proxy URLs (ngrok, etc.)
      if (url.startsWith('https://')) {
        finalUrl = url.replace('https://', 'wss://')
        console.log('Converting HTTPS proxy URL to WSS:', finalUrl)
      }
      // If URL doesn't specify protocol, add it
      else if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        finalUrl = (isSecure ? 'wss://' : 'ws://') + url
      } else if (isSecure && url.startsWith('ws://')) {
        // Upgrade to WSS if page is HTTPS
        finalUrl = url.replace('ws://', 'wss://')
        console.log('Upgrading to secure WebSocket (WSS)')
      }
      
      console.log(`Connecting to relay server: ${finalUrl}`)
      this.websocket = new WebSocket(finalUrl)

      this.websocket.onopen = () => {
        console.log('✓ Connected to relay server')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.updateStatus('Connected', true)
        this.registerDevice()
        this.onConnectHandlers.forEach(handler => handler())
      }

      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
          this.onMessageHandlers.forEach(handler => handler(data))
        } catch (error) {
          console.error('Error parsing message:', error)
        }
      }

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.updateStatus('Connection Error', false)
      }

      this.websocket.onclose = () => {
        console.log('WebSocket closed')
        this.isConnected = false
        this.updateStatus('Disconnected', false)
        this.onDisconnectHandlers.forEach(handler => handler())
        this.attemptReconnect()
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      this.updateStatus('Connection Failed', false)
      this.attemptReconnect()
    }
  }

  registerDevice() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const message = {
        type: 'device_register',
        deviceId: this.deviceId,
        exerciseType: this.currentExerciseType || 'push-ups'
      }
      this.websocket.send(JSON.stringify(message))
      console.log('Device registered:', this.deviceId)
    }
  }

  handleMessage(data) {
    const messageType = data.type

    switch (messageType) {
      case 'performance_metrics':
        this.handlePerformanceMetrics(data.payload)
        break
      case 'ai_feedback':
        this.handleAIFeedback(data.payload)
        break
      case 'system_command':
        this.handleSystemCommand(data.payload)
        break
      default:
        console.log('Unknown message type:', messageType)
    }
  }

  handlePerformanceMetrics(metrics) {
    // Update UI with metrics
    const heartRateEl = document.getElementById('heart-rate')
    const repCountEl = document.getElementById('rep-count')
    const durationEl = document.getElementById('workout-duration')

    if (heartRateEl) {
      heartRateEl.textContent = `${metrics.heartRate || 0} bpm`
    }
    if (repCountEl) {
      repCountEl.textContent = metrics.repCount || 0
    }
    if (durationEl) {
      const minutes = Math.floor((metrics.workoutDuration || 0) / 60)
      const seconds = (metrics.workoutDuration || 0) % 60
      durationEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }
  }

  handleAIFeedback(feedback) {
    const feedbackStatusEl = document.getElementById('feedback-status')
    const suggestionsListEl = document.getElementById('suggestions-list')

    if (feedbackStatusEl) {
      feedbackStatusEl.textContent = feedback.feedback || 'Ready'
      feedbackStatusEl.className = 'feedback-good'
    }

    if (suggestionsListEl) {
      suggestionsListEl.innerHTML = `<li>${feedback.feedback || 'Waiting for feedback'}</li>`
    }
  }

  handleSystemCommand(command) {
    const action = command.action

    switch (action) {
      case 'select_exercise':
        this.currentExerciseType = command.exerciseType
        const exerciseTypeEl = document.getElementById('exercise-type')
        if (exerciseTypeEl) {
          exerciseTypeEl.textContent = command.exerciseType || 'Awaiting Command'
        }
        console.log('Exercise selected:', command.exerciseType)
        break
      case 'start_workout':
        console.log('Workout started')
        break
      case 'stop_workout':
        console.log('Workout stopped')
        break
      default:
        console.log('Unknown system command:', action)
    }
  }

  attemptReconnect() {
    const config = this.config.loadConfig()
    
    if (this.reconnectAttempts >= config.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached')
      this.updateStatus('Connection Failed', false)
      return
    }

    this.reconnectAttempts++
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${config.maxReconnectAttempts})...`)
    this.updateStatus(`Reconnecting... (${this.reconnectAttempts}/${config.maxReconnectAttempts})`, false)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, config.reconnectInterval)
  }

  sendPoseData(poseData) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const message = {
        type: 'pose_data',
        deviceId: this.deviceId,
        data: {
          exerciseType: this.currentExerciseType || 'push-ups',
          keypoints: poseData.keypoints || [],
          timestamp: Date.now()
        }
      }
      this.websocket.send(JSON.stringify(message))
    }
  }

  sendBiometricData(biometricData) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const message = {
        type: 'biometric_data',
        deviceId: this.deviceId,
        data: {
          heartRate: biometricData.heartRate || 0,
          repCount: biometricData.repCount || 0,
          exerciseType: this.currentExerciseType || 'push-ups'
        }
      }
      this.websocket.send(JSON.stringify(message))
    }
  }

  sendRepDetection(repCount) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const message = {
        type: 'rep_detection',
        deviceId: this.deviceId,
        data: {
          repCount: repCount,
          exerciseType: this.currentExerciseType || 'push-ups'
        }
      }
      this.websocket.send(JSON.stringify(message))
    }
  }

  updateStatus(text, isConnected) {
    const statusEl = document.getElementById('relay-connection-status')
    const indicatorEl = document.getElementById('relay-status-indicator')
    const statusTextEl = document.getElementById('relay-status-text')

    if (statusEl) {
      statusEl.textContent = text
      statusEl.className = `status-indicator ${isConnected ? 'connected' : 'disconnected'}`
    }

    if (indicatorEl && statusTextEl) {
      statusTextEl.textContent = text
      indicatorEl.className = `relay-status-${isConnected ? 'connected' : 'disconnected'}`
    }

    // Update URL display
    const urlDisplayEl = document.getElementById('relay-url-display')
    if (urlDisplayEl) {
      const config = this.config.loadConfig()
      const effectiveUrl = this.config.getEffectiveUrl()
      urlDisplayEl.textContent = effectiveUrl || 'Not configured'
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.websocket) {
      this.websocket.close()
      this.websocket = null
    }

    this.isConnected = false
    this.updateStatus('Disconnected', false)
  }

  onMessage(handler) {
    this.onMessageHandlers.push(handler)
  }

  onConnect(handler) {
    this.onConnectHandlers.push(handler)
  }

  onDisconnect(handler) {
    this.onDisconnectHandlers.push(handler)
  }
}

