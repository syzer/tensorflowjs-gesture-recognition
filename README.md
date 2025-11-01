# 🎥 YouTube-Style Gesture Recognition with Timeline

A real-time hand gesture and audio detection application with YouTube-inspired interface, featuring interactive timeline visualization and multi-modal input tracking.

![gesture-recognition-tensorflowjs-1080 png](https://github.com/user-attachments/assets/93140d05-29dd-49b3-bc20-d8119df11c14)

## ✨ Features

### 🖐️ Multi-Hand Gesture Detection
- **Up to 15 simultaneous hands** tracked in real-time using MediaPipe Hands
- **3 gesture types recognized:**
  - 👍 Thumbs up (green)
  - 👎 Thumbs down (red)
  - ✌️ Victory/Peace sign
- **2x upscaling** for better detection of small/distant hands
- Optimized for Mac M1 camera (720p/1080p)

### 🎤 Audio Monitoring
- **Real-time microphone noise detection** (0-100%)
- **Visual noise bar** with gradient (green → yellow → orange → red)
- **Clap detection** - Automatically adds 👏 emoji when noise peak exceeds 80%
- Emoji size scales with loudness intensity

### 📊 Interactive Timeline (YouTube-Style)
- **5-minute scrollable timeline** with Chart.js
- **Color-coded segments:**
  - 🟢 Green = Thumbs up moments
  - 🔴 Red = Thumbs down moments  
  - 🟠 Orange = Clapping/loud noise events
- **Dynamic emoji markers** that scale based on:
  - Thumbs up count (more hands = bigger 👍)
  - Clapping loudness (louder = bigger 👏)
- **Chart value increases** when clapping is detected
- Hover to reveal detailed timeline

### 🎬 Video Controls
- YouTube-inspired control bar with:
  - ▶️ Play/Pause toggle
  - ⏮️ Skip backward 10s / ⏭️ Skip forward 10s
  - 🔊 Volume control
  - ⚙️ Settings / 📝 Captions / ⛶ Fullscreen
  - Real-time progress bar
  - Time display (current/total)

### 🎨 Material Design UI
- Clean navigation bar: "Big sister is watching you"
- Dark theme with glassmorphism effects
- Responsive layout optimized for desktop and mobile

## 🛠️ Technologies

- **TensorFlow.js** v4.2.0 - Machine learning in the browser
- **MediaPipe Hands** @0.4.1646424915 - Advanced hand tracking
- **@tensorflow-models/hand-pose-detection** @2.0.1 - Hand pose estimation
- **fingerpose** @0.1.0 - Gesture recognition library
- **Chart.js** @4.4.4 - Timeline visualization
- **Web Audio API** - Real-time microphone analysis
- **Material Design Icons & Roboto Fonts**

## 🚀 Getting Started

### Installation

```bash
npm install
# or
yarn
```

### Running Locally

Use [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) in VS Code or any static file server:

```bash
# With Live Server extension
# Right-click on index.html → "Open with Live Server"

# Or use Python
python -m http.server 8080

# Or use Node.js http-server
npx http-server -p 8080
```

Navigate to `http://localhost:8080`

### 🔐 Permissions Required

- **Camera access** - For hand gesture detection
- **Microphone access** - For audio/clap detection
  - ⚠️ Make sure to allow microphone in macOS System Settings → Privacy & Security → Microphone
  - The app auto-selects your built-in microphone (not virtual devices like Teams Audio)

## 📖 How It Works

### Hand Detection Pipeline
1. Webcam captures video at 720p (up to 1080p)
2. Frame is upscaled 2x to 2560x1440 on hidden canvas
3. MediaPipe Hands detects up to 15 hands simultaneously
4. Keypoints3D fed to fingerpose for gesture estimation
5. Recognized gestures displayed with emoji + timeline markers

### Audio Detection Pipeline
1. Web Audio API captures microphone input
2. AnalyserNode with FFT size 2048, no smoothing
3. Dual analysis: time domain amplitude + frequency domain average
4. Aggregated over 1 second (60-100 samples)
5. Peak detection triggers clap emoji when > 80%

### Timeline Integration
- Updates every second with current hand count
- Gesture events stored with emoji + intensity/count
- Color-coded line segments based on active gesture
- Clapping increases chart value proportionally to loudness
- Emoji overlays positioned at event timestamps with dynamic scaling

## 🎯 Configuration

### Adjustable Constants

**Hand Detection (`index.js`):**
```javascript
config.video = { width: 1280, height: 720, fps: 30 };
maxHands: 15
minDetectionConfidence: 0.5
minTrackingConfidence: 0.5
```

**Clap Detection (`index.js`):**
```javascript
CLAP_THRESHOLD = 80;  // Peak noise % to trigger clap
```

**Timeline (`timeline.js`):**
```javascript
MAX_SECONDS = 300;  // 5 minutes maximum
DATA_UPDATE_INTERVAL = 1;  // Update every 1 second
```

## 📁 Project Structure

```
├── index.html          # Main UI with Material Design
├── index.js            # Hand detection + audio monitoring logic
├── timeline.js         # Chart.js timeline with emoji overlays
├── package.json        # Dependencies
└── README.md
```

## � Troubleshooting

### Microphone shows 0% noise
- Check macOS System Settings → Privacy & Security → Microphone
- Ensure browser has microphone permission
- App should auto-detect built-in mic (not virtual devices)

### Hands not detected when far away
- Ensure good lighting
- Camera resolution already optimized to 720p with 2x upscaling
- Lower `minDetectionConfidence` if needed

### Timeline not updating
- Click play button (▶️) to start timeline
- Check browser console for errors

## 📚 Resources

- [TensorFlow.js Documentation](https://www.tensorflow.org/js)
- [MediaPipe Hands Guide](https://google.github.io/mediapipe/solutions/hands.html)
- [Chart.js Documentation](https://www.chartjs.org/)
- [Web Audio API Guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

## 📄 License

```
Copyright (c) 2014-2025 Stream.io Inc. All rights reserved.

Licensed under the Stream License;
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   https://github.com/GetStream/stream-chat-swift-ai/blob/main/LICENSE

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
