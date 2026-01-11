# 🐟 Billy Bass - Quick Start Guide

## 1. Hardware Setup (10 minutes)

### Connect Components:
```
Power Supply (6-12V) → Robot Hat Power Terminal
Robot Hat → Stack on Raspberry Pi GPIO
Button → GPIO 17 (Pin 11) + Ground (Pin 9)
Body Motor → M1 on Robot Hat
Mouth Motor → M2 on Robot Hat
Tail Motor → M3 on Robot Hat
USB Audio → Any USB port on Pi
Microphone → USB Audio mic input
Speaker → USB Audio speaker output (or Billy's original speaker)
```

**⚠️ Important:** Do NOT connect USB power to Pi when using Robot Hat power!

## 2. Software Setup (20 minutes)

### Enable I2C:
```bash
sudo raspi-config
# Interface Options → I2C → Enable → Reboot
```

### Install Dependencies:
```bash
# System packages
sudo apt update
sudo apt install -y git libasound2-dev sox libsox-fmt-all alsa-utils gpiod mpg123 ffmpeg

# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Project dependencies
cd ~/billy-bass
npm install
```

### Configure Audio:
```bash
# Find your USB audio card numbers
arecord -l  # Note the card number for microphone
aplay -l    # Note the card number for speaker

# The code uses hw:3,0 by default
# If different, edit billy-bass.js and change:
#   device: 'hw:3,0'

# Test it
arecord -D hw:3,0 -d 3 test.wav && aplay test.wav
```

### Set API Keys:
```bash
# Add to ~/.bashrc
echo 'export ANTHROPIC_API_KEY="your-anthropic-key-here"' >> ~/.bashrc
echo 'export OPENAI_API_KEY="your-openai-key-here"' >> ~/.bashrc
source ~/.bashrc
```

Get your API keys:
- Anthropic: https://console.anthropic.com/
- OpenAI: https://platform.openai.com/

## 3. Test Components (5 minutes)

Run the test suite:
```bash
node test-components.js
```

Test each component:
1. Button (press 3 times)
2. Audio Recording (speak and hear playback)
3. API Keys (verify both are set)

**Note:** Motor testing requires running the main program or manual GPIO testing.

## 4. Run Billy Bass! 🎣

```bash
npm start
```

Expected output:
```
🐟 Initializing Billy Bass...
✓ Robot Hat initialized
✓ Button monitoring started
🎣 Billy Bass is ready! Press the button to start.
```

### Usage:
1. **Press button** → Fish turns toward you
2. **Speak** → Ask a question (5 seconds)
3. **Listen** → Billy responds with fish puns!
4. **Repeat** → Press button again

## 5. Troubleshooting

### No motor movement?
```bash
# Check GPIO tools are installed
which gpioset gpioget

# Test manually setting a GPIO
gpioset gpiochip0 17=1

# Verify power supply (6-12V to Robot Hat)
```

### Button not working?
```bash
# Test GPIO
gpio -g mode 17 in
gpio -g read 17  # Changes when pressed
```

### No audio?
```bash
# List devices
arecord -l
aplay -l

# Test recording
arecord -d 3 test.wav
aplay test.wav
```

### Motor runs backwards?
Swap the +/- wires on that motor's terminal.

### API errors?
```bash
# Verify keys are set
echo $ANTHROPIC_API_KEY
echo $OPENAI_API_KEY

# Check internet connection
ping google.com
```

## 6. Customization

Edit `billy-bass.js` CONFIG section:

```javascript
const CONFIG = {
  // Speed adjustments (0-100)
  BODY_TURN_SPEED: 60,      // Rotation speed
  MOUTH_SPEED: 70,          // Mouth animation
  TAIL_SPEED: 50,           // Tail wagging
  
  // Timing
  BODY_TURN_DURATION: 2000, // Turn time (ms)
  AUDIO_RECORDING_DURATION: 5000, // Listen time (ms)
  
  // Text-to-Speech Voice
  TTS_VOICE: 'onyx', // Options: alloy, echo, fable, onyx, nova, shimmer
  TTS_MODEL: 'tts-1', // or 'tts-1-hd' for better quality
  
  // AI personality
  AI_SYSTEM_PROMPT: `You are Billy Bass...`
};
```

**TTS Voice Options:**
- `alloy` - Neutral, balanced
- `echo` - Warm, upbeat
- `fable` - British, expressive
- `onyx` - Deep, authoritative (default)
- `nova` - Energetic, youthful
- `shimmer` - Soft, gentle

## 7. Auto-Start on Boot (Optional)

```bash
sudo nano /etc/systemd/system/billy-bass.service
```

Add:
```ini
[Unit]
Description=Billy Bass
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/billy-bass
Environment="ANTHROPIC_API_KEY=your-key"
Environment="OPENAI_API_KEY=your-key"
ExecStart=/usr/bin/node /home/pi/billy-bass/billy-bass.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl enable billy-bass
sudo systemctl start billy-bass
```

## Files Overview

- `billy-bass.js` - Main program
- `test-components.js` - Hardware testing
- `package.json` - Dependencies
- `README.md` - Full documentation
- `billy-bass-wiring.md` - Detailed wiring
- `wiring-diagram.svg` - Visual diagram

## Need Help?

Check the full README.md for detailed information on:
- Complete wiring diagrams
- API documentation
- Motor configuration
- Audio setup
- Troubleshooting

## Example Questions to Ask Billy:

- "What's the meaning of life?"
- "Tell me a joke"
- "What should I eat for dinner?"
- "Do you like fishing?"
- "What's your favorite movie?"

Have fun with your AI-powered talking fish! 🐟🤖
