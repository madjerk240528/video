# 📸 Living Photo Memory - Augmented Reality & Video Experience

An open-source, zero-dependency WebAR website that turns any physical printed photograph into a "living photo" (Harry Potter moving picture style).

When someone scans the photo with their phone camera, **Google Photos**, or **Google Lens**, it opens your permanent GitHub link and brings the photo to life with video and sound!

---

## 🌟 How It Works

```
[Physical Photo with Discreet QR] 
             │
             ▼ (Scan using Google Photos, Google Lens, or Phone Camera)
[Permanent GitHub Pages Link: https://username.github.io/memory/]
             │
             ├─► ✨ Magic AR Mode: Point camera at the photo -> Video plays locked in 3D perspective over the photo!
             └─► ▶ Direct Cinema Mode: Tap to watch the full video with sound on phone screen.
```

1. **The Entry Point (Google Photos & Camera Scan)**:
   Google Photos / Google Lens looks for optical data. Placing a subtle QR code in the corner, polaroid border, or back of the physical photo lets Google Photos or any smartphone camera instantly recognize the link and open it in the browser.
2. **The WebAR Engine (MindAR.js)**:
   Runs 100% in mobile Safari (iOS) and Chrome (Android) without requiring any app download. It detects the photograph using computer vision and renders the video right over the photo in augmented reality.

---

## 🚀 Quick Setup: Deploy to GitHub Pages (Permanent Free Link)

### Step 1: Create a GitHub Repository
1. Go to [GitHub.com/new](https://github.com/new) and log in.
2. Name your repository (for example: `living-photo` or `ar-memory`).
3. Set it to **Public** and click **Create repository**.

### Step 2: Upload Files
Upload all files from this folder to your new GitHub repository:
- `index.html` (Creator & Viewer App)
- `scan.html` (Dedicated Fast Mobile Scanner)
- `scan.js`
- `studio.html` (Print Studio with QR Code Generator)
- `cloud-storage.js` (Google Drive & Cloud Video Resolver)
- `style.css`
- `app.js`
- `sw.js` & `manifest.json` (PWA Offline / Installable App)
- `photo.jpg` *(sample photograph)*
- `video.mp4` *(sample video clip)*
- `targets.mind` *(sample AR tracking file)*

---

## ☁️ Using Google Drive for Your Videos (Permanent Free Hosting!)

You do **NOT** have to commit large video files to GitHub or worry about your videos being erased:
1. Upload your video clip to **Google Drive**.
2. Right-click the video → **Share** → set to **"Anyone with the link can view"**.
3. Copy the link (e.g., `https://drive.google.com/file/d/1AbC.../view?usp=sharing`).
4. In **`studio.html`** or **`index.html`**, paste that link into the **Google Drive / Cloud Video URL** box!
5. Our system automatically converts it into a direct high-speed video stream and encodes it directly into your printable QR code!
6. When someone scans your printed photo with their phone camera, Google Photos, or Google Lens, **your Google Drive video streams and plays locked in 3D AR right on top of the physical photo**!

### Step 3: Enable GitHub Pages
1. In your repository on GitHub, go to **Settings** (top tab).
2. Click **Pages** in the left sidebar.
3. Under **Build and deployment** → **Branch**:
   - Select `main` (or `master`).
   - Select `/ (root)`.
   - Click **Save**.
4. In about 60 seconds, GitHub will give you your **Permanent HTTPS Link**:
   ```
   https://<your-username>.github.io/<repository-name>/
   ```

---

## 🎨 How to Use Your Own Photo & Video

### 1. Prepare Your Media Files
- Rename your photo to `photo.jpg`.
- Rename your video to `video.mp4` (standard H.264 MP4 recommended for 100% iOS & Android compatibility).

### 2. Generate `targets.mind` (AR Tracking Map)
MindAR requires an index of tracking points so your phone camera can lock onto your photo at 60 FPS:
- **Option A (Built-in Studio)**: Open `studio.html` in your browser. Drag and drop your `photo.jpg`, click **Compile targets.mind**, then download the generated file!
- **Option B (Official Online Tool)**: Visit [MindAR Web Compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile), drop your photo, and click **Compile** to download `targets.mind`.

Replace the `targets.mind` in your repo with your newly compiled file.

---

## 🖨️ Creating Your Printable Photo

Open `studio.html` in your browser:
1. Paste your permanent GitHub Pages URL.
2. Pick your layout:
   - **Full Photo + Subtle Corner QR**: Clean look with a small QR code in the bottom-right corner.
   - **Classic Polaroid**: Authentic retro white border with your custom caption and QR code.
3. Click **🖨️ Print / Save as PDF** to print onto photo paper (4x6", 5x7", or standard letter).

---

## 📱 Mobile Compatibility (iOS Safari & Android Chrome)

This web application is specially optimized for smartphones:
- **No App Store download required**: Runs completely inside mobile Safari and Chrome.
- **HTTPS Automatic**: GitHub Pages serves over HTTPS/SSL by default, which is mandatory for mobile cameras to function.
- **Audio Autoplay Fix**: Mobile browsers block autoplaying video sound until tapped. We have integrated pre-warming and a tap-to-unmute pill so sound starts immediately upon user touch.
- **In-App Browser Support**: If scanned through Google Photos, Google Lens, or social apps (Instagram, TikTok), the app detects the embedded webview and offers seamless switching or direct video playback.

---

## 📱 How to Scan & View

1. **Using Google Photos**: Open any saved photo of the print in Google Photos, tap **Lens** at the bottom, and tap the link that appears.
2. **Using Google Lens / Android Camera**: Open Google Lens or your standard camera app, point it at the QR code, and tap the link.
3. **Using iPhone / iPad**: Open the native Camera app, point at the QR code, and tap the yellow link banner.
4. **Once the website opens**:
   - Tap **"Point Camera & Scan in AR"** and allow camera permission.
   - Aim your phone at the physical photo.
   - Watch the picture magically come to life with video and sound!

---

## 💡 Pro Tips for Best AR Tracking
- **Contrast & Texture**: Photos with rich details, clear edges, and distinct patterns track much better than plain or blurry backgrounds.
- **Good Lighting**: Ensure the physical photo is well-lit without heavy glossy glare.
- **Audio Autoplay**: Modern mobile browsers (iOS Safari and Android Chrome) require a user gesture to play audio. The "Start AR" button and sound toggle button handle this smoothly.
