import './style.css';
import * as THREE from 'three';

// Game Constants
const GAME_DURATION = 180; // seconds
const PLATE_RADIUS = 10;
const BALL_RADIUS = 1.0;
const GRAVITY = 20.0;
const PLAYER_ACCEL = 30.0;
const FRICTION = 0.98;
const MAX_TILT = 0.2; // radians

// Game State
let isPlaying = false;
let timeRemaining = GAME_DURATION;
let balanceTime = 0;
let elapsedTime = 0;
let lastFrameTime = 0;

// Input State
const keys = { w: false, a: false, s: false, d: false };

// DOM Elements
const timeValEl = document.getElementById('time-val');
const modalEl = document.getElementById('modal');
const scorePercentageEl = document.getElementById('score-percentage');
const balancedTimeEl = document.getElementById('balanced-time');
const restartBtn = document.getElementById('restart-btn');

// --- Three.js Setup ---
const container = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e5e7eb');

// Camera (Orthographic or high Perspective looks good for top-down)
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 30, 0);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

// --- Game Objects ---

// The Plate (Parent group for tilting)
const plateGroup = new THREE.Group();
scene.add(plateGroup);

// Plate Base
const plateGeometry = new THREE.CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS, 1, 64);
const plateMaterial = new THREE.MeshStandardMaterial({ color: '#1a2238', roughness: 0.7 });
const plateMesh = new THREE.Mesh(plateGeometry, plateMaterial);
plateMesh.receiveShadow = true;
plateGroup.add(plateMesh);

// Plate Rim (Tall Wall)
const wallHeight = 4;
const wallThickness = 0.5;

// Inner wall
const innerGeo = new THREE.CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS, wallHeight, 64, 1, true);
const wallMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.8, side: THREE.DoubleSide });
const innerMesh = new THREE.Mesh(innerGeo, wallMat);
innerMesh.position.y = wallHeight / 2;
innerMesh.receiveShadow = true;
innerMesh.castShadow = true;
plateGroup.add(innerMesh);

// Outer wall
const outerGeo = new THREE.CylinderGeometry(PLATE_RADIUS + wallThickness, PLATE_RADIUS + wallThickness, wallHeight, 64, 1, true);
const outerMesh = new THREE.Mesh(outerGeo, wallMat);
outerMesh.position.y = wallHeight / 2;
outerMesh.receiveShadow = true;
outerMesh.castShadow = true;
plateGroup.add(outerMesh);

// Top edge
const topGeo = new THREE.RingGeometry(PLATE_RADIUS, PLATE_RADIUS + wallThickness, 64);
const topMesh = new THREE.Mesh(topGeo, wallMat);
topMesh.rotation.x = -Math.PI / 2;
topMesh.position.y = wallHeight;
topMesh.receiveShadow = true;
topMesh.castShadow = true;
plateGroup.add(topMesh);

// Center Mark (X)
const markMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const markGeo1 = new THREE.BoxGeometry(2, 0.1, 0.3);
const markMesh1 = new THREE.Mesh(markGeo1, markMaterial);
markMesh1.position.y = 0.51;
markMesh1.rotation.y = Math.PI / 4;
plateGroup.add(markMesh1);

const markGeo2 = new THREE.BoxGeometry(2, 0.1, 0.3);
const markMesh2 = new THREE.Mesh(markGeo2, markMaterial);
markMesh2.position.y = 0.51;
markMesh2.rotation.y = -Math.PI / 4;
plateGroup.add(markMesh2);

// The Ball (Child of plate so it naturally sits on it)
const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
const ballMaterial = new THREE.MeshStandardMaterial({ color: '#a855f7', roughness: 0.3, metalness: 0.2 });
const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
ballMesh.position.y = 0.5 + BALL_RADIUS;
ballMesh.castShadow = true;
plateGroup.add(ballMesh);

let ballVelocity = new THREE.Vector2(0, 0);

// --- Input Handling ---
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = true;
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (keys.hasOwnProperty(key)) keys[key] = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Game Logic ---
function startGame() {
  isPlaying = true;
  timeRemaining = GAME_DURATION;
  balanceTime = 0;
  elapsedTime = 0;
  ballMesh.position.set(0, 0.5 + BALL_RADIUS, 0);
  ballVelocity.set(0, 0);
  plateGroup.rotation.set(0, 0, 0);
  modalEl.classList.add('hidden');
  lastFrameTime = performance.now();
  
  // Hide UI temporarily while starting
  timeValEl.innerText = timeRemaining;
}

