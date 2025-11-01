const config = {
  video: { width: 1280, height: 720, fps: 30 },
};
let videoWidth, videoHeight, drawingContext, canvas, gestureEstimator;
let model;
let detectionCanvas; // Hidden canvas for 2x scaled detection
let audioContext, analyser, microphone;
let noiseLevel = 0;
window.currentNoiseLevel = 0; // Expose globally for timeline
window.currentNoisePeak = 0; // Expose peak for clapping detection
let thresholdCrossed = false; // Track if we've already logged crossing the threshold

const CLAP_THRESHOLD = 80; // Peak noise level to trigger clap emoji
const CAMERA_URL = 'http://192.168.20.166:5000/img'; // Network camera feed URL

const gestureStrings = {
  thumbs_up: '👍',
  victory: '✌🏻',
  thumbs_down: '👎',
};

const fingerLookupIndices = {
  thumb: [0, 1, 2, 3, 4],
  indexFinger: [0, 5, 6, 7, 8],
  middleFinger: [0, 9, 10, 11, 12],
  ringFinger: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20],
};

const landmarkColors = {
  thumb: 'red',
  indexFinger: 'blue',
  middleFinger: 'yellow',
  ringFinger: 'green',
  pinky: 'pink',
  palmBase: 'white',
};

function createThumbsDownGesture() {
  const thumbsDown = new fp.GestureDescription('thumbs_down');

  thumbsDown.addCurl(fp.Finger.Thumb, fp.FingerCurl.NoCurl);
  thumbsDown.addDirection(
    fp.Finger.Thumb,
    fp.FingerDirection.VerticalDown,
    1.0
  );
  thumbsDown.addDirection(
    fp.Finger.Thumb,
    fp.FingerDirection.DiagonalDownLeft,
    0.9
  );
  thumbsDown.addDirection(
    fp.Finger.Thumb,
    fp.FingerDirection.DiagonalDownRight,
    0.9
  );

  for (let finger of [
    fp.Finger.Index,
    fp.Finger.Middle,
    fp.Finger.Ring,
    fp.Finger.Pinky,
  ]) {
    thumbsDown.addCurl(finger, fp.FingerCurl.FullCurl, 0.9);
    thumbsDown.addCurl(finger, fp.FingerCurl.HalfCurl, 0.9);
  }

  return thumbsDown;
}

function drawKeypoints(keypoints) {
  for (let i = 0; i < keypoints.length; i++) {
    const y = keypoints[i][0];
    const x = keypoints[i][1];
    drawPoint(x - 2, y - 2, 3);
  }

  const fingers = Object.keys(fingerLookupIndices);
  for (let i = 0; i < fingers.length; i++) {
    const finger = fingers[i];
    const points = fingerLookupIndices[finger].map((idx) => keypoints[idx]);
    drawPath(points, false, landmarkColors[finger]);
  }
}

function drawPoint(y, x, r) {
  drawingContext.beginPath();
  drawingContext.arc(x, y, r, 0, 2 * Math.PI);
  drawingContext.fill();
}

function drawPath(points, closePath, color) {
  drawingContext.strokeStyle = color;
  const region = new Path2D();
  region.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    region.lineTo(point[0], point[1]);
  }

  if (closePath) {
    region.closePath();
  }
  drawingContext.stroke(region);
}

async function loadWebcam(width, height, fps) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
      'Browser API navigator.mediaDevices.getUserMedia is not available'
    );
  }

  let video = document.getElementById('webcam');
  video.muted = true;
  video.width = width;
  video.height = height;

  const mediaConfig = {
    audio: false,
    video: {
      facingMode: 'user',
      width: { ideal: width, max: 1920 },
      height: { ideal: height, max: 1080 },
      frameRate: { ideal: fps, max: 60 },
      aspectRatio: { ideal: 16/9 }
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(mediaConfig);
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function loadVideo() {
  const video = await loadWebcam(
    config.video.width,
    config.video.height,
    config.video.fps
  );
  video.play();
  
  // Initialize audio context and microphone
  await initAudio();
  
  return video;
}

async function initAudio() {
  try {
    // Check if running on HTTPS (required for microphone except localhost)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      console.warn('⚠️ Microphone requires HTTPS. Current protocol:', window.location.protocol);
      console.warn('Please use HTTPS or localhost for microphone access');
      return;
    }
    
    // Step 1: Request basic permission first to get device labels
    console.log('Requesting microphone permission...');
    let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Step 2: Now enumerate devices with full labels
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    
    console.log('Available audio input devices:');
    audioInputs.forEach((device, index) => {
      console.log(`${index}: ${device.label} (${device.deviceId})`);
    });
    
    // Find the real Mac microphone (not virtual devices)
    let selectedDevice = audioInputs.find(device => 
      device.label.toLowerCase().includes('macbook') || 
      device.label.toLowerCase().includes('built-in') ||
      device.label.toLowerCase().includes('internal')
    );
    
    // If not found, use the first non-Teams/non-virtual device
    if (!selectedDevice) {
      selectedDevice = audioInputs.find(device => 
        !device.label.toLowerCase().includes('teams') &&
        !device.label.toLowerCase().includes('virtual')
      );
    }
    
    // If we found a better device, stop the current stream and switch
    if (selectedDevice) {
      console.log('Switching to:', selectedDevice.label);
      stream.getTracks().forEach(track => track.stop());
      stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { deviceId: { exact: selectedDevice.deviceId } }
      });
    } else {
      console.log('Using default microphone');
    }
    
    // Check if audio track is enabled
    const audioTracks = stream.getAudioTracks();
    console.log('Audio tracks:', audioTracks.length);
    if (audioTracks.length > 0) {
      const track = audioTracks[0];
      console.log('✅ Audio track label:', track.label);
      console.log('Audio track enabled:', track.enabled);
      console.log('Audio track muted:', track.muted);
      console.log('Audio track readyState:', track.readyState);
    }
    
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log('AudioContext created, sampleRate:', audioContext.sampleRate);
    
    analyser = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(stream);
    
    // Try with less smoothing to see raw data
    analyser.fftSize = 2048;  // Larger for more detail
    analyser.smoothingTimeConstant = 0;  // No smoothing - raw data
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    
    microphone.connect(analyser);
    
    // Start monitoring noise level
    monitorNoiseLevel();
    
    console.log('✅ Microphone initialized, AudioContext state:', audioContext.state);
  } catch (err) {
    console.error('❌ Error accessing microphone:', err);
    console.error('Make sure you are using HTTPS or localhost, and have granted microphone permissions');
  }
}

