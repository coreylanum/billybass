// test-motor-addresses.js - Find the correct motor controller address

const i2c = require('i2c-bus');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Addresses to test (excluding EEPROMs at 0x50-0x54)
const testAddresses = [0x30, 0x37, 0x3a, 0x49, 0x59];

async function testMotorControl(bus, address) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Testing address 0x${address.toString(16).toUpperCase()}`);
  console.log('='.repeat(50));
  
  try {
    // Try common motor controller initialization sequences
    
    // Option 1: PCA9685-style PWM controller
    console.log('\nTrying PCA9685-style commands...');
    try {
      bus.writeByteSync(address, 0x00, 0x00); // MODE1 register
      bus.writeByteSync(address, 0xFE, 0x79); // PRE_SCALE register
      console.log('✓ Initialization commands accepted');
    } catch (e) {
      console.log('✗ Initialization failed:', e.message);
    }
    
    // Try to set motor 1 to medium speed
    console.log('\nTrying to activate Motor 1...');
    try {
      // Different register layouts to try
      const attempts = [
        { name: 'Standard PWM (reg 0x06)', reg: 0x06, value: 2000 },
        { name: 'Motor control (reg 0x20)', reg: 0x20, value: 2000 },
        { name: 'Direct byte (reg 0x01)', reg: 0x01, value: 128 },
      ];
      
      for (const attempt of attempts) {
        try {
          if (attempt.value > 255) {
            bus.writeWordSync(address, attempt.reg, attempt.value);
          } else {
            bus.writeByteSync(address, attempt.reg, attempt.value);
          }
          console.log(`  Sent: ${attempt.name}`);
          await sleep(1000);
          
          const answer = await prompt('  Did you see/hear motor movement? (y/n): ');
          
          if (answer.toLowerCase() === 'y') {
            console.log(`\n✅ FOUND IT! Address 0x${address.toString(16).toUpperCase()} controls the motors!`);
            console.log(`   Register used: ${attempt.name}`);
            
            // Stop the motor
            try {
              if (attempt.value > 255) {
                bus.writeWordSync(address, attempt.reg, 0);
              } else {
                bus.writeByteSync(address, attempt.reg, 0);
              }
            } catch (e) {
              // Ignore stop errors
            }
            
            return true;
          }
          
          // Stop attempt
          try {
            if (attempt.value > 255) {
              bus.writeWordSync(address, attempt.reg, 0);
            } else {
              bus.writeByteSync(address, attempt.reg, 0);
            }
          } catch (e) {
            // Ignore
          }
          
        } catch (e) {
          console.log(`  ✗ ${attempt.name} failed:`, e.message);
        }
      }
      
    } catch (e) {
      console.log('✗ Motor control failed:', e.message);
    }
    
    return false;
    
  } catch (error) {
    console.log('✗ Error testing address:', error.message);
    return false;
  }
}

async function main() {
  console.log('🔍 Motor Controller Address Finder');
  console.log('==================================\n');
  console.log('This script will try to activate Motor 1 on each I2C address.');
  console.log('Watch for movement and listen for motor sounds.\n');
  
  await prompt('Press Enter to start testing...');
  
  const bus = i2c.openSync(20);
  
  for (const address of testAddresses) {
    const found = await testMotorControl(bus, address);
    
    if (found) {
      console.log('\n' + '='.repeat(50));
      console.log(`Update your billy-bass.js with:`);
      console.log(`  I2C_ADDRESS: 0x${address.toString(16).toUpperCase()},`);
      console.log('='.repeat(50));
      bus.closeSync();
      rl.close();
      return;
    }
    
    await sleep(500);
  }
  
  console.log('\n❌ Motor controller not found at any tested address.');
  console.log('This could mean:');
  console.log('  1. The motor controller uses a different protocol');
  console.log('  2. It needs a specific initialization sequence');
  console.log('  3. Power is not connected to the motors');
  console.log('\nTry checking the CKK0018 documentation or example code.');
  
  bus.closeSync();
  rl.close();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
