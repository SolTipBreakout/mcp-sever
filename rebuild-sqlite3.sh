#!/bin/sh

# This script rebuilds the sqlite3 module from source
# Run it inside the Docker container if you experience SQLite3 binding issues

echo "Rebuilding sqlite3 from source..."

# Set environment variables to force build from source
export SQLITE_FORCE_BUILD=1
export npm_config_build_from_source=true
export npm_config_sqlite_libname=sqlite3
export npm_config_target_arch=x64

# Navigate to the sqlite3 directory
cd /app/node_modules/sqlite3

# Clean any previous builds
rm -rf build

# Install node-gyp if not available
if ! command -v node-gyp &> /dev/null; then
  echo "Installing node-gyp..."
  npm install -g node-gyp
fi

# Rebuild the module
echo "Running npm rebuild..."
npm rebuild --build-from-source

echo "Verifying sqlite3 installation..."
cd /app
node -e "try { require('sqlite3'); console.log('SQLite3 test successful!'); } catch(e) { console.error('SQLite3 test failed:', e); process.exit(1); }"

if [ $? -eq 0 ]; then
  echo "✓ SQLite3 rebuilt successfully!"
else
  echo "✗ SQLite3 rebuild failed."
  exit 1
fi

exit 0 