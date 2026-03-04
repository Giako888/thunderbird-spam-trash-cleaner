# 🧹 Spam & Trash Cleaner

A Thunderbird extension that lets you empty the Spam and Trash folders across all your mail accounts with a single click.

![Thunderbird 115+](https://img.shields.io/badge/Thunderbird-115%2B-blue?logo=thunderbird&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-4.0.0-purple)

## Features

- **One-click cleanup** — Instantly delete all messages from Trash, Spam, or both across every configured account.
- **Live message counts** — See at a glance how many messages are sitting in your Trash and Spam folders.
- **Keyboard shortcuts**
  - `Ctrl+Shift+Delete` — Empty Trash
  - `Ctrl+Shift+J` — Empty Spam
  - `Ctrl+Shift+B` — Empty both Trash & Spam
- **Confirmation dialog** — A built-in confirmation prompt prevents accidental deletions.
- **Multi-account support** — Automatically discovers and cleans Trash/Spam folders for all accounts, including nested sub-folders.
- **Desktop notifications** — Get a summary of how many messages were deleted.
- **Localized in 23 languages** — Arabic, Bengali, Chinese (Simplified & Traditional), Dutch, English, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Polish, Portuguese (Brazil & Portugal), Russian, Spanish, Swahili, Thai, Turkish, Ukrainian, and Vietnamese.
- **Pure WebExtension** — No legacy Experiment APIs required. Compatible with Thunderbird 115 and later.

## Installation

### From Thunderbird Add-ons

1. Open Thunderbird.
2. Go to **Add-ons and Themes** (`Ctrl+Shift+A`).
3. Search for **Spam & Trash Cleaner**.
4. Click **Add to Thunderbird**.

### Manual Installation

1. Download the latest `spam-trash-cleaner.xpi` from the [Releases](https://github.com/Giako888/thunderbird-spam-trash-cleaner/releases) page.
2. In Thunderbird, go to **Add-ons and Themes** → ⚙️ → **Install Add-on From File…**
3. Select the `.xpi` file.

## How It Works

Click the toolbar button to open the popup. It displays the current Trash and Spam message counts for all your accounts. Choose to empty Trash, Spam, or both — confirm the action, and the extension permanently deletes the messages and reports the result.

## Building from Source

To build the `.xpi` package on Windows (PowerShell):

```powershell
.\build-xpi.ps1
```

This creates `spam-trash-cleaner.xpi` ready for installation or distribution.

## Project Structure

```
├── background.js        # Background script handling message deletion
├── manifest.json        # Extension manifest (Manifest V2)
├── popup/
│   ├── popup.html       # Popup UI
│   ├── popup.css        # Popup styles
│   └── popup.js         # Popup logic
├── icons/               # Extension icons (SVG)
├── _locales/            # Translations (23 languages)
└── build-xpi.ps1       # Build script
```

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License.

## Author

**Giako** — [GitHub](https://github.com/Giako888)
