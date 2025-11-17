import struct
import asyncio
import json
import random
import time
import socket
import websockets
from websockets.server import WebSocketServerProtocol
import firebase_admin
from firebase_admin import credentials, db

class FitnessRelayServer:
    # Firebase Configuration
    FIREBASE_CONFIG = {
        'apiKey': "AIzaSyCA_rNKQgiyrfFB8npgjnsUKju51gjDeSE",
        'authDomain': "fitnessar-519f8.firebaseapp.com",
        'databaseURL': "https://fitnessar-519f8-default-rtdb.asia-southeast1.firebasedatabase.app",
        'projectId': "fitnessar-519f8",
        'storageBucket': "fitnessar-519f8.firebasestorage.app",
        'messagingSenderId': "607699841770",
        'appId': "1:607699841770:web:0c36d28079bcbe5bbddd93",
        'measurementId': "G-Y6VNEXZ2DB"
    }
    
    def __init__(self):
        self.connections = {}  # hdl -> device_id
        self.device_connections = {}  # device_id -> hdl
        self.device_index = {}  # index -> device_id (for easy command access)
        self.device_counter = 0  # Counter for device indices
        self.local_ip = self.get_local_ip()
        
        # Track workout state for dynamic metrics
        self.device_workout_state = {}  # device_id -> {start_time, rep_count, is_active, base_heart_rate}
        
        # Firebase Realtime Database state
        self.firebase_app = None
        self.firebase_ref = None
        self.firebase_data = {
            'exercise': 1,  # 1=Hr Only, 2=lateral-raises, 3=squats, 4=bicep-curls
            'heartRate': 0,
            'repCount': 0,
            'startFlag': False
        }
        self.initialize_firebase()
        
        self.feedback_templates = {
            "push-ups": [
                "Excellent push-up form!",
                "Keep your body straight",
                "Lower your body more",
                "Keep elbows close to body",
                "Maintain shoulder alignment",
                "Control the movement",
                "Poor form detected - reset position"
            ],
            "bicep-curls": [
                "Perfect curl form!",
                "Keep shoulders stable",
                "Curl the weights up more",
                "Keep elbows at sides",
                "Control the movement",
                "Don't swing the weights",
                "Poor form detected - reset position"
            ],
            "lateral-raises": [
                "Perfect shoulder height!",
                "Keep slight elbow bend",
                "Raise arms to shoulder level",
                "Keep shoulders level",
                "Control the movement",
                "Don't raise too high",
                "Poor form detected - reset position"
            ],
            "squats": [
                "Perfect squat form!",
                "Keep chest up",
                "Lower your body more",
                "Keep knees behind toes",
                "Keep your back straight",
                "Control the movement",
                "Poor form detected - reset position"
            ]
        }
    
    def get_local_ip(self):
        """Get the local IP address of this machine, preferring WiFi/WLAN adapters"""
        try:
            import subprocess
            import re
            
            # Try to get all network interfaces on Windows
            result = subprocess.run(['ipconfig'], capture_output=True, text=True)
            output = result.stdout
            
            # Look for WLAN adapter first (WiFi has priority)
            wlan_section = re.search(r'Wireless LAN adapter Wi-Fi:.*?IPv4 Address.*?: ([\d.]+)', output, re.DOTALL | re.IGNORECASE)
            if wlan_section:
                ip = wlan_section.group(1)
                print(f"✓ Found WiFi IP: {ip}")
                return ip
            
            # Fallback: Look for any Ethernet adapter (but avoid Hyper-V, WSL, VirtualBox, VMware)
            ethernet_pattern = r'Ethernet adapter (?!vEthernet|VirtualBox|VMware).*?:.*?IPv4 Address.*?: ([\d.]+)'
            ethernet_match = re.search(ethernet_pattern, output, re.DOTALL | re.IGNORECASE)
            if ethernet_match:
                ip = ethernet_match.group(1)
                print(f"✓ Found Ethernet IP: {ip}")
                return ip
            
            # Fallback: Use socket method (but this might give wrong adapter)
            print("⚠️  Using socket fallback method...")
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            
            # Reject common virtual adapter IPs
            if local_ip.startswith('172.') or local_ip.startswith('169.254.'):
                print(f"⚠️  Detected virtual/APIPA IP: {local_ip}, may not be correct")
            
            return local_ip
        except Exception as e:
            print(f"❌ Warning: Could not detect local IP: {e}")
            return "127.0.0.1"

    def initialize_firebase(self):
        """Initialize Firebase Realtime Database connection"""
        try:
            # Check if Firebase is already initialized
            if firebase_admin._apps:
                self.firebase_app = firebase_admin.get_app()
                print("✓ Using existing Firebase app")
            else:
                # Try to find service account key file
                import os
                import pathlib
                
                # Look for service account key in common locations
                possible_paths = [
                    pathlib.Path(__file__).parent / 'firebase-service-account.json',
                    pathlib.Path(__file__).parent.parent / 'firebase-service-account.json',
                    pathlib.Path(__file__).parent / 'serviceAccountKey.json',
                    pathlib.Path(__file__).parent.parent / 'serviceAccountKey.json',
                ]
                
                cred_path = None
                for path in possible_paths:
                    if path.exists():
                        cred_path = path
                        break
                
                # Firebase configuration - use database URL from config
                database_url = os.getenv('FIREBASE_DATABASE_URL', 
                    self.FIREBASE_CONFIG['databaseURL'])
                
                if cred_path:
                    cred = credentials.Certificate(str(cred_path))
                    self.firebase_app = firebase_admin.initialize_app(cred, {
                        'databaseURL': database_url
                    })
                    print(f"✓ Firebase initialized with service account: {cred_path}")
                    print(f"   Database URL: {database_url}")
                else:
                    # Try to use default credentials (for Firebase Admin SDK)
                    # This works if FIREBASE_CONFIG env var is set or using Application Default Credentials
                    try:
                        self.firebase_app = firebase_admin.initialize_app(options={
                            'databaseURL': database_url
                        })
                        print(f"✓ Firebase initialized with default credentials")
                        print(f"   Database URL: {database_url}")
                    except Exception as init_error:
                        print("⚠️  Firebase not initialized - no credentials found")
                        print(f"   Error: {init_error}")
                        print("   Please provide a service account key file (firebase-service-account.json)")
                        print("   Or set up Application Default Credentials")
                        print(f"   Database URL: {database_url}")
                        return
            
            # Get reference to the database
            # Assuming data is stored at root level or in a 'fitness' path
            # Adjust the path based on your Firebase structure
            db_path = os.getenv('FIREBASE_DB_PATH', 'fitness')
            self.firebase_ref = db.reference(db_path)
            
            # Note: Firebase Admin SDK doesn't support real-time listeners
            # We'll use polling via get_firebase_data() method
            print(f"✓ Firebase reference set up on path: {db_path}")
            print(f"   Using polling to fetch updates (get_firebase_data)")
            
        except Exception as e:
            print(f"❌ Error initializing Firebase: {e}")
            print("   Continuing without Firebase - will use fallback values")
    
    def get_firebase_data(self):
        """Get current data from Firebase Realtime Database"""
        try:
            if self.firebase_ref is None:
                return self.firebase_data
            
            # Fetch current data from Firebase
            snapshot = self.firebase_ref.get()
            if snapshot:
                if isinstance(snapshot, dict):
                    # Update local cache
                    if 'exercise' in snapshot:
                        self.firebase_data['exercise'] = snapshot['exercise']
                    if 'heartRate' in snapshot or 'heart_rate' in snapshot:
                        self.firebase_data['heartRate'] = snapshot.get('heartRate') or snapshot.get('heart_rate', 0)
                    if 'repCount' in snapshot or 'rep_count' in snapshot:
                        self.firebase_data['repCount'] = snapshot.get('repCount') or snapshot.get('rep_count', 0)
                    if 'startFlag' in snapshot or 'start_flag' in snapshot or 'start' in snapshot:
                        self.firebase_data['startFlag'] = snapshot.get('startFlag') or snapshot.get('start_flag') or snapshot.get('start', False)
            
            return self.firebase_data
        except Exception as e:
            print(f"Error fetching Firebase data: {e}")
            return self.firebase_data

    async def on_connect(self, websocket: WebSocketServerProtocol):
        print("New client connected")
        self.connections[websocket] = "unknown"

    async def on_disconnect(self, websocket: WebSocketServerProtocol):
        print("Client disconnected")
        device_id = self.connections.pop(websocket, "unknown")
        if device_id != "unknown":
            self.device_connections.pop(device_id, None)
            # Remove from index
            for idx, dev_id in list(self.device_index.items()):
                if dev_id == device_id:
                    del self.device_index[idx]
                    break
            print(f"Device {device_id} disconnected")

    async def handle_message(self, websocket: WebSocketServerProtocol, message: str):
        try:
            data = json.loads(message)
            message_type = data.get("type", "")
            device_id = data.get("deviceId", "")
            #print(f"Received {message_type} from device {device_id}")

            if message_type == "device_register":
                await self.handle_device_registration(websocket, data)
            elif message_type == "biometric_data":
                await self.handle_biometric_data(websocket, data)
            elif message_type == "pose_data":
                await self.handle_pose_data(websocket, data)
            elif message_type == "rep_detection":
                await self.handle_rep_detection(websocket, data)
            else:
                print(f"Unknown message type: {message_type}")
        except Exception as e:
            print(f"Error processing message: {e}")

    async def handle_device_registration(self, websocket, data):
        device_id = data.get("deviceId", "")
        exercise_type = data.get("exerciseType", "")
        if device_id:
            self.connections[websocket] = device_id
            self.device_connections[device_id] = websocket
            # Assign index to device
            self.device_counter += 1
            self.device_index[self.device_counter] = device_id
            print(f"Device registered: {device_id} (Exercise: {exercise_type}) [Index: {self.device_counter}]")

    async def handle_biometric_data(self, websocket, data):
        biometric_data = data.get("data", {})
        heart_rate = biometric_data.get("heartRate", 0)
        rep_count = biometric_data.get("repCount", 0)
        exercise_type = biometric_data.get("exerciseType", "")

    async def handle_pose_data(self, websocket, data):
        pose_data = data.get("data", {})
        exercise_type = pose_data.get("exerciseType", "")
        await asyncio.sleep(0.05)
        await self.generate_and_send_feedback(websocket, exercise_type)

    async def handle_rep_detection(self, websocket, data):
        rep_data = data.get("data", {})
        rep_count = rep_data.get("repCount", 0)
        exercise_type = rep_data.get("exerciseType", "")
        print(f"Rep detected: {rep_count} for {exercise_type}")

    async def generate_and_send_feedback(self, websocket, exercise_type):
        feedback_index = random.randint(0, 6)
        confidence = random.uniform(0.7, 1.0)
        status = "good"
        if feedback_index >= 4:
            status = "warning"
        if feedback_index >= 6:
            status = "error"

        # Get feedback templates for the exercise type, with fallback
        templates = self.feedback_templates.get(exercise_type, ["Keep up the good work!"])
        
        # Ensure we don't go out of bounds
        if len(templates) == 0:
            templates = ["Keep up the good work!"]
        
        # Use modulo to safely access the template
        safe_index = feedback_index % len(templates)
        feedback_msg = templates[safe_index]

    async def send_ai_feedback(self,  exercise_type, status, feedback, confidence=0.85):
        device_id = self.resolve_device_id(1)
        if device_id == None:
            return
        else:
            websocket = self.device_connections.get(device_id)
            if websocket and websocket.open:
                try:
                    response = {
                        "type": "ai_feedback",
                        "payload": {
                            "timestamp": int(time.time() * 1000),
                            "feedback": feedback # 
                        }
                    }
                    await websocket.send(json.dumps(response))
                except Exception as e:
                    print(f"Error sending AI feedback: {e}")

    # ============================================================================
    # WORKOUT CONTROL COMMANDS - For testing and control
    # ============================================================================
    
    async def send_system_command(self, websocket, action, **kwargs):
        """Send a system command to a device"""
        try:
            command = {
                "type": "system_command",
                "payload": {
                    "action": action,
                    **kwargs
                }
            }
            await websocket.send(json.dumps(command))
            print(f"✓ Sent command: {action} {kwargs}")
        except Exception as e:
            print(f"Error sending system command: {e}")
    
    def resolve_device_id(self, identifier):
        """Resolve device identifier (can be index, device_id, or 'all')"""
        if identifier == "all":
            return "all"
        
        # Try as index number
        try:
            index = int(identifier)
            if index in self.device_index:
                return self.device_index[index]
            else:
                print(f"❌ Device index {index} not found. Use 'list' to see devices.")
                return None
        except ValueError:
            # Not a number, treat as device_id
            if identifier in self.device_connections:
                return identifier
            else:
                print(f"❌ Device {identifier} not found. Use 'list' to see devices.")
                return None
    
    async def select_exercise(self, device_identifier, exercise_type):
        """Select an exercise for a device or all devices"""
        device_id = self.resolve_device_id(device_identifier)
        if device_id is None:
            return
            
        if device_id == "all":
            for dev_id, websocket in list(self.device_connections.items()):
                if websocket.open:
                    await self.send_system_command(websocket, "select_exercise", exerciseType=exercise_type)
            print(f"📋 Sent to ALL: Select exercise '{exercise_type}'")
        else:
            websocket = self.device_connections.get(device_id)
            if websocket and websocket.open:
                await self.send_system_command(websocket, "select_exercise", exerciseType=exercise_type)
                print(f"📋 Sent to device: Select exercise '{exercise_type}'")
            else:
                print(f"❌ Device not found or not connected")
    
    async def start_workout(self, device_identifier):
        """Start workout for a device or all devices"""
        device_id = self.resolve_device_id(device_identifier)
        if device_id is None:
            return
            
        if device_id == "all":
            for dev_id, websocket in list(self.device_connections.items()):
                if websocket.open:
                    await self.send_system_command(websocket, "start_workout")
                    # Activate workout state for dynamic metrics
                    if dev_id in self.device_workout_state:
                        self.device_workout_state[dev_id]['is_active'] = True
                        self.device_workout_state[dev_id]['start_time'] = time.time()
                        self.device_workout_state[dev_id]['rep_count'] = 0
            print(f"▶️  Sent to ALL: Start workout (metrics now active)")
        else:
            websocket = self.device_connections.get(device_id)
            if websocket and websocket.open:
                await self.send_system_command(websocket, "start_workout")
                # Activate workout state for dynamic metrics
                if device_id in self.device_workout_state:
                    self.device_workout_state[device_id]['is_active'] = True
                    self.device_workout_state[device_id]['start_time'] = time.time()
                    self.device_workout_state[device_id]['rep_count'] = 0
                print(f"▶️  Sent to device: Start workout (metrics now active)")
            else:
                print(f"❌ Device not found or not connected")
    
    async def stop_workout(self, device_identifier):
        """Stop workout for a device or all devices"""
        device_id = self.resolve_device_id(device_identifier)
        if device_id is None:
            return
            
        if device_id == "all":
            for dev_id, websocket in list(self.device_connections.items()):
                if websocket.open:
                    await self.send_system_command(websocket, "stop_workout")
                    # Deactivate workout state
                    if dev_id in self.device_workout_state:
                        self.device_workout_state[dev_id]['is_active'] = False
                        final_reps = self.device_workout_state[dev_id]['rep_count']
                        final_duration = int(time.time() - self.device_workout_state[dev_id]['start_time'])
                        print(f"   📊 Final stats for {dev_id[:8]}... → Reps: {final_reps}, Duration: {final_duration}s")
            print(f"⏹️  Sent to ALL: Stop workout (metrics now passive)")
        else:
            websocket = self.device_connections.get(device_id)
            if websocket and websocket.open:
                await self.send_system_command(websocket, "stop_workout")
                # Deactivate workout state
                if device_id in self.device_workout_state:
                    self.device_workout_state[device_id]['is_active'] = False
                    final_reps = self.device_workout_state[device_id]['rep_count']
                    final_duration = int(time.time() - self.device_workout_state[device_id]['start_time'])
                    print(f"   📊 Final stats → Reps: {final_reps}, Duration: {final_duration}s")
                print(f"⏹️  Sent to device: Stop workout (metrics now passive)")
            else:
                print(f"❌ Device not found or not connected")
    
    def list_devices(self):
        """List all connected devices"""
        if not self.device_connections:
            print("\n📱 No devices connected")
            return []
        
        print("\n" + "=" * 70)
        print("📱 CONNECTED DEVICES")
        print("=" * 70)
        device_list = []
        
        # Create reverse mapping for display
        id_to_index = {device_id: idx for idx, device_id in self.device_index.items()}
        
        for device_id, websocket in self.device_connections.items():
            status = "✓ Online" if websocket.open else "✗ Offline"
            index = id_to_index.get(device_id, "?")
            print(f"  [{index}] {device_id} - {status}")
            device_list.append(device_id)
        print("=" * 70)
        print("💡 Tip: Use the index number [1], [2], etc. in commands")
        print("=" * 70 + "\n")
        return device_list

    async def send_performance_metrics(self, websocket, device_id):
        """Send dynamic performance metrics to device"""
        try:
            import random
            
            # Get or initialize workout state for this device
            if device_id not in self.device_workout_state:
                self.device_workout_state[device_id] = {
                    'start_time': time.time(),
                    'rep_count': 0,
                    'base_heart_rate': random.randint(65, 75),
                    'is_active': False
                }
            
            state = self.device_workout_state[device_id]
            
            # Calculate dynamic workout duration
            workout_duration = int(time.time() - state['start_time'])

            # Get data from Firebase Realtime Database
            firebase_data = self.get_firebase_data()
            heart_rate_from_firebase = firebase_data.get('heartRate', 0)
            rep_count_from_firebase = firebase_data.get('repCount', 0)
            
            # Update state with Firebase data
            if heart_rate_from_firebase > 0:
                state['rep_count'] = rep_count_from_firebase
            
            # Dynamic heart rate (increases over time if active, rests if not)
            if state['is_active']:
                # Heart rate increases with workout intensity
                intensity = min(workout_duration / 60.0, 1.0)  # Max intensity after 1 min
                heart_rate = int(state['base_heart_rate'] + (60 * intensity) + random.randint(-5, 5))
                heart_rate = min(heart_rate, 180)  # Cap at 180
            else:
                # Resting heart rate
                heart_rate = state['base_heart_rate'] + random.randint(-3, 3)
            
            # Use Firebase values if available, otherwise use calculated values
            final_heart_rate = heart_rate_from_firebase if heart_rate_from_firebase > 0 else heart_rate
            final_rep_count = rep_count_from_firebase if rep_count_from_firebase >= 0 else state['rep_count']
            
            pulse = final_heart_rate + random.randint(-2, 2)
            
            # Calculate calories based on duration and reps
            calories = int(workout_duration * 0.15 + final_rep_count * 1.2)

            metrics = {
                "heartRate": final_heart_rate,
                "pulse": pulse,
                "repCount": final_rep_count,
                "workoutDuration": workout_duration,
                "caloriesBurned": calories,
                "timestamp": int(time.time() * 1000)
            }
            
            message = {
                "type": "performance_metrics",
                "payload": metrics
            }
            await websocket.send(json.dumps(message))
            
        except Exception as e:
            print(f"Error sending metrics: {e}")
    
    async def broadcast_periodic_data(self):
        """Continuously send metrics and feedback to connected devices"""
        print("📡 Starting continuous data broadcast...")
        while True:
            await asyncio.sleep(1)  # Send data every 5 seconds
            
            if len(self.device_connections) == 0:
                continue
                
            for device_id, websocket in list(self.device_connections.items()):
                if websocket.open:
                    # Send performance metrics continuously (values change over time)
                    await self.send_performance_metrics(websocket, device_id)
                    
                    # Send AI feedback occasionally (every 10 seconds)
                    if not hasattr(self, '_last_feedback_time'):
                        self._last_feedback_time = {}
                    
                    if device_id not in self._last_feedback_time or \
                       time.time() - self._last_feedback_time[device_id] > 10:
                        exercises = ["push-ups", "bicep-curls", "lateral-raises", "squats"]
                        exercise = random.choice(exercises)
                        await self.generate_and_send_feedback(websocket, exercise)
                        self._last_feedback_time[device_id] = time.time()

    async def handler(self, websocket, path):
        await self.on_connect(websocket)
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        finally:
            await self.on_disconnect(websocket)

    async def run(self, port=8080, use_ssl=True, use_ngrok=False):
        # Check if SSL certificates exist if SSL is requested
        ssl_context = None
        ssl_dir = None
        if use_ssl and not use_ngrok:
            import ssl
            import pathlib
            
            # SSL certificate paths - look in same directory as script
            ssl_dir = pathlib.Path(__file__).parent / 'ssl'
            cert_file = ssl_dir / 'cert.pem'
            key_file = ssl_dir / 'key.pem'
            
            if not cert_file.exists() or not key_file.exists():
                print("=" * 60)
                print("⚠️  SSL certificates not found!")
                print("=" * 60)
                print(f"Expected certificates at:")
                print(f"  - {cert_file}")
                print(f"  - {key_file}")
                print("\n⚠️  Falling back to non-SSL mode (WS instead of WSS)")
                print("\nTo use SSL, generate certificates first:")
                print("  python generate_ssl_certificates.py")
                print("\nOr use ngrok for HTTPS (recommended for Vercel):")
                print("  python visualizer_server.py --ngrok")
                print("=" * 60)
                # Fall back to non-SSL mode
                use_ssl = False
            else:
                # Create SSL context only if certificates exist
                ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                ssl_context.load_cert_chain(certfile=str(cert_file), keyfile=str(key_file))
        
        # Start server with or without SSL
        if use_ssl and ssl_context is not None:
            print("=" * 70)
            print(f"🚀 Fitness Relay Server (WSS - Secure)")
            print("=" * 70)
            print(f"✓ Server started on wss://0.0.0.0:{port}")
            print(f"✓ Using SSL certificates from: {ssl_dir}")
            print(f"\n📡 SERVER IP ADDRESS: {self.local_ip}")
            print("\n🔗 Connection URL for AR app:")
            print(f"   wss://{self.local_ip}:{port}")
            print("\n💡 Configure AR app with this URL in Relay Settings")
            print("=" * 70)
            print("⏳ Waiting for connections...")
            print("Press Ctrl+C to stop\n")
            
            async with websockets.serve(self.handler, "0.0.0.0", port, ssl=ssl_context):
                asyncio.create_task(self.broadcast_periodic_data())
                await asyncio.Future()  # Run forever
        else:
            # For ngrok mode, we run without SSL (ngrok handles SSL termination)
            if use_ngrok:
                print("=" * 70)
                print(f"🚀 Fitness Relay Server (NGROK MODE - For Vercel HTTPS)")
                print("=" * 70)
                print(f"✓ Server started on ws://0.0.0.0:{port}")
                print(f"\n📡 SERVER IP ADDRESS: {self.local_ip}")
                print("\n" + "=" * 70)
                print("🌐 NGROK SETUP INSTRUCTIONS:")
                print("=" * 70)
                print("1. Install ngrok: https://ngrok.com/download")
                print("2. In a NEW terminal, run:")
                print(f"   ngrok http {port}")
                print("3. Copy the HTTPS URL from ngrok (e.g., https://abc123.ngrok.io)")
                print("4. Convert to WebSocket URL:")
                print("   - Replace 'https://' with 'wss://'")
                print("   - Example: wss://abc123.ngrok.io")
                print("5. In your Vercel-deployed app:")
                print("   - Go to Relay Settings")
                print("   - Enter the WSS URL in 'Proxy/Tunnel URL' field")
                print("   - Save and connect")
                print("=" * 70)
                print("\n💡 TIP: ngrok provides both HTTP and HTTPS endpoints")
                print("   Use the HTTPS endpoint and convert to WSS for secure connections")
                print("=" * 70)
                print("\n⏳ Waiting for connections...")
                print("   (Start ngrok in another terminal to enable external access)")
                print("Press Ctrl+C to stop\n")
            else:
                print("=" * 70)
                print(f"🚀 Fitness Relay Server (WS - Non-Secure)")
                print("=" * 70)
                print(f"✓ Server started on ws://0.0.0.0:{port}")
                print(f"\n📡 SERVER IP ADDRESS: {self.local_ip}")
                print("\n🔗 Connection URL for AR app:")
                print(f"   ws://{self.local_ip}:{port}")
                print("\n💡 Configure AR app with this URL in Relay Settings")
                print("\n🌐 For Vercel HTTPS deployment, use --ngrok flag:")
                print("   python visualizer_server.py --ngrok")
                print("=" * 70)
                print("⏳ Waiting for connections...")
                print("Press Ctrl+C to stop\n")
            
            async with websockets.serve(self.handler, "0.0.0.0", port):
                asyncio.create_task(self.broadcast_periodic_data())
                await asyncio.Future()  # Run forever

