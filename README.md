# 🐟 Billy Big Mouth Bass - AI Interactive Robot

Transform your Billy Big Mouth Bass into an AI-powered interactive robot that responds to questions with fish puns!

## 📋 What You Need

### Hardware
- ✅ Billy Big Mouth Bass shell (with 3 DC motors: body, mouth, tail)
- ✅ Raspberry Pi (3/4/5 recommended)
- ✅ 4WD Robot Hat for Raspberry Pi (CKK0018)
- ✅ USB External Audio Interface (microphone + speaker)
- ✅ Momentary push button (if not using original)
- ✅ Power supply: 7.4V LiPo battery or 6-12V DC adapter
- ✅ MicroSD card with Raspberry Pi OS (32GB+ recommended)

### Software Requirements
- Node.js 18+ 
- npm (comes with Node.js)
- Raspberry Pi OS (Bookworm or newer)

### API Keys (Required)
- **Anthropic API Key** - For Claude AI responses ([Get one here](https://console.anthropic.com/))
- **OpenAI API Key** - For Whisper speech-to-text ([Get one here](https://platform.openai.com/))

## 🔧 Hardware Setup

### Step 1: Mount the Robot Hat
1. Stack the 4WD Robot Hat onto your Raspberry Pi's 40-pin GPIO header
2. Ensure it's firmly seated and all pins are aligned

### Step 2: Connect Motors
Connect the three Billy Bass motors to the Robot Hat terminal blocks:

```
M1 (Motor 1) → Body Motor (turns fish)
M2 (Motor 2) → Mouth Motor (open/close)
M3 (Motor 3) → Tail Motor (wagging)
```

**Note:** If a motor runs backwards, swap its +/- wires.

### Step 3: Connect the Button
- **Button wire 1** → GPIO 17 (Physical Pin 11)
- **Button wire 2** → Ground (Physical Pin 9)

### Step 4: Connect USB Audio
1. Plug USB audio interface into any USB port on the Pi
2. Connect microphone to the interface's mic input
3. Connect speaker output to Billy Bass's speaker (or use USB audio's built-in speaker)

### Step 5: Power
1. Connect power supply (6-12V) to the Robot Hat's power terminal
2. The Hat will power the Raspberry Pi through GPIO - **do not** use USB power simultaneously

📄 **See [billy-bass-wiring.md](billy-bass-wiring.md) for detailed wiring diagram**

## 💻 Software Installation

### 1. Set Up Raspberry Pi

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required system packages
sudo apt install -y git libasound2-dev sox libsox-fmt-all i2c-tools alsa-utils libgpiod-dev gpiod
```

### 2. Enable I2C

```bash
# Enable I2C interface
sudo raspi-config
# Navigate to: Interface Options → I2C → Enable → Reboot

# After reboot, verify I2C is working
i2cdetect -y 20
# You should see address 0x14 (or similar) for the Robot Hat
```

### 3. Configure USB Audio

```bash
# List audio devices
arecord -l   # Find your USB mic card number
aplay -l     # Find your USB speaker card number

# The code is configured for hw:3,0
# If your device is different, update billy-bass.js:
#   device: 'hw:3,0'  // Change to your card number

# Test microphone with your device
arecord -D hw:3,0 -d 3 test.wav
aplay test.wav
```

### 4. Install Node.js

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 5. Clone and Install Project

```bash
# Create project directory
mkdir ~/billy-bass
cd ~/billy-bass

# Copy project files (billy-bass.js, package.json, etc.)
# Then install dependencies
npm install

# Install additional system dependencies for audio
sudo npm install -g node-gyp
```

### 6. Set Up API Keys

```bash
# Add to your ~/.bashrc or ~/.profile
nano ~/.bashrc

# Add these lines at the end:
export ANTHROPIC_API_KEY="your-anthropic-key-here"
export OPENAI_API_KEY="your-openai-key-here"

# Save and reload
source ~/.bashrc
```

## 🧪 Testing

### Test Motors Individually

Create `test-motors.js`:

```javascript
const i2c = require('i2c-bus');

const bus = i2c.openSync(1);
const address = 0x14;

// Initialize
bus.writeByteSync(address, 0x00, 0x00);

function testMotor(motorNum, duration = 2000) {
  console.log(`Testing Motor ${motorNum + 1}...`);
  
  // Turn on motor (adjust register addresses for your hat)
  const baseReg = 0x20 + (motorNum * 4);
  bus.writeWordSync(address, baseReg, 2000); // Mid speed
  bus.writeByteSync(address, baseReg + 2, 1); // Forward
  
  setTimeout(() => {
    bus.writeWordSync(address, baseReg, 0); // Stop
    console.log('Stopped');
  }, duration);
}

// Test each motor with 3 second delays
testMotor(0); // Body
setTimeout(() => testMotor(1), 4000); // Mouth
setTimeout(() => testMotor(2), 8000); // Tail
setTimeout(() => bus.closeSync(), 12000);
```

Run: `node test-motors.js`

### Test Audio Recording

```bash
# Record 3 seconds
arecord -d 3 -f cd test.wav

# Play back
aplay test.wav
```

### Test Button

```bash
# Monitor GPIO 17
gpio -g mode 17 in
gpio -g read 17  # Should change when button pressed
```

## 🚀 Running Billy Bass

### Start the Program

```bash
cd ~/billy-bass
npm start
```

You should see:
```
🐟 Initializing Billy Bass...
✓ Robot Hat initialized
✓ Button monitoring started
🎣 Billy Bass is ready! Press the button to start.
```

### Using Billy Bass

1. **Press the button** on the fish
2. **Wait** for Billy to turn toward you
3. **Speak** when you hear recording start (you have ~5 seconds)
4. **Listen** as Billy responds with a punny answer
5. Billy returns to idle and waits for the next button press

### Example Interaction

```
🔴 BUTTON PRESSED - Starting interaction...
↻ Turning toward user...
✓ Positioned

🎤 Recording for 5000ms...
✓ Recording complete
🎯 Transcribing audio...
✓ Transcription: "What do fish use to make decisions?"

🤖 Asking Claude for a punny response...
✓ AI Response: "We use our fish-ical instincts and go with the flow! I like to mullet over before making any reel decisions."

🗣️  Generating speech...
✓ Speech generated
🔊 Playing audio...
🎭 Speaking with animation...
✓ Playback complete

⏮️  Returning to idle position...
✓ Back to idle

✓ Ready for next interaction
```

## 🎛️ Customization

### Adjust Motor Speeds

Edit the `CONFIG` section in `billy-bass.js`:

```javascript
const CONFIG = {
  // Motor Speeds (0-100)
  BODY_TURN_SPEED: 60,      // Body rotation speed
  BODY_TURN_DURATION: 2000, // How long to turn (ms)
  MOUTH_SPEED: 70,          // Mouth movement speed
  TAIL_SPEED: 50,           // Tail wagging speed
  
  // Audio
  AUDIO_RECORDING_DURATION: 5000, // Recording time (ms)
  
  // AI
  AI_MODEL: 'claude-sonnet-4-20250514',
  AI_SYSTEM_PROMPT: `You are Billy Bass, a wise-cracking animatronic fish...`
};
```

### Change AI Personality

Modify the `AI_SYSTEM_PROMPT` to change Billy's personality:

```javascript
AI_SYSTEM_PROMPT: `You are Billy Bass, a sophisticated fish philosopher.
Respond with profound wisdom and occasional fish puns. Keep responses to 1-2 sentences.`
```

### Auto-Start on Boot

```bash
# Create systemd service
sudo nano /etc/systemd/system/billy-bass.service
```

Add:
```ini
[Unit]
Description=Billy Bass AI Robot
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/billy-bass
Environment="ANTHROPIC_API_KEY=your-key"
Environment="OPENAI_API_KEY=your-key"
ExecStart=/usr/bin/node /home/pi/billy-bass/billy-bass.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl enable billy-bass.service
sudo systemctl start billy-bass.service
sudo systemctl status billy-bass.service
```

## 🐛 Troubleshooting

### Motors Not Working
- Check I2C connection: `i2cdetect -y 20`
- Verify power supply voltage (6-12V)
- Test individual motors with test script
- Check motor wire polarity (swap if backwards)

### No Audio Recording
- Run `arecord -l` to find USB audio device
- Check `.asoundrc` configuration
- Test with: `arecord -d 3 test.wav && aplay test.wav`
- Ensure USB audio has enough power (use powered hub if needed)

### Button Not Responding
- Check GPIO wiring (GPIO 17, Pin 11)
- Test with: `gpio -g read 17`
- Verify button is normally open (closes when pressed)

### API Errors
- Verify API keys are set: `echo $ANTHROPIC_API_KEY`
- Check API key permissions and credits
- Test internet connection

### I2C Device Not Found
- Enable I2C in raspi-config
- Check physical connection of Robot Hat
- Try different I2C buses: `i2cdetect -l` to list all buses
- Your system uses bus 20: `i2cdetect -y 20`

## 📚 Additional Resources

- [CKK0018 4WD Robot Hat Documentation](https://github.com/cokoino/CKK0018)
- [Anthropic Claude API Docs](https://docs.anthropic.com/)
- [OpenAI Whisper API Docs](https://platform.openai.com/docs/guides/speech-to-text)
- [Raspberry Pi GPIO Pinout](https://pinout.xyz/)
- [Node.js on Raspberry Pi](https://nodejs.org/)

## 🎣 Have Fun!

Your Billy Bass is now an AI-powered interactive robot! Try asking it:
- "What's the meaning of life?"
- "Tell me a joke"
- "What should I eat for dinner?"
- "Why did the fish cross the road?"

Enjoy your fish-tastic conversations! 🐟🤖

## 📝 License

MIT License - Feel free to modify and share!

## 🤝 Contributing

Found a bug or have an improvement? Feel free to submit issues or pull requests!

---

Made with ❤️ and plenty of fish puns
