// billy-bass.js - Interactive Billy Big Mouth Bass Controller
// Requires Node.js 18+ on Raspberry Pi

const Anthropic = require('@anthropic-ai/sdk');
const recorder = require('node-record-lpcm16');
const fs = require('fs');
const { spawn } = require('child_process');
const OpenAI = require('openai'); // For Whisper speech-to-text and TTS

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // API Keys (set as environment variables)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  
  // GPIO Configuration
  BUTTON_PIN: 17, // GPIO 17 (Physical Pin 11)
  
  // Motor Control GPIO Pins (DRV8833 drivers)
  // Body Motor = Motor A1 (DRV8833 #1)
  MOTOR_BODY_PIN1: 17,
  MOTOR_BODY_PIN2: 27,
  MOTOR_BODY_PWM: 12,
  
  // Mouth Motor = Motor B1 (DRV8833 #1)  
  MOTOR_MOUTH_PIN1: 22,
  MOTOR_MOUTH_PIN2: 23,
  MOTOR_MOUTH_PWM: 12, // Shares PWM with Body
  
  // Tail Motor = Motor A2 (DRV8833 #2)
  MOTOR_TAIL_PIN1: 24,
  MOTOR_TAIL_PIN2: 25,
  MOTOR_TAIL_PWM: 13,
  
  // Motor Speeds (0-100)
  BODY_TURN_SPEED: 60,
  BODY_TURN_DURATION: 2000, // ms
  MOUTH_SPEED: 70,
  TAIL_SPEED: 50,
  
  // Audio Configuration
  AUDIO_SAMPLE_RATE: 16000,
  AUDIO_RECORDING_DURATION: 5000, // ms - maximum recording time
  AUDIO_TEMP_FILE: '/tmp/billy_bass_recording.wav',
  TTS_OUTPUT_FILE: '/tmp/billy_bass_response.mp3',
  TTS_VOICE: 'onyx', // Options: alloy, echo, fable, onyx, nova, shimmer
  TTS_MODEL: 'tts-1', // or 'tts-1-hd' for higher quality
  
  // AI Configuration
  AI_MODEL: 'claude-sonnet-4-20250514',
  AI_MAX_TOKENS: 150,
  AI_SYSTEM_PROMPT: `You are Billy Bass, a wise-cracking animatronic fish. 
Respond to questions with 1-2 sentences full of fish puns and fishing-related humor. 
Keep it family-friendly and fun!`
};

// ============================================================================
// GPIO MOTOR CONTROLLER (DRV8833)
// ============================================================================

class MotorController {
  constructor() {
    this.initialized = false;
    this.motors = {
      body: { pin1: CONFIG.MOTOR_BODY_PIN1, pin2: CONFIG.MOTOR_BODY_PIN2, pwm: CONFIG.MOTOR_BODY_PWM },
      mouth: { pin1: CONFIG.MOTOR_MOUTH_PIN1, pin2: CONFIG.MOTOR_MOUTH_PIN2, pwm: CONFIG.MOTOR_MOUTH_PWM },
      tail: { pin1: CONFIG.MOTOR_TAIL_PIN1, pin2: CONFIG.MOTOR_TAIL_PIN2, pwm: CONFIG.MOTOR_TAIL_PWM }
    };
  }
  
  // Initialize GPIO pins for motor control
  async init() {
    try {
      // Set all motor direction pins as outputs (low by default)
      for (const motor of Object.values(this.motors)) {
        await this.setGPIOMode(motor.pin1, 'out');
        await this.setGPIOMode(motor.pin2, 'out');
        await this.setGPIOValue(motor.pin1, 0);
        await this.setGPIOValue(motor.pin2, 0);
      }
      
      // Set PWM pins (NSLEEP) - these enable the motor drivers
      await this.setGPIOMode(CONFIG.MOTOR_BODY_PWM, 'out');
      await this.setGPIOMode(CONFIG.MOTOR_TAIL_PWM, 'out');
      
      // Enable both DRV8833 chips (HIGH = enabled)
      await this.setGPIOValue(CONFIG.MOTOR_BODY_PWM, 1);
      await this.setGPIOValue(CONFIG.MOTOR_TAIL_PWM, 1);
      
      this.initialized = true;
      console.log('✓ Motor Controller initialized');
      return true;
    } catch (error) {
      console.error('✗ Failed to initialize Motor Controller:', error.message);
      return false;
    }
  }
  
