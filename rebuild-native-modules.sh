#!/bin/sh

# This script rebuilds native modules from source
# Run it inside the Docker container if you experience SQLite3 or WebRTC binding issues

echo "Rebuilding native modules from source..."

# Set environment variables to force build from source
export SQLITE_FORCE_BUILD=1
export npm_config_build_from_source=true
export npm_config_sqlite_libname=sqlite3
export npm_config_target_arch=x64
export SKIP_WRTC_INSTALL_FAILURE=true

# Install node-gyp globally if needed
if ! command -v node-gyp &> /dev/null; then
  echo "Installing node-gyp..."
  npm install -g node-gyp
fi

# Rebuild SQLite3
echo "Rebuilding SQLite3..."
cd /app/node_modules/sqlite3
npm rebuild --build-from-source

# Verify SQLite3
echo "Verifying SQLite3 installation..."
cd /app
node -e "try { require('sqlite3'); console.log('✓ SQLite3 working properly'); } catch(e) { console.error('⚠️ SQLite3 failed:', e); }"

# Handle WebRTC (it might not always be required, so we'll check if it exists)
if [ -d "/app/node_modules/@roamhq/wrtc" ]; then
  echo "Rebuilding WebRTC..."
  cd /app/node_modules/@roamhq/wrtc
  npm rebuild --build-from-source
  
  echo "Verifying WebRTC installation..."
  cd /app
  node -e "try { require('@roamhq/wrtc'); console.log('✓ WebRTC working properly'); } catch(e) { console.error('⚠️ WebRTC module check failed:', e); }"
fi

echo "Native module rebuild complete"
exit 0 