async def run_server_with_commands(server, port, use_ssl, use_ngrok=False):
    import threading
    
    # Get the event loop
    loop = asyncio.get_event_loop()
    
    # Start server in background
    server_task = asyncio.create_task(server.run(port, use_ssl, use_ngrok))
    
    # Wait a bit for server to start
    await asyncio.sleep(2)
    
    # Command loop - reads from Firebase Realtime Database
    def command_loop(event_loop):
        prev_exercise = None  # Use None to trigger initial send
        prev_start_flag = None  # Use None to trigger initial check
        firebase_unavailable_warning_shown = False
        device_connected_warning_shown = False
        
        while True:
            try:
                # Wait until at least one device is connected before fetching from Firebase
                if len(server.device_connections) == 0:
                    if not device_connected_warning_shown:
                        print("⏳ Waiting for device connection before fetching Firebase data...")
                        device_connected_warning_shown = True
                    time.sleep(1)  # Check every second for device connection
                    continue
                
                # Device is connected - reset warning flag and start fetching
                if device_connected_warning_shown:
                    print("✓ Device connected! Starting Firebase data fetch...")
                    device_connected_warning_shown = False
                    # Reset previous values to trigger initial commands
                    prev_exercise = None
                    prev_start_flag = None
                
                # Get data from Firebase Realtime Database
                firebase_data = server.get_firebase_data()
                exercise = firebase_data.get('exercise', 1)
                start_flag = firebase_data.get('startFlag', False)
                
                # Reset warning flag if Firebase connection succeeds
                if firebase_unavailable_warning_shown:
                    print("✓ Firebase connection restored")
                    firebase_unavailable_warning_shown = False
                
                # Handle exercise change (including initial send)
                if exercise != prev_exercise:
                    prev_exercise = exercise
                    exercise_string = ''
                    if exercise == 1:
                        exercise_string = 'Hr Only'
                    elif exercise == 2:
                        exercise_string = 'lateral-raises'
                    elif exercise == 3:
                        exercise_string = 'squats'
                    elif exercise == 4:
                        exercise_string = 'bicep-curls'
                    else:
                        exercise_string = 'Hr Only'  # Default fallback
                    
                    print(f"📋 Exercise set to: {exercise_string}")
                    asyncio.run_coroutine_threadsafe(
                        server.select_exercise(1, exercise_string),
                        event_loop
                    )
                
                # Handle workout start/stop (properly mapped)
                if start_flag != prev_start_flag:
                    if start_flag:  # startFlag is True -> Start workout
                        print("▶️  Workout started (startFlag=True)")
                        asyncio.run_coroutine_threadsafe(
                            server.start_workout(1),
                            event_loop
                        )
                    else:  # startFlag is False -> Stop workout
                        print("⏹️  Workout stopped (startFlag=False)")
                        asyncio.run_coroutine_threadsafe(
                            server.stop_workout(1),
                            event_loop
                        )
                    prev_start_flag = start_flag
                
            except Exception as e:
                # Firebase not available - only show warning once
                if not firebase_unavailable_warning_shown:
                    print(f"⚠️  Firebase Realtime Database not available - command loop will retry: {e}")
                    firebase_unavailable_warning_shown = True
            
            time.sleep(0.5)  # Poll every 0.5 seconds (reduced from 0.1s)
    # Run command loop in a separate thread
    cmd_thread = threading.Thread(target=command_loop, args=(loop,), daemon=True)
    cmd_thread.start()
    
    # Wait for server task
    await server_task

