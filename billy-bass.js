// billy-bass.js - Interactive Billy Big Mouth Bass Controller
// Requires Node.js 18+ on Raspberry Pi

const Anthropic = require('@anthropic-ai/sdk');
const { Chip, Line } = require('node-libgpiod');
const i2c = require('i2c-bus');
const recorder = require('node-record-lpcm16');
const fs = require('fs');
const { Readable } = require('stream');
const Speaker = require('speaker');
const OpenAI = require('openai'); // For Whisper speech-to-text
const say = require('say'); // For text-to-speech
const { spawn } = require('child_process');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // API Keys (set as environment variables)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  
  // GPIO Configuration
  BUTTON_PIN: 17, // GPIO 17 (Physical Pin 11)
  
  // I2C Configuration for 4WD Robot Hat
  I2C_BUS: 20,
  I2C_ADDRESS: 0x14, // Default address for CKK0018
  
  // Motor Channels (on Robot Hat)
  MOTOR_BODY: 0,   // M1 - Turns fish toward user
  MOTOR_MOUTH: 1,  // M2 - Mouth animation
  MOTOR_TAIL: 2,   // M3 - Tail wagging
  
  // Motor Speeds (0-100)
  BODY_TURN_SPEED: 60,
  BODY_TURN_DURATION: 2000, // ms
  MOUTH_SPEED: 70,
  TAIL_SPEED: 50,
  
  // Audio Configuration
  AUDIO_SAMPLE_RATE: 16000,
  AUDIO_RECORDING_DURATION: 5000, // ms - maximum recording time
  AUDIO_TEMP_FILE: '/tmp/billy_bass_recording.wav',
  TTS_OUTPUT_FILE: '/tmp/billy_bass_response.wav',
  
  // AI Configuration
  AI_MODEL: 'claude-sonnet-4-20250514',
  AI_MAX_TOKENS: 150,
  AI_SYSTEM_PROMPT: `You are Billy Bass, a wise-cracking animatronic fish. 
Respond to questions with 1-2 sentences full of fish puns and fishing-related humor. 
Keep it family-friendly and fun!`
};

// ============================================================================
// ROBOT HAT MOTOR CONTROLLER
// ============================================================================

class RobotHat {
  constructor(busNumber, address) {
    this.bus = i2c.openSync(busNumber);
    this.address = address;
    this.initialized = false;
  }
  
  // Initialize the motor controller
  async init() {
    try {
      // The CKK0018 uses PCA9685-style PWM control
      // Register 0x00 = MODE1, we'll set it to normal mode
      this.bus.writeByteSync(this.address, 0x00, 0x00);
      
      // Set PWM frequency for motors (~1000 Hz)
      // Register 0xFE = PRE_SCALE
      this.bus.writeByteSync(this.address, 0xFE, 0x79);
      
      this.initialized = true;
      console.log('✓ Robot Hat initialized');
      return true;
    } catch (error) {
      console.error('✗ Failed to initialize Robot Hat:', error.message);
      return false;
    }
  }
  
  // Set motor speed and direction
  // motor: 0-3 (M1-M4)
  // speed: -100 to 100 (negative = reverse)
  setMotor(motor, speed) {
    if (!this.initialized) {
      console.error('Robot Hat not initialized');
      return;
    }
    
    // Clamp speed
    speed = Math.max(-100, Math.min(100, speed));
    
    // Convert speed to PWM value (0-4095)
    const pwmValue = Math.abs(speed) * 40.95;
    const direction = speed >= 0 ? 1 : 0;
    
    try {
      // Motor control registers (simplified - adjust based on actual hat specs)
      const motorBase = 0x20 + (motor * 4);
      
      // Set PWM value
      this.bus.writeWordSync(this.address, motorBase, Math.round(pwmValue));
      
      // Set direction
      this.bus.writeByteSync(this.address, motorBase + 2, direction);
      
    } catch (error) {
      console.error(`Error setting motor ${motor}:`, error.message);
    }
  }
  
