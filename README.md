# 🎬 Twitch Clips Viewer

A handy Chrome and Edge extension that lets you browse every clip from a chosen Twitch channel on a dedicated page with convenient pagination (up to 100 clips per page), search, and flexible sorting.

---

## ✨ Features

* 🚀 **Full load** — fetches every clip on the channel via the Twitch Helix API with automatic pagination handling.
* 📊 **High capacity** — shows up to 100 clips per page for easy browsing.
* 🧭 **Easy navigation** — intuitive Back and Next buttons to move between pages.
* 🗂️ **Flexible sorting:**
  * Oldest first
  * Newest first
  * Most popular
* 🔍 **Smart search** — instant filtering by clip title and creator.
* 🎯 **Direct link** — clicking a clip card opens it on the official Twitch site.

---

## 🛠️ Installation

1. Open `chrome://extensions/` (or `edge://extensions/` in Edge).
2. In the top-right corner, enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `Twitchclips` folder on your computer.

---

## 🔑 Twitch API setup

The extension needs developer API credentials:

1. Go to the [Twitch Developers Console](https://dev.twitch.tv/console).
2. Create a new app (choose **Confidential** or **Public** with a generated Client Secret).
3. Open the extension from its icon and go to **Twitch API settings**.
4. Enter your **Client ID** and **Client Secret**, then click **Save**.

---

## 💡 Usage

### Method 1. Via the popup
1. Click the extension icon in the browser toolbar.
2. Enter a channel name (for example, `Twitch`).
3. Click **Open clips**.

### Method 2. Direct link
You can open the clips page directly at:
```text
chrome-extension://<EXTENSION_ID>/pages/tracking.html?channel=CHANNEL_NAME
```

> [!IMPORTANT]
> Replace `CHANNEL_NAME` with the streamer’s login and `<EXTENSION_ID>` with your extension’s unique ID (you can copy it on `chrome://extensions/`).

---

## 📦 Project structure

```text
manifest.json
background.js
├── lib/
│   ├── twitch-api.js
│   ├── clip-loader.js
│   ├── clip-player.js
│   ├── rate-limiter.js
│   ├── credentials.js
│   ├── creator-stats.js
│   └── i18n.js
├── pages/
│   ├── tracking.html
│   ├── tracking.js
│   └── tracking.css
│   ├── options.html
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
└── icons/
```

---

## ⚠️ Important notes

> [!WARNING]
> The Twitch API returns data in batches of 100. The extension requests all pages in sequence, so on channels with a very large number of clips the first load may take a while.

> [!NOTE]
> Date sorting runs in the extension on the client side after all clips have been fully loaded into memory.