function monitorNoiseLevel() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  const frequencyData = new Uint8Array(bufferLength);
  
  let samples = [];
  let lastLogTime = Date.now();
  
  function analyze() {
    // Get both time domain and frequency data
    analyser.getByteTimeDomainData(dataArray);
    analyser.getByteFrequencyData(frequencyData);
    
    // Method 1: Time domain amplitude (more direct)
    let min = 255;
    let max = 0;
    for (let i = 0; i < bufferLength; i++) {
      if (dataArray[i] < min) min = dataArray[i];
      if (dataArray[i] > max) max = dataArray[i];
    }
    const amplitude = max - min;
    const volumeTime = Math.round((amplitude / 255) * 100);
    
    // Method 2: Frequency domain average
    let sumFreq = 0;
    for (let i = 0; i < bufferLength; i++) {
      sumFreq += frequencyData[i];
    }
    const avgFreq = sumFreq / bufferLength;
    const volumeFreq = Math.round((avgFreq / 255) * 100);
    
    // Use whichever gives a higher reading
    const volume = Math.max(volumeTime, volumeFreq);
    
    // Update noise bar in real-time
    const noiseBarFill = document.getElementById('noise-bar-fill');
    const noiseBarPercentage = document.getElementById('noise-bar-percentage');
    if (noiseBarFill && noiseBarPercentage) {
      noiseBarFill.style.height = `${volume}%`;
      noiseBarPercentage.textContent = `${volume}%`;
      
      // Log when crossing 80% threshold and trigger confetti
      if (volume >= 80 && !thresholdCrossed) {
        console.log('🔊 Threshold crossed:', volume + '%');
        thresholdCrossed = true;
        
        // Trigger confetti
        if (typeof confetti !== 'undefined') {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      } else if (volume < 80 && thresholdCrossed) {
        thresholdCrossed = false; // Reset when dropping below threshold
      }
    }
    
    samples.push(volume);
    
    // Log aggregated noise level every second
    const now = Date.now();
    if (now - lastLogTime >= 1000) {
      if (samples.length > 0) {
        const avgNoise = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
        const maxNoise = Math.max(...samples);
        noiseLevel = avgNoise;
        window.currentNoiseLevel = avgNoise; // Update global for timeline
        window.currentNoisePeak = maxNoise; // Update peak for clapping detection
        
        // Trigger clap emoji if peak exceeds threshold
        if (maxNoise >= CLAP_THRESHOLD) {
          if (window.triggerClapEmoji) {
            window.triggerClapEmoji(maxNoise);
          }
        }
      }
      samples = [];
      lastLogTime = now;
    }
    
    requestAnimationFrame(analyze);
  }
  
  analyze();
}
async function continuouslyDetectLandmarks(video) {
  async function runDetection() {
    drawingContext.drawImage(
      video,
      0,
      0,
      videoWidth,
      videoHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Create a 2x scaled version of the video for better hand detection
    const detectionCtx = detectionCanvas.getContext('2d');
    detectionCtx.drawImage(video, 0, 0, videoWidth * 2, videoHeight * 2);

    // Detect hands using the scaled canvas (better detection of small/distant hands)
    const hands = await model.estimateHands(detectionCanvas);
    
    const detectedGestures = [];
    
    // Process each detected hand
    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i];
      
      // Use keypoints3D for gesture estimation (normalized coordinates)
      // and keypoints for drawing (pixel coordinates)
      if (hand.keypoints3D && hand.keypoints) {
        // Scale keypoints back down to original size for drawing
        const landmarks2D = hand.keypoints.map(kp => [kp.x / 2, kp.y / 2]);
        drawKeypoints(landmarks2D);
        
        // Use 3D normalized coordinates for gesture estimation (no scaling needed)
        const landmarks3D = hand.keypoints3D.map(kp => [kp.x, kp.y, kp.z]);
        
        // Estimate gesture for this hand
        const est = gestureEstimator.estimate(landmarks3D, 9);
        
        if (est.gestures.length > 0) {
          // Find gesture with highest match score
          let result = est.gestures.reduce((p, c) => {
            return p.score > c.score ? p : c;
          });

          if (result.score > 7.5) {  // Lower threshold for better detection
            detectedGestures.push(gestureStrings[result.name]);
          }
        }
      }
    }
    
    // Display all detected gestures
    const gestureTextElement = document.getElementById('gesture-text');
    if (detectedGestures.length > 0) {
      gestureTextElement.textContent = detectedGestures.join(' ');
    } else {
      // Don't clear if clap emoji is showing
      if (!gestureTextElement.textContent.includes('👏')) {
        gestureTextElement.textContent = '';
      }
    }

    requestAnimationFrame(runDetection);
  }

  // Initialize gesture detection - only thumbs up and thumbs down
  const knownGestures = [
    fp.Gestures.VictoryGesture,
    fp.Gestures.ThumbsUpGesture,
    createThumbsDownGesture(),
  ];

  gestureEstimator = new fp.GestureEstimator(knownGestures);

  // Load MediaPipe Hands model with support for multiple hands (up to 10)
  const detectorConfig = {
    runtime: 'mediapipe',
    solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915',
    modelType: 'full',
    maxHands: 15,  // Detect up to 15 hands
    minDetectionConfidence: 0.2,  // Lower threshold for better detection of small/distant hands
    minTrackingConfidence: 0.2,    // Lower threshold for smoother tracking
    // maxHands: 15,  // Detect up to 15 hands
  };
  model = await handPoseDetection.createDetector(
    handPoseDetection.SupportedModels.MediaPipeHands, 
    detectorConfig
  );
  runDetection();
}

