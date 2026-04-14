# Web Build Deployment Guide

Your Anchor Voice web build is ready! Here's how to deploy it.

---

## Quick Deploy Options

### Option 1: Vercel (Recommended - 2 minutes)

**Sign up:** https://vercel.com (free tier)

**Deploy:**
1. Go to https://vercel.com/new
2. Connect your GitHub repo
3. Vercel auto-detects the build
4. Click "Deploy"
5. Get live URL instantly

**Result:** `https://anchor-voice-YOUR-NAME.vercel.app`

---

### Option 2: Netlify (Also Free - 3 minutes)

**Sign up:** https://netlify.com

**Deploy:**
1. Drag & drop `web-build/` folder to https://app.netlify.com
2. Done! Get instant URL

**Result:** `https://random-url-123.netlify.app`

---

### Option 3: GitHub Pages (5 minutes)

**Requires:** GitHub repo (you have this)

**Steps:**
```bash
# In root directory
cd web-build
git add .
git commit -m "chore: add web build"
git push
```

Then go to repo Settings → Pages → Deploy from main branch

**Result:** `https://USERNAME.github.io/Anchor-voice`

---

## What You Get

Once deployed:
- ✅ Users scan QR code → opens in browser instantly
- ✅ No app download needed
- ✅ Works on iPhone, Android, desktop
- ✅ Same code everywhere
- ✅ All features work (audio, tone analysis, etc)

---

## Next: Generate Web QR Code

Once you have your URL (e.g., `https://anchor-voice.vercel.app`), generate a QR code:

```bash
python3 << 'EOF'
import qrcode
qr = qrcode.QRCode(version=1, box_size=10, border=2)
qr.add_data("https://anchor-voice.vercel.app")  # Replace with your URL
qr.make(fit=True)
qr.make_image().save("qr-web.png")
print("✅ Created qr-web.png")
EOF
```

---

## Recommended Setup

1. **Deploy to Vercel** (simplest, free)
2. **Generate web QR code** pointing to live URL
3. **Update tester-hub.html** with web option (primary)
4. **Keep Expo option** as alternative (for developers)

**New tester flow:**
- Scan web QR → browser opens → app works instantly
- Zero friction, maximum accessibility

---

## Testing Locally

Before deploying, test locally:

```bash
cd web-build
npx http-server
# Opens http://localhost:8080
```

Test on your phone:
1. Phone on same WiFi as computer
2. Go to `http://[YOUR_IP]:8080` on phone
3. Should work perfectly

---

## Deployment Checklist

- [ ] Sign up for Vercel/Netlify
- [ ] Deploy web-build folder
- [ ] Get live URL
- [ ] Test on phone browser
- [ ] Generate QR code for URL
- [ ] Update tester-hub.html
- [ ] Start recruiting!