  // Stop a specific motor
  stopMotor(motor) {
    this.setMotor(motor, 0);
  }
  
  // Stop all motors
  stopAll() {
    for (let i = 0; i < 4; i++) {
      this.stopMotor(i);
    }
  }
  
  close() {
    this.stopAll();
    this.bus.closeSync();
  }
}

// ============================================================================
// AUDIO MANAGER
// ============================================================================

class AudioManager {
  constructor() {
    this.openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
    this.isRecording = false;
    this.recordingStream = null;
  }
  
  // Record audio from USB microphone
  async recordAudio(duration) {
    return new Promise((resolve, reject) => {
      console.log(`🎤 Recording for ${duration}ms...`);
      
      const recording = recorder.record({
        sampleRate: CONFIG.AUDIO_SAMPLE_RATE,
        channels: 1,
        audioType: 'wav',
        silence: '2.0', // Stop after 2 seconds of silence
        threshold: 0.5,
        device: 'hw:3,0' // Hard-coded USB audio device
      });
      
      const audioFile = fs.createWriteStream(CONFIG.AUDIO_TEMP_FILE, { encoding: 'binary' });
      this.recordingStream = recording.stream();
      
      this.recordingStream.pipe(audioFile);
      this.isRecording = true;
      
      // Stop recording after duration
      const timeout = setTimeout(() => {
        recording.stop();
      }, duration);
      
      this.recordingStream.on('close', () => {
        clearTimeout(timeout);
        this.isRecording = false;
        console.log('✓ Recording complete');
        resolve(CONFIG.AUDIO_TEMP_FILE);
      });
      
      this.recordingStream.on('error', (error) => {
        clearTimeout(timeout);
        this.isRecording = false;
        console.error('✗ Recording error:', error);
        reject(error);
      });
    });
  }
  
  // Transcribe audio using OpenAI Whisper
  async transcribeAudio(audioFilePath) {
    try {
      console.log('🎯 Transcribing audio...');
      
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-1',
        language: 'en'
      });
      
      console.log(`✓ Transcription: "${transcription.text}"`);
      return transcription.text;
    } catch (error) {
      console.error('✗ Transcription error:', error.message);
      return null;
    }
  }
  
  // Generate speech from text using system TTS
  async textToSpeech(text) {
    return new Promise((resolve, reject) => {
      console.log('🗣️  Generating speech...');
      
      say.export(text, 'Alex', 0.7, CONFIG.TTS_OUTPUT_FILE, (error) => {
        if (error) {
          console.error('✗ TTS error:', error);
          reject(error);
        } else {
          console.log('✓ Speech generated');
          resolve(CONFIG.TTS_OUTPUT_FILE);
        }
      });
    });
  }
  
  // Play audio file and return duration
  async playAudio(audioFilePath) {
    return new Promise((resolve, reject) => {
      console.log('🔊 Playing audio...');
      
      // Use aplay for reliable playback on Raspberry Pi
      const player = spawn('aplay', ['-q', audioFilePath]);
      
      player.on('close', (code) => {
        if (code === 0) {
          console.log('✓ Playback complete');
          resolve();
        } else {
          reject(new Error(`Playback failed with code ${code}`));
        }
      });
      
      player.on('error', (error) => {
        console.error('✗ Playback error:', error);
        reject(error);
      });
    });
  }
  
  // Get audio file duration in milliseconds
  getAudioDuration(audioFilePath) {
    try {
      const stats = fs.statSync(audioFilePath);
      // Rough estimation: filesize / (sampleRate * bytesPerSample * channels)
      const duration = (stats.size / (CONFIG.AUDIO_SAMPLE_RATE * 2 * 1)) * 1000;
      return duration;
    } catch (error) {
      return 3000; // Default fallback
    }
  }
}

