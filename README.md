# BridgePaste

Secure clipboard manager for Windows, with MockAPI.io login.

## Features

- Live clipboard history with smart type detection
- Quick picker — `Ctrl + Shift + V`
- Favorites, delete, search, and type filters
- Sensitive content protection
- Login / Register via MockAPI.io `userdetails`

## Run

```bash
cd BridgePaste
npm install
npm start
```

MockAPI URL is configured in `electron/config.js`.

## Build Windows installer

```bash
cd BridgePaste
npm run build
```

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Shift + V` | Open quick picker |
| `↑` `↓` | Navigate picker |
| `Enter` | Copy selected item |
| `Esc` | Close picker |
| `Ctrl + F` | Favorite selected (picker) |
| `Delete` | Delete selected (picker) |
| `Ctrl + K` | Focus search (main window) |
