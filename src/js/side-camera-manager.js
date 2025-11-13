/**
 * SideCameraManager with PeerJS Support and BlazePose Avatar Rendering
 * Handles side view camera connection using PeerJS for WebRTC
 * Always displays avatar made from BlazePose points
 */
import Peer from 'peerjs'

export class SideCameraManager {
  constructor() {
    this.sideStream = null
    this.isConnected = false
    this.peer = null
    this.currentPeerId = null
    this.connection = null
    this.dataConnection = null

    // Mock connection for demo
    this.mockConnection = false
    this.mockPoseData = null

    // Avatar rendering - ALWAYS ON
    this.showAvatar = true

    // Side camera pose detection using BlazePose
    this.sidePoseDetector = null
    this.sideVideoElement = null
    this.detectionLoop = null
    this.lastPoseTime = 0
    this.detectionInterval = 100

    // Exercise tracking
    this.currentExerciseType = null

    // Pose data smoothing
    this.lastPoseData = null

    // PeerJS configuration
    this.peerConfig = {
      host: '0.peerjs.com',
      port: 443,
      path: '/',
      secure: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ]
      }
    }

    console.log("🎬 SideCameraManager initialized with PeerJS and BlazePose support")

    this.initializeElements()
    this.initializeAvatar()
    this.initializeSidePoseDetection()
    
    // Track if we're using real pose detection
    this.usingRealPoseDetection = false
  }

  initializeElements() {
    const connectBtn = document.getElementById("connect-side-camera")
    const toggleAvatarBtn = document.getElementById("toggle-avatar")

    if (connectBtn) {
      connectBtn.addEventListener("click", () => {
        console.log("Connect side camera button clicked!")
        this.connectSideCamera()
      })
    }

    if (toggleAvatarBtn) {
      toggleAvatarBtn.addEventListener("click", () => {
        console.log("Toggle avatar button clicked!")
        this.toggleAvatar()
      })
    }
  }

  initializeAvatar() {
    const canvas = document.getElementById('side-avatar-canvas')
    if (!canvas) {
      console.error('Side avatar canvas not found!')
      return
    }
    
    const isMobile = window.innerWidth <= 768
    if (isMobile) {
      canvas.width = 300
      canvas.height = 225
    } else {
      canvas.width = 280
      canvas.height = 210
    }
    
    canvas.style.border = '1px solid #00ff00'
    canvas.style.backgroundColor = '#1a1a1a'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    
    console.log('Avatar canvas initialized successfully')
  }

  async initializeSidePoseDetection() {
    try {
      console.log("Initializing MediaPipe BlazePose for side camera...")
      
      // Wait for MediaPipe Pose to be available
      if (typeof Pose === 'undefined') {
        console.warn("MediaPipe Pose not loaded yet, retrying...")
        setTimeout(() => this.initializeSidePoseDetection(), 1000)
        return
      }

      // Initialize MediaPipe BlazePose
      this.sidePoseDetector = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        }
      })

      // Configure BlazePose
      this.sidePoseDetector.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })

      // Set up the callback for pose results
      this.sidePoseDetector.onResults((results) => {
        this.handleBlazePoseResults(results)
      })

      console.log("MediaPipe BlazePose initialized successfully for side camera")
    } catch (error) {
      console.error("Failed to initialize MediaPipe BlazePose:", error)
      this.sidePoseDetector = null
    }
  }

  async connectSideCamera() {
    try {
      console.log("=== CONNECT SIDE CAMERA STARTED ===")
      
      const isMobile = window.innerWidth <= 768
      if (isMobile) {
        console.log("Mobile device detected - using mock data mode for side camera")
        await this.establishMockConnection()
        this.updateConnectionStatus(true)
        return
      }

      console.log("Desktop device - using PeerJS connection...")
      await this.establishPeerJSConnection()
      this.updateConnectionStatus(true)
      console.log("Side camera connected successfully")
    } catch (error) {
      console.error("=== CONNECT SIDE CAMERA FAILED ===")
      console.error("Failed to connect side camera:", error)
      
      console.log("Falling back to mock data mode...")
      try {
        await this.establishMockConnection()
        this.updateConnectionStatus(true)
        console.log("Side camera connected successfully (fallback mock mode)")
      } catch (fallbackError) {
        console.error("Fallback mock mode also failed:", fallbackError)
        this.updateConnectionStatus(false)
      }
    }
  }

  async establishMockConnection() {
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const isMobile = window.innerWidth <= 768
    
    if (isMobile) {
      console.log("Mobile mode - using mock data for side camera")
      this.isConnected = true
      this.startMockDataForTesting()
      return
    }

    try {
      this.sideStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      })

      // Stop mock data when real video stream is available
      this.stopMockDataForTesting()
      
      this.sideVideoElement = document.getElementById("side-camera-feed")
      if (this.sideVideoElement) {
        this.sideVideoElement.srcObject = this.sideStream
        this.sideVideoElement.onloadedmetadata = () => {
          console.log("Side camera video loaded")
          // Start BlazePose detection if available
          if (this.sidePoseDetector) {
            this.startSidePoseDetection()
          }
        }
      }

      this.isConnected = true
    } catch (error) {
      console.warn("Could not access side camera:", error)
      this.isConnected = true
      // Start mock data even if camera fails
      this.startMockDataForTesting()
    }
  }

  async establishPeerJSConnection() {
    console.log("=== ESTABLISHING PEERJS CONNECTION ===")
    
    return new Promise((resolve, reject) => {
      // Initialize PeerJS
      const peerId = 'main-ar-device-' + Math.random().toString(36).substr(2, 9)
      this.peer = new Peer(peerId, this.peerConfig)
      
      this.peer.on('open', (id) => {
        console.log('PeerJS opened with ID:', id)
        this.currentPeerId = id
        this.showRoomId(id)
        resolve()
      })

      this.peer.on('error', (error) => {
        console.error('PeerJS error:', error)
        reject(error)
      })

      // Listen for incoming connections (from side camera device)
      this.peer.on('connection', (conn) => {
        console.log('Received connection from side camera')
        this.dataConnection = conn
        
        conn.on('open', () => {
          console.log('Data connection opened')
        })

        conn.on('data', (data) => {
          try {
            const poseData = typeof data === 'string' ? JSON.parse(data) : data
            // Stop mock data when receiving real pose data from side camera
            if (!this.usingRealPoseDetection) {
              this.usingRealPoseDetection = true
              this.stopMockDataForTesting()
              console.log("Real pose data received from side camera - stopping mock data")
            }
            this.handleSidePoseData(poseData)
          } catch (e) {
            console.warn("Non-JSON side data:", data)
          }
        })

        conn.on('close', () => {
          console.log('Data connection closed')
          this.dataConnection = null
        })
      })

      // Listen for incoming video stream
      this.peer.on('call', (call) => {
        console.log('Received call from side camera')
        
        // Answer the call and receive the video stream
        call.answer()
        
        call.on('stream', (remoteStream) => {
          console.log('Received remote stream from side camera')
          // Stop mock data when real video stream arrives
          this.stopMockDataForTesting()
          
          this.sideVideoElement = document.getElementById("side-camera-feed")
          if (this.sideVideoElement) {
            this.sideVideoElement.srcObject = remoteStream
            this.sideVideoElement.onloadedmetadata = () => {
              console.log("Side camera video loaded from PeerJS")
              // Start BlazePose detection when video is ready
              if (this.sidePoseDetector) {
                this.startSidePoseDetection()
              }
            }
          }
        })

        call.on('close', () => {
          console.log('Call closed')
        })
      })
    })
  }

  startSidePoseDetection() {
    if (!this.sidePoseDetector || !this.sideVideoElement) {
      console.warn("Side pose detector or video element not available, using mock data")
      // Only start mock data if we don't have real detection
      if (!this.usingRealPoseDetection) {
        this.startMockDataForTesting()
      }
      return
    }

    console.log("Starting BlazePose detection for side camera...")
    
    // Stop mock data when starting real detection
    this.stopMockDataForTesting()

    // Start the detection loop with MediaPipe BlazePose
    const detectPoses = async () => {
      if (!this.isConnected || !this.sideVideoElement) return

      const currentTime = Date.now()
      if (currentTime - this.lastPoseTime < this.detectionInterval) {
        this.detectionLoop = requestAnimationFrame(detectPoses)
        return
      }

      try {
        // Check if video is ready
        if (this.sideVideoElement.readyState >= 2) {
          // Send video frame to BlazePose
          await this.sidePoseDetector.send({ image: this.sideVideoElement })
        }

        this.lastPoseTime = currentTime
      } catch (error) {
        console.error("Error in side camera pose detection:", error)
        // If detection fails, fall back to mock data
        if (!this.usingRealPoseDetection) {
          this.startMockDataForTesting()
        }
      }

      this.detectionLoop = requestAnimationFrame(detectPoses)
    }

    detectPoses()
    console.log("Side camera BlazePose detection started")
  }

  handleBlazePoseResults(results) {
    if (!results || !results.poseLandmarks) {
      return
    }

    // Stop mock data when real pose detection starts working
    if (!this.usingRealPoseDetection) {
      this.usingRealPoseDetection = true
      this.stopMockDataForTesting()
      console.log("Real BlazePose detection active - stopping mock data")
    }

    // Convert BlazePose results to our format
    const sidePoseData = this.convertBlazePoseToSideData(results)
    
    if (sidePoseData && sidePoseData.keypoints.length >= 10) {
      this.handleSidePoseData(sidePoseData)
    }
  }

  convertBlazePoseToSideData(results) {
    const landmarks = results.poseLandmarks
    const worldLandmarks = results.poseWorldLandmarks
    
    if (!landmarks || landmarks.length === 0) {
      return null
    }

    // MediaPipe BlazePose landmark mapping
    const keypointNames = [
      "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner",
      "right_eye", "right_eye_outer", "left_ear", "right_ear", "mouth_left", "mouth_right",
      "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
      "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index",
      "left_thumb", "right_thumb", "left_hip", "right_hip", "left_knee", "right_knee",
      "left_ankle", "right_ankle", "left_heel", "right_heel", "left_foot_index", "right_foot_index"
    ]

    const keypoints = landmarks.map((landmark, index) => {
      const worldLandmark = worldLandmarks ? worldLandmarks[index] : null
      return {
        name: keypointNames[index] || `keypoint_${index}`,
        position: {
          x: landmark.x,
          y: landmark.y,
          z: worldLandmark ? worldLandmark.z : (landmark.z || 0)
        },
        score: landmark.visibility || 0.9
      }
    })

    // Map to simplified names for avatar rendering
    const mappedKeypoints = keypoints.map(kp => {
      let name = kp.name
      // Map to avatar-friendly names
      if (name === 'left_shoulder') name = 'leftShoulder'
      if (name === 'right_shoulder') name = 'rightShoulder'
      if (name === 'left_elbow') name = 'leftElbow'
      if (name === 'right_elbow') name = 'rightElbow'
      if (name === 'left_wrist') name = 'leftWrist'
      if (name === 'right_wrist') name = 'rightWrist'
      if (name === 'left_hip') name = 'leftHip'
      if (name === 'right_hip') name = 'rightHip'
      if (name === 'left_knee') name = 'leftKnee'
      if (name === 'right_knee') name = 'rightKnee'
      if (name === 'left_ankle') name = 'leftAnkle'
      if (name === 'right_ankle') name = 'rightAnkle'
      if (name === 'nose') name = 'head'
      
      return {
        ...kp,
        name: name
      }
    })
    
    // Calculate shoulder midpoint (after map is complete)
    const leftShoulder = mappedKeypoints.find(k => k.name === 'leftShoulder')
    const rightShoulder = mappedKeypoints.find(k => k.name === 'rightShoulder')
    if (leftShoulder && rightShoulder) {
      mappedKeypoints.push({
        name: 'shoulder',
        position: {
          x: (leftShoulder.position.x + rightShoulder.position.x) / 2,
          y: (leftShoulder.position.y + rightShoulder.position.y) / 2,
          z: (leftShoulder.position.z + rightShoulder.position.z) / 2
        },
        score: Math.min(leftShoulder.score, rightShoulder.score)
      })
    }
    
    // Calculate hip midpoint (after map is complete)
    const leftHip = mappedKeypoints.find(k => k.name === 'leftHip')
    const rightHip = mappedKeypoints.find(k => k.name === 'rightHip')
    if (leftHip && rightHip) {
      mappedKeypoints.push({
        name: 'hip',
        position: {
          x: (leftHip.position.x + rightHip.position.x) / 2,
          y: (leftHip.position.y + rightHip.position.y) / 2,
          z: (leftHip.position.z + rightHip.position.z) / 2
        },
        score: Math.min(leftHip.score, rightHip.score)
      })
    }

    return {
      keypoints: mappedKeypoints,
      timestamp: Date.now(),
      confidence: 0.85,
      is3D: true
    }
  }

  startMockDataForTesting() {
    // Only start mock data if we're not using real pose detection
    if (this.usingRealPoseDetection) {
      console.log("Real pose detection active - skipping mock data")
      return
    }
    
    // Stop any existing mock data interval
    if (this.mockInterval) {
      clearInterval(this.mockInterval)
    }
    
    this.mockInterval = setInterval(() => {
      if (this.isConnected && !this.usingRealPoseDetection) {
        const mockData = this.generateMockSidePoseData()
        this.handleSidePoseData(mockData)
      }
    }, 100)
    console.log("Started mock data for side camera avatar (fallback mode)")
  }

  stopMockDataForTesting() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval)
      this.mockInterval = null
      console.log("Stopped mock data for side camera")
    }
  }

  generateMockSidePoseData() {
    const time = Date.now() / 1000
    const breathingCycle = Math.sin(time * 0.3) * 0.02
    const exerciseMovement = Math.sin(time * 1.5) * 0.1
    const depthMovement = Math.sin(time * 0.8) * 0.05
    const baseY = 0.2 + breathingCycle
    const baseX = 0.5
    const baseZ = -0.1 + depthMovement
    
    return {
      keypoints: [
        { name: "head", position: { x: baseX, y: baseY, z: baseZ - 0.05 }, score: 0.9 },
        { name: "leftEye", position: { x: baseX - 0.02, y: baseY - 0.01, z: baseZ - 0.06 }, score: 0.9 },
        { name: "rightEye", position: { x: baseX + 0.02, y: baseY - 0.01, z: baseZ - 0.06 }, score: 0.9 },
        { name: "leftEar", position: { x: baseX - 0.04, y: baseY, z: baseZ - 0.03 }, score: 0.9 },
        { name: "rightEar", position: { x: baseX + 0.04, y: baseY, z: baseZ - 0.03 }, score: 0.9 },
        { name: "leftShoulder", position: { x: baseX - 0.08, y: baseY + 0.15, z: baseZ }, score: 0.9 },
        { name: "rightShoulder", position: { x: baseX + 0.08, y: baseY + 0.15, z: baseZ + 0.02 }, score: 0.9 },
        { name: "shoulder", position: { x: baseX, y: baseY + 0.15, z: baseZ }, score: 0.9 },
        { name: "leftElbow", position: { x: baseX - 0.12 + exerciseMovement, y: baseY + 0.35, z: baseZ + (exerciseMovement * 0.5) }, score: 0.8 },
        { name: "rightElbow", position: { x: baseX + 0.12 + exerciseMovement, y: baseY + 0.35, z: baseZ + 0.02 + (exerciseMovement * 0.5) }, score: 0.8 },
        { name: "leftWrist", position: { x: baseX - 0.15 + (exerciseMovement * 1.2), y: baseY + 0.55, z: baseZ + (exerciseMovement * 0.8) }, score: 0.8 },
        { name: "rightWrist", position: { x: baseX + 0.15 + (exerciseMovement * 1.2), y: baseY + 0.55, z: baseZ + 0.02 + (exerciseMovement * 0.8) }, score: 0.8 },
        { name: "leftHip", position: { x: baseX - 0.06, y: baseY + 0.45, z: baseZ + 0.01 }, score: 0.9 },
        { name: "rightHip", position: { x: baseX + 0.06, y: baseY + 0.45, z: baseZ + 0.03 }, score: 0.9 },
        { name: "hip", position: { x: baseX, y: baseY + 0.45, z: baseZ + 0.02 }, score: 0.9 },
        { name: "leftKnee", position: { x: baseX - 0.05 - (exerciseMovement * 0.1), y: baseY + 0.7, z: baseZ - (exerciseMovement * 0.3) }, score: 0.9 },
        { name: "rightKnee", position: { x: baseX + 0.05 - (exerciseMovement * 0.1), y: baseY + 0.7, z: baseZ + 0.02 - (exerciseMovement * 0.3) }, score: 0.9 },
        { name: "leftAnkle", position: { x: baseX - 0.08 - (exerciseMovement * 0.2), y: baseY + 0.95, z: baseZ - (exerciseMovement * 0.5) }, score: 0.9 },
        { name: "rightAnkle", position: { x: baseX + 0.08 - (exerciseMovement * 0.2), y: baseY + 0.95, z: baseZ + 0.02 - (exerciseMovement * 0.5) }, score: 0.9 },
      ],
      timestamp: Date.now(),
      confidence: 0.85,
      is3D: true
    }
  }

  handleSidePoseData(poseData) {
    // ALWAYS draw avatar when we have pose data
    this.drawSimpleAvatar(poseData)

    if (window.app && window.app.processSidePoseData) {
      window.app.processSidePoseData(poseData)
    }
  }

  drawSimpleAvatar(poseData) {
    if (!this.showAvatar) return
    
    const canvas = document.getElementById('side-avatar-canvas')
    if (!canvas) {
      console.error("Side avatar canvas not found!")
      return
    }
    
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.error("Could not get canvas context!")
      return
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Set canvas background with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, '#1a1a2e')
    gradient.addColorStop(1, '#0f0f1e')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    const keypoints = poseData.keypoints || []
    
    // Check if we have 3D data
    const is3D = poseData.is3D || false
    
    // Draw connections first (behind joints)
    this.drawEnhancedSkeletonConnections(ctx, keypoints, canvas.width, canvas.height, is3D)
    
    // Draw body shapes for more human-like appearance
    this.drawBodyShapes(ctx, keypoints, canvas.width, canvas.height, is3D)
    
    // Draw keypoints as joints with depth-based sizing
    keypoints.forEach(kp => {
      if (kp.score < 0.3) return
      
      const x = kp.position ? kp.position.x * canvas.width : (kp.x || 0) * canvas.width
      const y = kp.position ? kp.position.y * canvas.height : (kp.y || 0) * canvas.height
      const z = kp.position && kp.position.z ? kp.position.z : 0
      
      // Calculate size based on depth (z) - closer = larger
      const depthScale = is3D ? (1.2 - z * 0.3) : 1.0
      
      // Different sizes and colors for different body parts
      let radius = 3 * depthScale
      let color = '#00ff88'
      
      if (kp.name === 'head') {
        radius = 8 * depthScale
        color = '#00ffff'
      } else if (kp.name.includes('shoulder') || kp.name.includes('hip')) {
        radius = 6 * depthScale
        color = '#00dd88'
      } else if (kp.name.includes('elbow') || kp.name.includes('knee')) {
        radius = 5 * depthScale
        color = '#00cc77'
      } else if (kp.name.includes('wrist') || kp.name.includes('ankle')) {
        radius = 4 * depthScale
        color = '#00bb66'
      }
      
      // Draw joint with glow effect
      const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.5)
      glowGradient.addColorStop(0, color)
      glowGradient.addColorStop(0.7, color + '88')
      glowGradient.addColorStop(1, color + '00')
      
      ctx.fillStyle = glowGradient
      ctx.beginPath()
      ctx.arc(x, y, radius * 1.5, 0, 2 * Math.PI)
      ctx.fill()
      
      // Draw solid joint
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fill()
      
      // Add highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.beginPath()
      ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.4, 0, 2 * Math.PI)
      ctx.fill()
    })
    
    // Draw head details if head keypoint exists
    this.drawHeadDetails(ctx, keypoints, canvas.width, canvas.height, is3D)
  }
  
  drawEnhancedSkeletonConnections(ctx, keypoints, canvasWidth, canvasHeight, is3D) {
    // Enhanced connections with depth-aware rendering
    const connections = [
      // Head to neck
      { from: 'head', to: 'shoulder', width: 6, color: '#00ffaa' },
      
      // Arms
      { from: 'leftShoulder', to: 'leftElbow', width: 5, color: '#00ff88' },
      { from: 'leftElbow', to: 'leftWrist', width: 4, color: '#00dd77' },
      { from: 'rightShoulder', to: 'rightElbow', width: 5, color: '#00ff88' },
      { from: 'rightElbow', to: 'rightWrist', width: 4, color: '#00dd77' },
      
      // Torso
      { from: 'shoulder', to: 'hip', width: 8, color: '#00ffcc' },
      
      // Legs
      { from: 'hip', to: 'leftKnee', width: 6, color: '#00ff99' },
      { from: 'leftKnee', to: 'leftAnkle', width: 5, color: '#00ee88' },
      { from: 'hip', to: 'rightKnee', width: 6, color: '#00ff99' },
      { from: 'rightKnee', to: 'rightAnkle', width: 5, color: '#00ee88' },
      
      // Shoulder line
      { from: 'leftShoulder', to: 'rightShoulder', width: 6, color: '#00ffbb' },
      
      // Hip line
      { from: 'leftHip', to: 'rightHip', width: 6, color: '#00ffbb' }
    ]
    
    // Helper function to get keypoint with 3D coords
    const getKeypointData = (kp) => {
      if (kp.position) {
        return {
          x: kp.position.x * canvasWidth,
          y: kp.position.y * canvasHeight,
          z: kp.position.z || 0
        }
      }
      return null
    }
    
    // Draw connections with gradient and depth
    connections.forEach(conn => {
      const fromKp = keypoints.find(kp => kp.name === conn.from)
      const toKp = keypoints.find(kp => kp.name === conn.to)
      
      if (fromKp && toKp && fromKp.score > 0.3 && toKp.score > 0.3) {
        const fromData = getKeypointData(fromKp)
        const toData = getKeypointData(toKp)
        
        if (fromData && toData) {
          // Calculate depth-based opacity and width
          const avgZ = (fromData.z + toData.z) / 2
          const depthScale = is3D ? (1.2 - avgZ * 0.3) : 1.0
          const lineWidth = conn.width * depthScale
          const opacity = Math.max(0.5, 1.0 - Math.abs(avgZ) * 0.3)
          
          // Draw shadow/depth line
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
          ctx.lineWidth = lineWidth + 2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(fromData.x + 2, fromData.y + 2)
          ctx.lineTo(toData.x + 2, toData.y + 2)
          ctx.stroke()
          
          // Create gradient for the connection
          const gradient = ctx.createLinearGradient(
            fromData.x, fromData.y, toData.x, toData.y
          )
          gradient.addColorStop(0, conn.color + Math.floor(opacity * 255).toString(16).padStart(2, '0'))
          gradient.addColorStop(0.5, conn.color + 'ff')
          gradient.addColorStop(1, conn.color + Math.floor(opacity * 255).toString(16).padStart(2, '0'))
          
          // Draw main connection
          ctx.strokeStyle = gradient
          ctx.lineWidth = lineWidth
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(fromData.x, fromData.y)
          ctx.lineTo(toData.x, toData.y)
          ctx.stroke()
          
          // Add highlight line
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
          ctx.lineWidth = lineWidth * 0.3
          ctx.beginPath()
          ctx.moveTo(fromData.x, fromData.y)
          ctx.lineTo(toData.x, toData.y)
          ctx.stroke()
        }
      }
    })
  }

  drawBodyShapes(ctx, keypoints, canvasWidth, canvasHeight, is3D) {
    // Draw body shapes for more realistic appearance
    
    // Get key points
    const head = keypoints.find(kp => kp.name === 'head')
    const shoulder = keypoints.find(kp => kp.name === 'shoulder')
    const leftShoulder = keypoints.find(kp => kp.name === 'leftShoulder')
    const rightShoulder = keypoints.find(kp => kp.name === 'rightShoulder')
    const hip = keypoints.find(kp => kp.name === 'hip')
    const leftHip = keypoints.find(kp => kp.name === 'leftHip')
    const rightHip = keypoints.find(kp => kp.name === 'rightHip')
    
    const getCoords = (kp) => kp && kp.position ? {
      x: kp.position.x * canvasWidth,
      y: kp.position.y * canvasHeight,
      z: kp.position.z || 0
    } : null
    
    // Draw torso shape
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
      const ls = getCoords(leftShoulder)
      const rs = getCoords(rightShoulder)
      const lh = getCoords(leftHip)
      const rh = getCoords(rightHip)
      
      if (ls && rs && lh && rh) {
        // Create gradient for torso
        const torsoGradient = ctx.createLinearGradient(
          (ls.x + rs.x) / 2, ls.y,
          (lh.x + rh.x) / 2, lh.y
        )
        torsoGradient.addColorStop(0, 'rgba(0, 255, 200, 0.15)')
        torsoGradient.addColorStop(1, 'rgba(0, 255, 150, 0.1)')
        
        ctx.fillStyle = torsoGradient
        ctx.beginPath()
        ctx.moveTo(ls.x, ls.y)
        ctx.lineTo(rs.x, rs.y)
        ctx.lineTo(rh.x, rh.y)
        ctx.lineTo(lh.x, lh.y)
        ctx.closePath()
        ctx.fill()
        
        // Outline
        ctx.strokeStyle = 'rgba(0, 255, 200, 0.3)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
    
    // Draw head shape (more detailed)
    if (head && shoulder) {
      const h = getCoords(head)
      const s = getCoords(shoulder)
      
      if (h && s) {
        const headRadius = Math.abs(h.y - s.y) * 0.8
        
        // Head glow
        const headGlow = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, headRadius * 1.5)
        headGlow.addColorStop(0, 'rgba(0, 255, 255, 0.3)')
        headGlow.addColorStop(1, 'rgba(0, 255, 255, 0)')
        
        ctx.fillStyle = headGlow
        ctx.beginPath()
        ctx.arc(h.x, h.y, headRadius * 1.5, 0, 2 * Math.PI)
        ctx.fill()
        
        // Head shape
        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)'
        ctx.beginPath()
        ctx.arc(h.x, h.y, headRadius, 0, 2 * Math.PI)
        ctx.fill()
        
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }

  drawHeadDetails(ctx, keypoints, canvasWidth, canvasHeight, is3D) {
    // Draw facial features if available
    const head = keypoints.find(kp => kp.name === 'head')
    const leftEye = keypoints.find(kp => kp.name === 'leftEye')
    const rightEye = keypoints.find(kp => kp.name === 'rightEye')
    const leftEar = keypoints.find(kp => kp.name === 'leftEar')
    const rightEar = keypoints.find(kp => kp.name === 'rightEar')
    
    const getCoords = (kp) => kp && kp.position ? {
      x: kp.position.x * canvasWidth,
      y: kp.position.y * canvasHeight,
      z: kp.position.z || 0
    } : null
    
    // Draw eyes
    if (leftEye && leftEye.score > 0.3) {
      const le = getCoords(leftEye)
      if (le) {
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(le.x, le.y, 2, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
    
    if (rightEye && rightEye.score > 0.3) {
      const re = getCoords(rightEye)
      if (re) {
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(re.x, re.y, 2, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
    
    // Draw ears
    [leftEar, rightEar].forEach(ear => {
      if (ear && ear.score > 0.3) {
        const e = getCoords(ear)
        if (e) {
          ctx.fillStyle = 'rgba(0, 255, 200, 0.3)'
          ctx.beginPath()
          ctx.arc(e.x, e.y, 3, 0, 2 * Math.PI)
          ctx.fill()
        }
      }
    })
  }

  toggleAvatar() {
    this.showAvatar = !this.showAvatar

    const canvas = document.getElementById('side-avatar-canvas')
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        if (!this.showAvatar) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#1a1a1a'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
      }
    }

    const toggleBtn = document.getElementById("toggle-avatar")
    if (toggleBtn) {
      toggleBtn.textContent = this.showAvatar ? "Hide Avatar" : "Show Avatar"
    }

    console.log(`Side avatar ${this.showAvatar ? "enabled" : "disabled"}`)
  }

  setExerciseType(exerciseType) {
    this.currentExerciseType = exerciseType
    console.log(`Side camera exercise type set to: ${exerciseType}`)
  }

  testAvatarMovement() {
    console.log("Testing avatar movement...")
    const testData = this.generateMockSidePoseData()
    console.log("Sending test data to avatar:", testData)
    this.handleSidePoseData(testData)
  }

  sendPoseDataToSide(poseData) {
    // Send pose data from main camera to side camera (if needed)
    if (this.dataConnection && this.dataConnection.open) {
      try {
        this.dataConnection.send(JSON.stringify(poseData))
      } catch (error) {
        console.error("Failed to send pose data to side camera:", error)
      }
    }
  }

  updateConnectionStatus(connected) {
    this.isConnected = connected

    const statusElement = document.getElementById("side-camera-status")
    const connectBtn = document.getElementById("connect-side-camera")
    const roomElement = document.getElementById("side-room-id")

    if (statusElement) {
      statusElement.textContent = connected ? "Connected" : "Disconnected"
      statusElement.className = `status-indicator ${connected ? "connected" : "disconnected"}`
    }

    if (connectBtn) {
      connectBtn.textContent = connected ? "Disconnect Side Camera" : "Connect Side Camera"
    }

    if (roomElement) {
      roomElement.textContent = this.currentPeerId ? this.currentPeerId : "--"
    }
  }

  showRoomId(roomId) {
    console.log("Room ID:", roomId)
    const el = document.getElementById("side-room-id")
    if (el) {
      el.textContent = roomId
    }
    this.copyRoomIdToClipboard(roomId)
  }

  async copyRoomIdToClipboard(roomId) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(roomId)
        console.log("Room ID copied to clipboard:", roomId)
      }
    } catch (error) {
      console.error("Failed to copy room ID to clipboard:", error)
    }
  }

  stopSidePoseDetection() {
    if (this.detectionLoop) {
      cancelAnimationFrame(this.detectionLoop)
      this.detectionLoop = null
    }
    this.stopMockDataForTesting()
    this.usingRealPoseDetection = false
    console.log("Side camera pose detection stopped")
  }

  async disconnectSideCamera() {
    this.stopSidePoseDetection()

    if (this.sideStream) {
      this.sideStream.getTracks().forEach((track) => track.stop())
      this.sideStream = null
    }

    if (this.dataConnection) {
      this.dataConnection.close()
      this.dataConnection = null
    }

    if (this.peer) {
      this.peer.destroy()
      this.peer = null
    }

    const sideVideo = document.getElementById("side-camera-feed")
    if (sideVideo) {
      sideVideo.srcObject = null
    }

    this.currentPeerId = null
    this.updateConnectionStatus(false)
    console.log("Side camera disconnected")
  }

  dispose() {
    this.disconnectSideCamera()
  }
}

// Make class globally available
window.SideCameraManager = SideCameraManager