if __name__ == "__main__":
    import sys
    port = 8080
    use_ssl = True  # Use SSL by default
    use_ngrok = False  # Use ngrok for Vercel HTTPS connections
    
    # Parse command line arguments
    for arg in sys.argv[1:]:
        if arg.isdigit():
            port = int(arg)
        elif arg == '--no-ssl':
            use_ssl = False
        elif arg == '--ssl':
            use_ssl = True
        elif arg == '--ngrok':
            use_ngrok = True
            use_ssl = False  # ngrok handles SSL termination
        elif arg in ['--help', '-h']:
            print("\nUsage: python visualizer_server.py [PORT] [OPTIONS]")
            print("\nOptions:")
            print("  PORT        Port number (default: 8080)")
            print("  --ssl       Enable SSL/WSS (default)")
            print("  --no-ssl    Disable SSL, use plain WS")
            print("  --ngrok     Use ngrok mode (for Vercel HTTPS deployment)")
            print("              Server runs without SSL, ngrok handles HTTPS/WSS")
            print("\nExamples:")
            print("  python visualizer_server.py              # Run on port 8080 with SSL")
            print("  python visualizer_server.py 9000         # Run on port 9000 with SSL")
            print("  python visualizer_server.py --no-ssl     # Run on port 8080 without SSL")
            print("  python visualizer_server.py --ngrok      # Run for Vercel deployment")
            print("  python visualizer_server.py 9000 --ngrok # Run on port 9000 with ngrok")
            print("\nFor Vercel HTTPS Deployment:")
            print("  1. Run: python visualizer_server.py --ngrok")
            print("  2. In another terminal: ngrok http 8080")
            print("  3. Copy the HTTPS URL from ngrok and convert to WSS")
            print("  4. Use that WSS URL in Vercel app's Relay Settings\n")
            exit(0)
    
    server = FitnessRelayServer()
    try:
        asyncio.run(run_server_with_commands(server, port, use_ssl, use_ngrok))
    except KeyboardInterrupt:
        print("\nServer stopped.")
