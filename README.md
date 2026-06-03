# Twitch Clips Viewer

A Chrome/Edge extension that shows **all clips** from a given Twitch channel on a dedicated page with pagination (up to 100 clips per page), search, and sorting.

## Installation

1. Open `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `test-twitchclips_extension` folder.

## Twitch API setup

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps).
2. Create an application (type: **Confidential** or **Public** with a Client Secret).
3. In the extension popup, open **Twitch API settings**.
4. Enter your **Client ID** and **Client Secret**, then click **Save**.

## Usage

### Via the popup

1. Click the extension icon.
2. Enter a channel name (for example, `shroud`).
3. Click **Open clips**.

### Direct link

The clips page opens at:

```
chrome-extension://<EXTENSION_ID>/pages/tracking.html?channel=test
```

Replace `test` with the channel login and `<EXTENSION_ID>` with your extension ID (shown on the extensions page).

## Features

- Loads **all** channel clips via the Twitch Helix API (with automatic API pagination).
- Displays up to **100 clips** per page.
- **Back** / **Next** buttons to move between pages.
- Sorting:
  - **Oldest first**
  - **Newest first**
  - **Most popular**
- Search by clip title and creator.
- Clicking a clip opens it on Twitch.

## Project structure

```
manifest.json
background.js
lib/twitch-api.js
lib/clip-loader.js
lib/clip-player.js
lib/rate-limiter.js
lib/credentials.js
lib/creator-stats.js
lib/i18n.js
pages/tracking.html
pages/tracking.js
pages/tracking.css
pages/options.html
popup/popup.html
popup/popup.js
popup/popup.css
icons/
```

## Notes

- The Twitch API returns clips in batches of 100; the extension automatically fetches all pages.
- Date sorting is done in the extension after all clips have been loaded.
- For channels with a very large number of clips, the first load may take some time.
