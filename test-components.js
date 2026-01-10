// test-components.js - Test individual components before running full program

const readline = require('readline');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Test I2C and Robot Hat
// ============================================================================
async function testI2C() {
  log(colors.cyan, '\n=== Testing I2C Connection ===');
  
  try {
    const i2c = require('i2c-bus');
    const bus = i2c.openSync(20);
    
    log(colors.green, '✓ I2C bus opened successfully');
    
    // Scan for devices
    log(colors.yellow, '\nScanning I2C bus for devices...');
    let deviceFound = false;
    
    for (let addr = 0x03; addr <= 0x77; addr++) {
      try {
        bus.readByteSync(addr, 0);
        log(colors.green, `✓ Found device at address 0x${addr.toString(16)}`);
        deviceFound = true;
      } catch (e) {
        // Device not found at this address
      }
    }
    
    if (!deviceFound) {
      log(colors.red, '✗ No I2C devices found!');
      log(colors.yellow, '  Check that Robot Hat is properly connected');
      log(colors.yellow, '  Run: i2cdetect -y 1');
    }
    
    bus.closeSync();
    
  } catch (error) {
    log(colors.red, '✗ I2C Error: ' + error.message);
    log(colors.yellow, '  Make sure I2C is enabled: sudo raspi-config');
    log(colors.yellow, '  Interface Options → I2C → Enable');
  }
}

// ============================================================================
// Test GPIO Button
// ============================================================================
async function testButton() {
  log(colors.cyan, '\n=== Testing Button (GPIO 17) ===');
  
  try {
    const { Chip } = require('node-libgpiod');
    const chip = new Chip(0);
    const button = chip.getLine(17);
    button.requestInputMode();
    
    log(colors.green, '✓ GPIO initialized');
    log(colors.yellow, '\nPress the button 3 times (you have 10 seconds)...');
    
    let pressCount = 0;
    let lastValue = 1; // Start assuming button not pressed (pull-up)
    const target = 3;
    const startTime = Date.now();
    
    while (Date.now() - startTime < 10000 && pressCount < target) {
      const value = button.getValue();
      
      // Detect falling edge (button press with pull-up resistor)
      if (value === 0 && lastValue === 1) {
        pressCount++;
        log(colors.green, `✓ Button press detected! (${pressCount}/${target})`);
        await sleep(200); // Debounce
      }
      
      lastValue = value;
      await sleep(50); // Poll interval
    }
    
    button.release();
    chip.close();
    
    if (pressCount >= target) {
      log(colors.green, '✓ Button test passed!');
    } else {
      log(colors.red, '✗ Button test failed - not enough presses detected');
      log(colors.yellow, '  Check button wiring to GPIO 17 (Pin 11)');
    }
    
  } catch (error) {
    log(colors.red, '✗ Button test error: ' + error.message);
  }
}

// ============================================================================
// Test Motors
// ============================================================================
async function testMotors() {
  log(colors.cyan, '\n=== Testing Motors ===');
  
  try {
    const i2c = require('i2c-bus');
    const bus = i2c.openSync(20);
    const address = 0x14;
    
    log(colors.green, '✓ Connected to Robot Hat');
    
    // Initialize
    bus.writeByteSync(address, 0x00, 0x00);
    log(colors.green, '✓ Motor controller initialized');
    
    const motors = ['Body (M1)', 'Mouth (M2)', 'Tail (M3)'];
    
    for (let i = 0; i < 3; i++) {
      log(colors.yellow, `\nTesting ${motors[i]}...`);
      log(colors.yellow, 'Motor should run for 2 seconds');
      
      // Register addresses (adjust if needed for your specific hat)
      const baseReg = 0x20 + (i * 4);
      
      // Forward
      bus.writeWordSync(address, baseReg, 2000); // Medium speed
      bus.writeByteSync(address, baseReg + 2, 1); // Forward direction
      
      await sleep(2000);
      
      // Stop
      bus.writeWordSync(address, baseReg, 0);
      
      const answer = await prompt(`Did motor ${i + 1} move? (y/n): `);
      
      if (answer.toLowerCase() === 'y') {
        log(colors.green, `✓ Motor ${i + 1} working!`);
      } else {
        log(colors.red, `✗ Motor ${i + 1} not working`);
        log(colors.yellow, `  Check M${i + 1} connections on Robot Hat`);
        log(colors.yellow, `  Verify motor wires are not reversed`);
      }
      
      await sleep(1000);
    }
    
    bus.closeSync();
    
  } catch (error) {
    log(colors.red, '✗ Motor test error: ' + error.message);
    log(colors.yellow, '  Make sure Robot Hat is powered');
    log(colors.yellow, '  Check I2C connection');
  }
}

