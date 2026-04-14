# iOS Setup Guide for Anchor Voice

## Current Status ✅

Your project is **already configured for iOS**. The app includes:
- ✅ iOS bundle identifier: `com.anchor.voice`
- ✅ Microphone permissions configured in Info.plist
- ✅ Camera permissions configured in Info.plist
- ✅ EAS Build profiles ready for iOS (development, preview, production)
- ✅ All React Native dependencies support iOS

## Distribution Options for Testers

### Option 1: TestFlight (Recommended for Beta Testers)
**Best for:** Distributing to external testers without App Store listing

**Steps:**
1. **Sign up for Apple Developer Program** ($99/year)
   - https://developer.apple.com/programs/
   
2. **Build iOS app via EAS:**
   ```bash
   cd frontend
   eas build --platform ios --profile preview
   ```
   This generates an `.ipa` file ready for TestFlight
   
3. **Submit to TestFlight via App Store Connect:**
   - Log in to https://appstoreconnect.apple.com/
   - Create new app (fill: name, bundle identifier, SKU)
   - Upload build and add test information
   - Submit for review (usually 1-2 days)
   - Share TestFlight link with testers

4. **Testers install TestFlight app** and redeem invite link

### Option 2: Ad Hoc Distribution (Fast, Local Testing)
**Best for:** Testing on specific devices before TestFlight

**Requirements:**
- Apple Developer account
- Device UDID registration
- Provisioning profile setup

**Steps:**
```bash
cd frontend
eas build --platform ios --profile development
```

### Option 3: Expo Go (Easiest, Development Only)
**Best for:** Quick testing during development

**Steps:**
1. **Testers install Expo Go app** from App Store
2. **You start dev server:**
   ```bash
   cd frontend
   yarn start
   ```
3. **Testers scan QR code** to load your app

⚠️ Note: Not suitable for production testing (requires Internet connection, slower)

---

## One-Time Setup for TestFlight

### 1. Create Apple Team Account
- Sign into https://appstoreconnect.apple.com/
- Accept developer agreement
- Set up Team ID (used in build config)

### 2. Enable Code Signing in EAS
Add to `frontend/eas.json` under iOS sections:
```json
"ios": {
  "distribution": "internal",
  "autoIncrement": true
}
```

### 3. First Build Command
```bash
cd frontend
eas build --platform ios --profile preview --auto-submit
```

EAS handles:
- ✅ Code signing automatically (no certificates needed)
- ✅ Provisioning profiles
- ✅ App ID registration
- ✅ TestFlight submission

---

## Testing on iOS Simulator (No Device Needed)

```bash
cd frontend
eas build --platform ios --profile development
# Download and run locally
```

Or test directly with Expo:
```bash
cd frontend
yarn start
# Press 'i' for iOS simulator
```

---

## Current App Configuration

### Permissions Already Set
- **Microphone**: "Record voice messages for conflict management" 
- **Camera**: "Access media to share recordings"

### Bundle ID
`com.anchor.voice` - used for App Store and TestFlight

### Supported Devices
- ✅ iPhone (all models)
- ✅ iPad (configured with `supportsTablet: true`)
- ✅ iOS 13+ (minimum deployment target)

---

## Comparison: iOS Distribution Methods

| Method | Setup Time | Cost | Tester Access | Best For |
|--------|-----------|------|----------------|----------|
| **TestFlight** | 1-2 hours | $99/yr (dev account) | Email invite | Professional beta testing |
| **Ad Hoc** | 30 min | $99/yr (dev account) | Limited devices | Small team testing |
| **Expo Go** | 5 min | Free | QR code | Development only |

---

## Next Steps

1. **Choose distribution method** (TestFlight recommended)
2. **For TestFlight:** Set up Apple Developer account
3. **Run build:** `eas build --platform ios --profile preview`
4. **Share TestFlight invite link** with testers
5. **Update tester-hub.html** with iOS TestFlight link

---

## Troubleshooting

**"Provisioning profile not found"**
→ EAS should handle this automatically; if not, run: `eas build --platform ios --profile preview --clear-cache`

**"iOS simulator not running"**
→ Install Xcode, then: `open -a Simulator`

**"Build failed with certificate error"**
→ Ensure Apple Developer account is active and code signing enabled in eas.json

---

## Quick Reference

```bash
# Start development
cd frontend && yarn start

# Build for preview testing
eas build --platform ios --profile preview

# Build for simulator testing
eas build --platform ios --profile development

# Check build status
eas build:list
```