// ============================================================================
// AI AGENT
// ============================================================================

class FishAI {
  constructor() {
    this.client = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });
  }
  
  // Get punny response from Claude
  async getResponse(userMessage) {
    try {
      console.log('🤖 Asking Claude for a punny response...');
      
      const message = await this.client.messages.create({
        model: CONFIG.AI_MODEL,
        max_tokens: CONFIG.AI_MAX_TOKENS,
        system: CONFIG.AI_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userMessage }
        ]
      });
      
      const response = message.content[0].text;
      console.log(`✓ AI Response: "${response}"`);
      return response;
    } catch (error) {
      console.error('✗ AI error:', error.message);
      return "Something's fishy here! Let's try that again.";
    }
  }
}

// ============================================================================
// BILLY BASS CONTROLLER
// ============================================================================

class BillyBass {
  constructor() {
    this.chip = new Chip(0); // GPIO chip 0
    this.button = this.chip.getLine(CONFIG.BUTTON_PIN);
    this.robotHat = new RobotHat(CONFIG.I2C_BUS, CONFIG.I2C_ADDRESS);
    this.audioManager = new AudioManager();
    this.fishAI = new FishAI();
    this.isProcessing = false;
    this.buttonWatcher = null;
  }
  
  // Initialize all systems
  async init() {
    console.log('🐟 Initializing Billy Bass...\n');
    
    const success = await this.robotHat.init();
    if (!success) {
      console.error('Failed to initialize. Check I2C connection.');
      return false;
    }
    
    // Configure button as input with pull-up
    this.button.requestInputMode();
    
    // Set up button monitoring with polling (gpiod doesn't have native watch)
    this.buttonWatcher = setInterval(() => {
      const value = this.button.getValue();
      if (value === 0 && !this.isProcessing) { // Button pressed (active low with pull-up)
        this.handleButtonPress();
      }
    }, 100); // Poll every 100ms
    
    console.log('✓ Button monitoring started');
    console.log('\n🎣 Billy Bass is ready! Press the button to start.\n');
    return true;
  }
  
  // Main interaction sequence
  async handleButtonPress() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log('\n' + '='.repeat(50));
    console.log('🔴 BUTTON PRESSED - Starting interaction...');
    console.log('='.repeat(50) + '\n');
    
