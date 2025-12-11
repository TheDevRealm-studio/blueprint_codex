# Blueprint Codex

A powerful documentation tool for Unreal Engine Blueprints, built with Vue 3, TypeScript, and Tauri.

## Features
- **Visual Graph Editor**: Create and organize documentation nodes visually.
- **Markdown Editor**: Rich text editing for documentation pages.
- **Hybrid Storage**:
  - **Desktop App**: Saves directly to your `Documents/BlueprintCodex` folder.
  - **Web App**: Uses a local Node.js server to save to the project's `data/` folder.
- **Cross-Platform**: Runs as a web app or a native desktop application (Mac/Windows).

## Prerequisites

- **Node.js** (v16 or higher)
- **Rust** (Required for Desktop App mode) - [Install Rust](https://www.rust-lang.org/tools/install)

## Installation

```bash
npm install
```

## Development

### Option 1: Desktop App (Recommended)
Runs as a native window. Data is saved to `~/Documents/BlueprintCodex`.

```bash
npm run tauri dev
```

### Option 2: Web App
Runs in your browser. Requires the local storage server. Data is saved to `./data` in the project folder.

```bash
npm run dev
```
*Note: This command runs both the frontend (Vite) and the backend storage server concurrently. It also exposes the server to your local network.*

## Building for Production

### macOS
Run this command on a Mac to generate a `.dmg` installer:

```bash
npm run tauri build
```
Output location: `src-tauri/target/release/bundle/macos/`

### Windows
Run the same command on a Windows machine to generate an `.exe` or `.msi` installer:

```bash
npm run tauri build
```

## Project Structure

- `src/` - Vue frontend application
- `src-tauri/` - Rust backend and Tauri configuration
- `server.js` - Local Node.js server for web mode
- `data/` - Local storage location (Web mode only)