// ============================================================================
// Test Audio Recording
// ============================================================================
async function testAudioRecording() {
  log(colors.cyan, '\n=== Testing Audio Recording ===');
  
  try {
    const { spawn } = require('child_process');
    const fs = require('fs');
    const testFile = '/tmp/test_recording.wav';
    
    log(colors.yellow, 'Recording 3 seconds of audio...');
    log(colors.yellow, 'Say something into the microphone!');
    
    const record = spawn('arecord', ['-D', 'hw:3,0', '-d', '3', '-f', 'cd', testFile]);
    
    await new Promise((resolve, reject) => {
      record.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Recording failed with code ${code}`));
        }
      });
    });
    
    if (fs.existsSync(testFile)) {
      const stats = fs.statSync(testFile);
      if (stats.size > 1000) {
        log(colors.green, '✓ Recording successful!');
        
        log(colors.yellow, '\nPlaying back recording...');
        const play = spawn('aplay', ['-q', testFile]);
        
        await new Promise((resolve) => {
          play.on('close', () => resolve());
        });
        
        const answer = await prompt('Did you hear the playback? (y/n): ');
        
        if (answer.toLowerCase() === 'y') {
          log(colors.green, '✓ Audio recording and playback working!');
        } else {
          log(colors.red, '✗ Playback issue detected');
          log(colors.yellow, '  Check speaker connection');
          log(colors.yellow, '  Run: aplay -l');
        }
        
        fs.unlinkSync(testFile);
      } else {
        log(colors.red, '✗ Recording file too small');
        log(colors.yellow, '  Check microphone connection');
      }
    }
    
  } catch (error) {
    log(colors.red, '✗ Audio test error: ' + error.message);
    log(colors.yellow, '  Make sure USB audio interface is connected');
    log(colors.yellow, '  Run: arecord -l');
    log(colors.yellow, '  Check ~/.asoundrc configuration');
  }
}

// ============================================================================
// Test API Keys
// ============================================================================
async function testAPIKeys() {
  log(colors.cyan, '\n=== Testing API Keys ===');
  
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (anthropicKey && anthropicKey.length > 20) {
    log(colors.green, '✓ ANTHROPIC_API_KEY is set');
  } else {
    log(colors.red, '✗ ANTHROPIC_API_KEY not found or invalid');
    log(colors.yellow, '  Set with: export ANTHROPIC_API_KEY=your_key');
  }
  
  if (openaiKey && openaiKey.length > 20) {
    log(colors.green, '✓ OPENAI_API_KEY is set');
  } else {
    log(colors.red, '✗ OPENAI_API_KEY not found or invalid');
    log(colors.yellow, '  Set with: export OPENAI_API_KEY=your_key');
  }
  
  if (anthropicKey && openaiKey) {
    log(colors.green, '\n✓ Both API keys configured!');
  } else {
    log(colors.yellow, '\nAdd keys to ~/.bashrc to make them permanent');
  }
}

// ============================================================================
// Main Test Menu
// ============================================================================
async function main() {
  console.clear();
  log(colors.cyan, '╔════════════════════════════════════════════╗');
  log(colors.cyan, '║   Billy Bass Component Testing Suite      ║');
  log(colors.cyan, '╚════════════════════════════════════════════╝');
  
  while (true) {
    console.log('\nSelect a test:');
    console.log('1. Test I2C Connection');
    console.log('2. Test Button (GPIO)');
    console.log('3. Test Motors');
    console.log('4. Test Audio Recording');
    console.log('5. Test API Keys');
    console.log('6. Run All Tests');
    console.log('0. Exit');
    
    const choice = await prompt('\nEnter choice (0-6): ');
    
    switch(choice) {
      case '1':
        await testI2C();
        break;
      case '2':
        await testButton();
        break;
      case '3':
        await testMotors();
        break;
      case '4':
        await testAudioRecording();
        break;
      case '5':
        await testAPIKeys();
        break;
      case '6':
        await testI2C();
        await testButton();
        await testMotors();
        await testAudioRecording();
        await testAPIKeys();
        log(colors.cyan, '\n=== All Tests Complete ===');
        break;
      case '0':
        log(colors.green, '\nGoodbye! 🐟');
        process.exit(0);
      default:
        log(colors.red, 'Invalid choice');
    }
    
    await prompt('\nPress Enter to continue...');
  }
}

// Run the test suite
main().catch(error => {
  log(colors.red, 'Fatal error: ' + error.message);
  process.exit(1);
});