async function main() {
  let video = await loadVideo();

  videoWidth = video.videoWidth;
  videoHeight = video.videoHeight;

  canvas = document.getElementById('canvas');
  canvas.width = videoWidth;
  canvas.height = videoHeight;

  // Create hidden canvas for 2x scaled detection
  detectionCanvas = document.createElement('canvas');
  detectionCanvas.width = videoWidth * 2;
  detectionCanvas.height = videoHeight * 2;

  drawingContext = canvas.getContext('2d');
  drawingContext.clearRect(0, 0, videoWidth, videoHeight);

  drawingContext.fillStyle = 'white';
  drawingContext.translate(canvas.width, 0);
  drawingContext.scale(-1, 1);

  continuouslyDetectLandmarks(video);
  
  // Show timeline and start animation
  const wrap = document.getElementById('wrap');
  if (wrap) {
    wrap.classList.add('show');
  }
  
  // Start timeline animation after a brief delay
  setTimeout(() => {
    if (window.timelineControls) {
      window.timelineControls.start();
    }
  }, 500);
}

// Camera feed polling function
const cameraFeeds = new Map();

function startCameraFeedPolling(cameraNumber, url = CAMERA_URL) {
  if (cameraFeeds.has(cameraNumber)) {
    return; // Already polling this camera
  }
  
  const imgElement = document.getElementById(`camera-feed-${cameraNumber}`);
  if (!imgElement) {
    console.warn(`Camera feed element ${cameraNumber} not found`);
    return;
  }
  
  const pollInterval = setInterval(async () => {
    try {
      const response = await fetch(url, {
        cache: 'no-cache',
        mode: 'cors'
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const objectURL = URL.createObjectURL(blob);
        
        // Revoke previous URL to prevent memory leak
        if (imgElement.dataset.blobUrl) {
          URL.revokeObjectURL(imgElement.dataset.blobUrl);
        }
        
        imgElement.src = objectURL;
        imgElement.dataset.blobUrl = objectURL;
      }
    } catch (error) {
      // Silently fail - network errors are expected
    }
  }, 1000);
  
  cameraFeeds.set(cameraNumber, pollInterval);
}

function stopCameraFeedPolling(cameraNumber) {
  const interval = cameraFeeds.get(cameraNumber);
  if (interval) {
    clearInterval(interval);
    cameraFeeds.delete(cameraNumber);
    
    const imgElement = document.getElementById(`camera-feed-${cameraNumber}`);
    if (imgElement && imgElement.dataset.blobUrl) {
      URL.revokeObjectURL(imgElement.dataset.blobUrl);
      delete imgElement.dataset.blobUrl;
    }
  }
}

// Start polling for all 4 cameras
for (let i = 1; i <= 4; i++) {
  startCameraFeedPolling(i);
}

main();
