# Mobile Bluetooth Scale Connection Guide

## Overview

The app now seamlessly connects to Bluetooth scales on mobile devices using Web Bluetooth API. It automatically detects and connects to:

- HC-05 Bluetooth Classic modules (via BLE mode)
- HC-06 Bluetooth modules
- BLE (Bluetooth Low Energy) scales
- Generic Bluetooth weight scales

## How It Works on Mobile

### Auto-Detection
The app automatically detects if you're on a mobile device and optimizes the Bluetooth connection process:

1. **On Mobile Devices**: Uses enhanced Web Bluetooth with filters for common scale types
2. **On Desktop**: Keeps Serial Bridge option for classic Bluetooth via USB dongles

### Supported Scale Types

The mobile connection supports scales with these Bluetooth profiles:
- `HC-*` (HC-05, HC-06 modules)
- `BT-*` (Generic Bluetooth scales)
- `Scale*` (Named scales)
- Service UUID `0xFFE0` (Common serial over Bluetooth)
- Service UUID `0xFEE7` (HM-10 modules)
- Service UUID `0x1810` (Bluetooth SIG Weight Scale)
- Service UUID `0x181D` (Weight Measurement)

## Mobile Setup Instructions

### Android (Chrome/Edge)

1. **Enable Bluetooth**: Settings > Bluetooth > ON
2. **Enable Location**: Required for Bluetooth scanning on Android
   - Settings > Location > ON
3. **Open App**: Use Chrome or Edge browser
4. **Connect Scale**:
   - Tap "Connect Bluetooth Scale"
   - Select your scale from the list
   - Grant Bluetooth permission
5. **Done**: Weight readings appear automatically

### iPhone/iPad (Safari/Chrome)

1. **Enable Bluetooth**: Settings > Bluetooth > ON
2. **Use Safari or Chrome**: Web Bluetooth supported on iOS 16+
3. **Open App in HTTPS**: Must be served over HTTPS (Netlify does this automatically)
4. **Connect Scale**:
   - Tap "Connect Bluetooth Scale"
   - Select your scale
   - Grant Bluetooth permission
5. **Done**: Weight readings appear automatically

## Important Notes

### ⚠️ HTTPS Required
- Mobile Web Bluetooth requires HTTPS
- Works automatically when deployed to Netlify
- For local testing, use: `npm run dev -- --host --https`

### ⚠️ Android Location
- Android requires Location permission for Bluetooth scanning
- This is a platform requirement, not app-specific
- No location data is collected or stored

### ⚠️ Scale Pairing
- Most scales don't need pre-pairing in phone settings
- The app will discover unpaired scales automatically
- If scale doesn't appear, try pairing in phone Bluetooth settings first

## Troubleshooting

### Scale Not Found
1. Make sure scale is powered on
2. Bring scale closer to phone (within 1 meter)
3. Turn Bluetooth off/on in phone settings
4. Try pre-pairing in phone Bluetooth settings

### Connection Drops
1. Keep phone near scale during weighing
2. Avoid physical obstacles between phone and scale
3. Close other Bluetooth apps

### Permission Denied
1. Check browser permissions: Settings > Site Settings > Bluetooth
2. Ensure HTTPS connection
3. Try different browser (Chrome recommended)

### iOS Not Working
1. Update to iOS 16 or newer
2. Use Safari or Chrome browser
3. Ensure site is accessed via HTTPS
4. Grant all requested permissions

## Scale Compatibility

### ✅ Confirmed Working
- HC-05 Bluetooth modules in BLE mode
- Most Bluetooth weight scales
- Generic BLE scales
- Arduino-based Bluetooth scales

### ⚠️ May Require Configuration
- HC-05 in Classic mode only (needs Serial Bridge on desktop)
- Proprietary protocols
- Encrypted Bluetooth connections

### ❌ Not Supported
- Scales without any Bluetooth
- Wi-Fi only scales
- Proprietary apps-only scales

## Data Format Support

The app automatically parses these weight formats:
- `10.5 kg`
- `10500 g` (converts to kg)
- `Weight: 10.5`
- `10.5` (plain number)
- Binary formats (auto-detected)

## Desktop vs Mobile

| Feature | Mobile | Desktop |
|---------|--------|---------|
| Web Bluetooth | ✅ Yes | ✅ Yes |
| Serial Bridge | ❌ No | ✅ Yes |
| Classic BT (HC-05) | ⚠️ BLE mode only | ✅ Full support |
| Auto-detection | ✅ Optimized | ✅ Available |
| Offline Mode | ✅ Full support | ✅ Full support |

## Best Practices

1. **Test Connection First**: Always test Bluetooth before field deployment
2. **Keep Charged**: Ensure phone battery is adequate for full day
3. **Stay Close**: Keep phone within 1-2 meters of scale
4. **Manual Backup**: Use manual weight entry if Bluetooth fails
5. **Sync Regularly**: App syncs automatically when online

## Security & Privacy

- All Bluetooth communication stays local (phone ↔ scale)
- No Bluetooth data sent to servers
- Weight data synced to Supabase only when online
- Offline data stored locally in browser IndexedDB
- App works completely offline after first load