  // Helper: Set GPIO pin mode using gpiod
  async setGPIOMode(pin, mode) {
    // gpiod doesn't require explicit mode setting - done when accessing
    return Promise.resolve();
  }
  
  // Helper: Set GPIO pin value
  async setGPIOValue(pin, value) {
    return new Promise((resolve, reject) => {
      const cmd = spawn('gpioset', ['gpiochip0', `${pin}=${value}`]);
      cmd.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`gpioset failed with code ${code}`));
      });
      cmd.on('error', reject);
    });
  }
  
  // Set motor speed and direction
  // motor: 'body', 'mouth', or 'tail'
  // speed: -100 to 100 (negative = reverse)
  async setMotor(motorName, speed) {
    if (!this.initialized) {
      console.error('Motor Controller not initialized');
      return;
    }
    
    const motor = this.motors[motorName];
    if (!motor) {
      console.error(`Unknown motor: ${motorName}`);
      return;
    }
    
    // Clamp speed
    speed = Math.max(-100, Math.min(100, speed));
    
    try {
      if (speed === 0) {
        // Stop: both pins LOW
        await this.setGPIOValue(motor.pin1, 0);
        await this.setGPIOValue(motor.pin2, 0);
      } else if (speed > 0) {
        // Forward: pin1 HIGH, pin2 LOW
        await this.setGPIOValue(motor.pin1, 1);
        await this.setGPIOValue(motor.pin2, 0);
      } else {
        // Reverse: pin1 LOW, pin2 HIGH
        await this.setGPIOValue(motor.pin1, 0);
        await this.setGPIOValue(motor.pin2, 1);
      }
      
      // Note: We're using full speed (PWM always HIGH)
      // For true PWM speed control, would need to use hardware PWM
      // or software PWM with rapid pin toggling
      
    } catch (error) {
      console.error(`Error setting motor ${motorName}:`, error.message);
    }
  }
  
  // Stop a specific motor
  async stopMotor(motorName) {
    await this.setMotor(motorName, 0);
  }
  
  // Stop all motors
  async stopAll() {
    await this.setMotor('body', 0);
    await this.setMotor('mouth', 0);
    await this.setMotor('tail', 0);
  }
  
  // Cleanup
  async close() {
    await this.stopAll();
    // Disable motor drivers
    try {
      await this.setGPIOValue(CONFIG.MOTOR_BODY_PWM, 0);
      await this.setGPIOValue(CONFIG.MOTOR_TAIL_PWM, 0);
    } catch (error) {
      // Ignore cleanup errors
    }
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
        device: 'hw:3,0' // Hard-coded USB audio device
        // Removed silence detection - record full duration
      });
      
      const audioFile = fs.createWriteStream(CONFIG.AUDIO_TEMP_FILE, { encoding: 'binary' });
      this.recordingStream = recording.stream();
      
      this.recordingStream.pipe(audioFile);
      this.isRecording = true;
      
      // Stop recording after duration
      const timeout = setTimeout(() => {
        recording.stop();
      }, duration);
      
      // Wait for stream to fully close
      audioFile.on('finish', () => {
        clearTimeout(timeout);
        this.isRecording = false;
        console.log('✓ Recording complete');
        
        // Small delay to ensure file is fully written
        setTimeout(() => {
          resolve(CONFIG.AUDIO_TEMP_FILE);
        }, 100);
      });
      
      this.recordingStream.on('error', (error) => {
        clearTimeout(timeout);
        this.isRecording = false;
        console.error('✗ Recording error:', error);
        reject(error);
      });
      
      audioFile.on('error', (error) => {
        clearTimeout(timeout);
        this.isRecording = false;
        console.error('✗ File write error:', error);
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
  
  // Generate speech from text using OpenAI TTS
  async textToSpeech(text) {
    try {
      console.log('🗣️  Generating speech...');
      
      const mp3 = await this.openai.audio.speech.create({
        model: CONFIG.TTS_MODEL,
        voice: CONFIG.TTS_VOICE,
        input: text,
      });
      
      const buffer = Buffer.from(await mp3.arrayBuffer());
      await fs.promises.writeFile(CONFIG.TTS_OUTPUT_FILE, buffer);
      
      console.log('✓ Speech generated');
      return CONFIG.TTS_OUTPUT_FILE;
    } catch (error) {
      console.error('✗ TTS error:', error.message);
      throw error;
    }
  }
  
  // Play audio file and return duration
  async playAudio(audioFilePath) {
    return new Promise((resolve, reject) => {
      console.log('🔊 Playing audio...');
      
      // Use mpg123 for MP3 files, aplay for WAV
      const isMp3 = audioFilePath.endsWith('.mp3');
      const player = spawn(isMp3 ? 'mpg123' : 'aplay', ['-q', audioFilePath]);
      
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
  async getAudioDuration(audioFilePath) {
    return new Promise((resolve) => {
      // Use ffprobe to get exact duration for MP3 files
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audioFilePath
      ]);
      
      let output = '';
      
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        if (code === 0 && output.trim()) {
          const seconds = parseFloat(output.trim());
          resolve(seconds * 1000); // Convert to milliseconds
        } else {
          // Fallback: estimate 3 seconds for typical TTS response
          console.log('⚠️  Could not determine audio duration, using fallback');
          resolve(3000);
        }
      });
      
      ffprobe.on('error', () => {
        // ffprobe not installed, use fallback
        resolve(3000);
      });
    });
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
    this.motorController = new MotorController();
    this.audioManager = new AudioManager();
    this.fishAI = new FishAI();
    this.isProcessing = false;
    this.buttonWatcher = null;
    this.gpioMonitor = null;
  }
  
  // Initialize all systems
  async init() {
    console.log('🐟 Initializing Billy Bass...\n');
    
    const success = await this.motorController.init();
    if (!success) {
      console.error('Failed to initialize motors. Check GPIO connections.');
      return false;
    }
    
    // Set up button monitoring using gpiod CLI tools
    // Button is active-low (reads 0 when pressed) with internal pull-up
    let lastValue = await this.readGPIO(CONFIG.BUTTON_PIN);
    
    this.buttonWatcher = setInterval(async () => {
      try {
        const value = await this.readGPIO(CONFIG.BUTTON_PIN);
        
        // Detect button press (falling edge: 1 -> 0)
        if (value === 0 && lastValue === 1 && !this.isProcessing) {
          this.handleButtonPress();
        }
        
        lastValue = value;
      } catch (error) {
        // Ignore read errors during polling
      }
    }, 100); // Poll every 100ms
    
    console.log('✓ Button monitoring started (GPIO ' + CONFIG.BUTTON_PIN + ')');
    console.log('\n🎣 Billy Bass is ready! Press the button to start.\n');
    return true;
  }
  
  // Helper: Read GPIO pin value
  async readGPIO(pin) {
    return new Promise((resolve, reject) => {
      const gpio = spawn('gpioget', ['gpiochip0', String(pin)]);
      let output = '';
      
      gpio.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      gpio.on('close', (code) => {
        if (code === 0) {
          resolve(parseInt(output.trim()));
        } else {
          reject(new Error(`gpioget failed with code ${code}`));
        }
      });
      
      gpio.on('error', reject);
    });
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
    
    await this.motorController.setMotor('body', CONFIG.BODY_TURN_SPEED);
    
    await this.sleep(CONFIG.BODY_TURN_DURATION);
    
    await this.motorController.stopMotor('body');
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
    
    // Get audio duration
    const duration = await this.audioManager.getAudioDuration(audioFile);
    
    // Start playback
    const playbackPromise = this.audioManager.playAudio(audioFile);
    
    // Animate mouth and tail during speech
    const animationPromise = this.animateSpeech(duration);
    
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
      await this.motorController.setMotor(
        'mouth',
        mouthOpen ? CONFIG.MOUTH_SPEED : -CONFIG.MOUTH_SPEED
      );
      
      // Wag tail
      const tailSpeed = Math.random() > 0.5 ? CONFIG.TAIL_SPEED : -CONFIG.TAIL_SPEED;
      await this.motorController.setMotor('tail', tailSpeed);
      
      // Wait before next movement
      await this.sleep(150 + Math.random() * 100);
    }
    
    // Stop animation
    await this.motorController.stopMotor('mouth');
    await this.motorController.stopMotor('tail');
  }
  
  // Return to idle position
  async returnToIdle() {
    console.log('⏮️  Returning to idle position...');
    
    // Turn back
    await this.motorController.setMotor('body', -CONFIG.BODY_TURN_SPEED);
    await this.sleep(CONFIG.BODY_TURN_DURATION);
    
    // Stop all motors
    await this.motorController.stopAll();
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
    
    await this.motorController.stopAll();
    await this.motorController.close();
    
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
