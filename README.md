# 🚀 Network Sharer

A fast, lightweight, and modern web application for sharing photos, videos, files, and text notes between an iPhone (or any mobile device) and a PC over local Wi-Fi — with zero App Store installations required.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)

---

## ✨ Features

- **📱 WhatsApp / Instagram Style Mobile UX**:
  - Sticky bottom media action dock for Photo Library, Camera direct capture, and Files app selection.
  - Pre-upload attachment tray carousel with photo removal overlays, item counter, and optional captions.
  - Optimistic upload feedback with circular loading progress indicators (`0% -> 100%`).
- **⚡ Instant QR Code Pairing**:
  - Automatically detects local network IP address (`http://192.168.x.x:3000`).
  - Generates scannable ANSI QR code in the terminal and on the web interface — open iPhone Camera app, point & tap to connect instantly in Safari.
- **🔄 Real-time Live Synchronization**:
  - Server-Sent Events (SSE) automatically update the PC desktop feed when photos or files are sent from iPhone without requiring page refreshes.
- **💻 Desktop Drag & Drop**:
  - Drop files anywhere on the PC browser window for instant uploading to connected devices.
- **🖼️ Media Preview & Gallery**:
  - Grid view for photos, videos, files, and text notes.
  - Click-to-expand full screen Lightbox viewer for images and inline video playback.
  - One-click copy for notes and instant file downloads.
- **🎨 Glassmorphism Dark Mode**:
  - Premium dark UI using HSL color palette, `Plus Jakarta Sans` typography, and smooth iOS touch interactions.

---

## 📁 Project Structure

```text
network-sharer/
├── server.js              # Express server + Local IP detection + QR code + API & SSE
├── package.json           # Project configuration and dependencies
├── public/
│   ├── index.html         # Responsive mobile & desktop HTML5 interface
│   ├── style.css          # Glassmorphism dark mode CSS design system
│   └── app.js             # Client JS (Composer tray, progress upload, SSE live sync)
├── uploads/               # Directory where shared files are stored
└── test/
    └── server.test.js     # Standalone integration test suite
```

---

## 🛠️ Quick Start

### Prerequisites
- Node.js (v18 or higher recommended)
- PC and iPhone connected to the same Wi-Fi network (or iPhone connected to PC Wi-Fi hotspot)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
```bash
npm start
```

When started, the terminal will print your local network address and a scannable QR code:
```text
==================================================
 🚀 NETWORK SHARER ACTIVE (Listening on 0.0.0.0:3000)
 📱 Scan QR Code with iPhone Camera to start:
 🔗 Local PC URL: http://localhost:3000
 🌐 Network URL:  http://192.168.x.x:3000
==================================================
```

### 3. Connect iPhone & Start Sharing
1. Open the **Camera app** on your iPhone.
2. Point your camera at the QR code displayed in the terminal or on `http://localhost:3000`.
3. Tap the yellow Safari notification banner to open the app.
4. Tap the **Photo Gallery** or **Camera** icon to pick photos, videos, or files and tap **Send Now**!

---

## 🔒 Firewall Setup (If iPhone Cannot Connect)

If your PC blocks incoming connections on port 3000:

- **Windows PC (Windows Defender Firewall)**:
  - When you first run `npm start`, click **"Allow Access"** on the Windows Firewall prompt (make sure **Private Networks** is checked).
  - Or run in **PowerShell (Administrator)**:
    ```powershell
    netsh advfirewall firewall add rule name="Network Sharer" dir=in action=allow protocol=TCP localport=3000
    ```

- **Linux (`firewalld` - Fedora, EndeavourOS, Arch, RHEL)**:
  ```bash
  sudo firewall-cmd --add-port=3000/tcp --permanent
  sudo firewall-cmd --reload
  ```

- **Linux (`ufw` - Ubuntu, Debian, Linux Mint)**:
  ```bash
  sudo ufw allow 3000/tcp
  ```

---

## 🧪 Running Tests

Run the automated integration self-check to verify server startup, local IP detection, file uploads, text sharing, SSE streams, and file downloads:

```bash
npm test
```

---

## 📄 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/info` | `GET` | Get local network IP, server URL, and QR code Data URL |
| `/api/upload` | `POST` | Upload single/multiple files with optional text caption |
| `/api/files` | `GET` | Get list of all shared files metadata |
| `/api/files/:filename` | `GET` | Serve/download raw file content |
| `/api/files/:filename` | `DELETE` | Delete shared file |
| `/api/text` | `GET` / `POST` | Get or share text notes / clipboard snippets |
| `/api/events` | `GET` | Server-Sent Events (SSE) live notification stream |

---

## 📜 License
[MIT](LICENSE)