    try {
      // Step 1: Turn toward user
      await this.turnTowardUser();
      
      // Step 2: Listen for voice
      const userSpeech = await this.listenForSpeech();
      if (!userSpeech) {
        await this.sayError();
        this.isProcessing = false;
        return;
      }
      
      // Step 3: Get AI response
      const aiResponse = await this.fishAI.getResponse(userSpeech);
      
      // Step 4: Generate speech
      const audioFile = await this.audioManager.textToSpeech(aiResponse);
      
      // Step 5: Speak with animation
      await this.speakWithAnimation(audioFile);
      
      // Step 6: Return to idle
      await this.returnToIdle();
      
    } catch (error) {
      console.error('✗ Error in interaction:', error);
      await this.returnToIdle();
    } finally {
      this.isProcessing = false;
      console.log('\n✓ Ready for next interaction\n');
    }
  }
  
  // Turn the fish toward the user
  async turnTowardUser() {
    console.log('↻ Turning toward user...');
    
    this.robotHat.setMotor(CONFIG.MOTOR_BODY, CONFIG.BODY_TURN_SPEED);
    
    await this.sleep(CONFIG.BODY_TURN_DURATION);
    
    this.robotHat.stopMotor(CONFIG.MOTOR_BODY);
    console.log('✓ Positioned\n');
  }
  
  // Listen for user speech
  async listenForSpeech() {
    try {
      const audioFile = await this.audioManager.recordAudio(CONFIG.AUDIO_RECORDING_DURATION);
      const transcription = await this.audioManager.transcribeAudio(audioFile);
      return transcription;
    } catch (error) {
      console.error('✗ Failed to listen:', error);
      return null;
    }
  }
  
  // Speak response with mouth and tail animation
  async speakWithAnimation(audioFile) {
    console.log('🎭 Speaking with animation...\n');
    
    // Start playback
    const playbackPromise = this.audioManager.playAudio(audioFile);
    
    // Animate mouth and tail during speech
    const animationPromise = this.animateSpeech(
      this.audioManager.getAudioDuration(audioFile)
    );
    
    // Wait for both to complete
    await Promise.all([playbackPromise, animationPromise]);
  }
  
  // Animate mouth and tail during speech
  async animateSpeech(duration) {
    const startTime = Date.now();
    let mouthOpen = false;
    
    // Animate for the duration of speech
    while (Date.now() - startTime < duration) {
      // Toggle mouth
      mouthOpen = !mouthOpen;
      this.robotHat.setMotor(
        CONFIG.MOTOR_MOUTH,
        mouthOpen ? CONFIG.MOUTH_SPEED : -CONFIG.MOUTH_SPEED
      );
      
      // Wag tail
      const tailSpeed = Math.random() > 0.5 ? CONFIG.TAIL_SPEED : -CONFIG.TAIL_SPEED;
      this.robotHat.setMotor(CONFIG.MOTOR_TAIL, tailSpeed);
      
      // Wait before next movement
      await this.sleep(150 + Math.random() * 100);
    }
    
    // Stop animation
    this.robotHat.stopMotor(CONFIG.MOTOR_MOUTH);
    this.robotHat.stopMotor(CONFIG.MOTOR_TAIL);
  }
  
  // Return to idle position
  async returnToIdle() {
    console.log('⏮️  Returning to idle position...');
    
    // Turn back
    this.robotHat.setMotor(CONFIG.MOTOR_BODY, -CONFIG.BODY_TURN_SPEED);
    await this.sleep(CONFIG.BODY_TURN_DURATION);
    
    // Stop all motors
    this.robotHat.stopAll();
    console.log('✓ Back to idle\n');
  }
  
  // Play error message
  async sayError() {
    const errorMessage = "I didn't catch that, but I'm all ears... or fins!";
    const audioFile = await this.audioManager.textToSpeech(errorMessage);
    await this.speakWithAnimation(audioFile);
  }
  
  // Helper: sleep function
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Cleanup and shutdown
  async shutdown() {
    console.log('\n🛑 Shutting down Billy Bass...');
    
    // Stop button monitoring
    if (this.buttonWatcher) {
      clearInterval(this.buttonWatcher);
    }
    
    this.robotHat.stopAll();
    this.robotHat.close();
    
    // Release GPIO resources
    this.button.release();
    this.chip.close();
    
    // Clean up temp files
    try {
      if (fs.existsSync(CONFIG.AUDIO_TEMP_FILE)) {
        fs.unlinkSync(CONFIG.AUDIO_TEMP_FILE);
      }
      if (fs.existsSync(CONFIG.TTS_OUTPUT_FILE)) {
        fs.unlinkSync(CONFIG.TTS_OUTPUT_FILE);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
    
    console.log('✓ Goodbye!\n');
    process.exit(0);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Check for required API keys
  if (!CONFIG.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY environment variable not set');
    console.error('   Set it with: export ANTHROPIC_API_KEY=your_key_here');
    process.exit(1);
  }
  
  if (!CONFIG.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable not set');
    console.error('   Set it with: export OPENAI_API_KEY=your_key_here');
    process.exit(1);
  }
  
  // Create and initialize Billy Bass
  const billy = new BillyBass();
  
  const initialized = await billy.init();
  if (!initialized) {
    console.error('Failed to initialize Billy Bass');
    process.exit(1);
  }
  
  // Handle graceful shutdown
  process.on('SIGINT', () => billy.shutdown());
  process.on('SIGTERM', () => billy.shutdown());
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
