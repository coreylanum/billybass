# Billy Big Mouth Bass - Wiring Diagram

## Component Overview

### Hardware Components:
- Raspberry Pi (any model with 40-pin GPIO)
- 4WD Robot Hat (CKK0018) with DRV8833 motor drivers
- Billy Big Mouth Bass shell with 3 DC motors
- USB Audio Interface
- Momentary push button (if not using original fish button)
- 7.4V LiPo battery or 6-12V DC power supply

## Wiring Connections

### 1. 4WD Robot Hat Connection
```
┌─────────────────────────────────────┐
│      Raspberry Pi (Top View)        │
│                                     │
│  [40-pin GPIO Header]               │
└──────────────┬──────────────────────┘
               │
               │ (Stacks directly on GPIO)
               ▼
┌─────────────────────────────────────┐
│       4WD Robot Hat (CKK0018)       │
│                                     │
│  • DRV8833 Motor Drivers (GPIO)     │
│  • Motor Outputs: M1, M2, M3, M4    │
│  • Power Input: 6-12V DC            │
└─────────────────────────────────────┘
```

**Important:** This hat uses GPIO control, NOT I2C!

### GPIO Pin Mapping for Motors:

**DRV8833 #1 (GPIO 12 PWM/Enable):**
- Motor A1 (Body): GPIO 17 & 27 (direction)
- Motor B1 (Mouth): GPIO 22 & 23 (direction)

**DRV8833 #2 (GPIO 13 PWM/Enable):**
- Motor A2 (Tail): GPIO 24 & 25 (direction)
- Motor B2 (Unused): GPIO 26 & 16 (direction)

### 2. DC Motor Connections to Robot Hat

**Motor Terminal Blocks on 4WD Robot Hat:**

```
Motor 1 (M1) - BODY MOTOR (rotation/turning)
├─ M1+ → Billy Bass Body Motor Wire 1 (Red)
└─ M1- → Billy Bass Body Motor Wire 2 (Black)

Motor 2 (M2) - MOUTH MOTOR
├─ M2+ → Billy Bass Mouth Motor Wire 1 (Red)
└─ M2- → Billy Bass Mouth Motor Wire 2 (Black)

Motor 3 (M3) - TAIL MOTOR
├─ M3+ → Billy Bass Tail Motor Wire 1 (Red)
└─ M3- → Billy Bass Tail Motor Wire 2 (Black)

Motor 4 (M4) - UNUSED (available for expansion)
```

**Note:** The Billy Bass typically uses small 3-6V DC motors. If motors run in wrong direction, swap the +/- wires.

### 3. Button Connection

**Option A: Using Original Billy Bass Button**
```
Original Button → Desolder from original circuit
├─ Button Terminal 1 → GPIO 17 (Pin 11)
└─ Button Terminal 2 → Ground (Pin 9)
```

**Option B: External Button (if original not usable)**
```
┌────────────────────────────────────┐
│                                    │
│  GPIO 17 (Pin 11) ─────┐          │
│                        │          │
│                    ┌───┴───┐      │
│                    │ Button│      │
│                    └───┬───┘      │
│                        │          │
│  Ground (Pin 9) ───────┘          │
│                                    │
└────────────────────────────────────┘
```

The script uses internal pull-up resistor, so no external resistor needed.

### 4. USB Audio Interface

```
Raspberry Pi USB Port → USB Audio Interface
                        ├─ Microphone Input (for listening)
                        └─ Speaker Output (to Billy Bass speaker)
```

**Speaker Connection:**
- Remove original Billy Bass speaker wires from PCB
- Connect to USB Audio Interface 3.5mm output
- Or use USB audio's built-in speaker output

### 5. Power Supply

```
┌──────────────────────────────────────┐
│                                      │
│  Power Supply (7.4V LiPo or 6-12V)  │
│           ├─ (+) Positive            │
│           └─ (-) Negative            │
└───────────┬──────────────────────────┘
            │
            ▼
    ┌───────────────────┐
    │  4WD Robot Hat    │
    │  Power Terminal   │
    │  ├─ VIN (+)       │
    │  └─ GND (-)       │
    └───────────────────┘
```

**Important:** The Robot Hat will power the Raspberry Pi through the GPIO header. Do NOT connect separate USB power to the Pi when using the Robot Hat's power input.

## Complete Wiring Diagram (ASCII)

```
                        ┌─────────────────────┐
                        │   Power Supply      │
                        │   (7.4V / 6-12V)    │
                        └──────┬──────────────┘
                               │
                   ┌───────────▼────────────┐
                   │   4WD Robot Hat        │
                   │   (CKK0018)            │
                   │                        │
    Button ────────┤ GPIO17  M1  M2  M3  M4 │
    (Pin 11)       │         │   │   │   │  │
                   └─────────┼───┼───┼───┼──┘
                             │   │   │   │
                   ┌─────────▼───▼───▼───▼──┐
                   │  Raspberry Pi           │
                   │  ┌──────────────────┐   │
                   │  │  40-Pin GPIO     │   │
                   └──┴──────────────────┴───┘
                      │
                      ├─ USB Port → USB Audio Interface
                      │              ├─ Mic In
                      │              └─ Speaker Out → Billy Bass Speaker
                      │
                      └─ (No separate power needed)

    Motor Connections:
    
    Body Motor  ←───── M1 (Turns fish toward user)
    Mouth Motor ←───── M2 (Mouth animation)
    Tail Motor  ←───── M3 (Tail wagging)
```

## Pin Reference Table

| Component | Connection | Pin # | GPIO | Notes |
|-----------|-----------|-------|------|-------|
| Button | GPIO Input | 11 | GPIO17 | Internal pull-up enabled |
| Ground | Button GND | 9 | GND | Common ground |
| 4WD Hat | I2C SDA | 3 | GPIO2 | Auto-configured |
| 4WD Hat | I2C SCL | 5 | GPIO3 | Auto-configured |
| Body Motor | Motor 1 | Hat M1 | - | Via Robot Hat |
| Mouth Motor | Motor 2 | Hat M2 | - | Via Robot Hat |
| Tail Motor | Motor 3 | Hat M3 | - | Via Robot Hat |
| USB Audio | USB Port | - | - | Auto-detected as audio device |

## Setup Notes

1. **Motor Control**: Uses GPIO pins directly with DRV8833 motor drivers (not I2C!)
2. **GPIO Tools**: Uses `gpiod` command-line tools (gpioget, gpioset) for GPIO access
3. **Audio Device**: Hard-coded to hw:3,0 - adjust in code if your device differs
4. **Text-to-Speech**: OpenAI TTS API with selectable voices (onyx, alloy, echo, fable, nova, shimmer)
5. **Motor Speeds**: Currently full speed (PWM pins held HIGH). For variable speed, hardware PWM needed
6. **Button**: GPIO 17 with internal pull-up (active-low)
7. **Power**: Ensure power supply can handle motor current draw (typically 1-2A total)

## Safety Considerations

- **Motor Direction**: Test each motor individually before full assembly
- **Power Rating**: Don't exceed 12V on Robot Hat input
- **Current Limit**: Each motor output rated for ~2A continuous
- **Heat**: Motors may get warm during extended use
- **Speaker Volume**: Set appropriate volume to avoid speaker damage

## Testing Sequence

1. Test button GPIO reading first (without motors)
2. Test each motor individually (body, mouth, tail)
3. Test audio recording with USB mic
4. Test audio playback through speaker
5. Test complete sequence with all components