function endGame() {
  isPlaying = false;
  modalEl.classList.remove('hidden');
  
  balanceTime = Math.min(balanceTime, GAME_DURATION);
  const percentage = (balanceTime / GAME_DURATION) * 100;
  scorePercentageEl.innerText = `${percentage.toFixed(1)}%`;
  balancedTimeEl.innerText = balanceTime.toFixed(2);
}

restartBtn.addEventListener('click', startGame);

// --- Game Loop ---
function animate(time) {
  requestAnimationFrame(animate);
  
  if (!isPlaying) {
    renderer.render(scene, camera);
    return;
  }
  
  let delta = (time - lastFrameTime) / 1000; // seconds
  lastFrameTime = time;
  
  // Cap delta to prevent massive jumps when the browser tab is inactive
  delta = Math.min(delta, 0.1);
  
  // Update Timer
  elapsedTime += delta;
  timeRemaining = Math.max(0, GAME_DURATION - Math.floor(elapsedTime));
  timeValEl.innerText = timeRemaining;
  
  // 1. Wobble the plate
  // We use multiple sine waves to make it unpredictable
  const t = time * 0.001;
  plateGroup.rotation.x = Math.sin(t * 1.5) * Math.sin(t * 0.8) * MAX_TILT;
  plateGroup.rotation.z = Math.cos(t * 1.3) * Math.sin(t * 0.9) * MAX_TILT;
  
  // 2. Physics on the ball
  // Gravity component on the tilted plane
  // If plate tilts right (rotZ > 0), ball rolls right (+X)
  // If plate tilts forward (rotX > 0), ball rolls forward (+Z)
  const localGravityX = Math.sin(plateGroup.rotation.z) * GRAVITY;
  const localGravityZ = -Math.sin(plateGroup.rotation.x) * GRAVITY;
  
  ballVelocity.x += localGravityX * delta;
  ballVelocity.y += localGravityZ * delta; // using y of Vector2 to represent Z
  
  // 3. Player Input
  let inputForceX = 0;
  let inputForceZ = 0;
  if (keys.w) inputForceZ -= 1;
  if (keys.s) inputForceZ += 1;
  if (keys.a) inputForceX -= 1;
  if (keys.d) inputForceX += 1;
  
  // Normalize input so diagonal isn't faster
  if (inputForceX !== 0 || inputForceZ !== 0) {
    const length = Math.hypot(inputForceX, inputForceZ);
    inputForceX /= length;
    inputForceZ /= length;
  }
  
  // Map input to camera view (W goes "up" on screen, which is -Z in world)
  ballVelocity.x += inputForceX * PLAYER_ACCEL * delta;
  ballVelocity.y += inputForceZ * PLAYER_ACCEL * delta;
  
  // Apply friction
  ballVelocity.multiplyScalar(FRICTION);
  
  // Update position
  ballMesh.position.x += ballVelocity.x * delta;
  ballMesh.position.z += ballVelocity.y * delta; // y of Vector2 maps to z
  
  // 4. Check lose/bounce condition
  const distFromCenter = Math.hypot(ballMesh.position.x, ballMesh.position.z);
  
  // Only score when the ball is on the center X
  if (distFromCenter <= 1.5) {
    balanceTime += delta;
  }
  
  if (distFromCenter > PLATE_RADIUS - BALL_RADIUS) {
    // Bounce off the wall
    const normalX = ballMesh.position.x / distFromCenter;
    const normalZ = ballMesh.position.z / distFromCenter;
    
    // Position it exactly at the edge
    ballMesh.position.x = normalX * (PLATE_RADIUS - BALL_RADIUS);
    ballMesh.position.z = normalZ * (PLATE_RADIUS - BALL_RADIUS);
    
    // Reflect velocity
    const dot = ballVelocity.x * normalX + ballVelocity.y * normalZ;
    ballVelocity.x -= 2 * dot * normalX;
    ballVelocity.y -= 2 * dot * normalZ;
    
    // Add some dampening so it doesn't bounce forever
    ballVelocity.x *= 0.5;
    ballVelocity.y *= 0.5;
  }
  
  if (elapsedTime >= GAME_DURATION) {
    endGame(); // You won!
  }

  renderer.render(scene, camera);
}

// Start first frame
startGame();
requestAnimationFrame(animate);
