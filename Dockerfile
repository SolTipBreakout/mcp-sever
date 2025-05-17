FROM node:20.18-alpine3.18 AS builder

# Install build tools and dependencies for SQLite3 and WebRTC
RUN apk add --no-cache python3 make g++ gcc git libc-dev sqlite-dev \
    libstdc++ linux-headers eudev-dev libusb-dev \
    cmake libx11-dev libxtst-dev libxcomposite-dev libpulse-dev

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies with explicit build-from-source for native modules
ENV SQLITE_FORCE_BUILD=1
ENV npm_config_build_from_source=true
ENV npm_config_sqlite_libname=sqlite3
ENV npm_config_target_arch=x64
ENV SKIP_WRTC_INSTALL_FAILURE=true

# Use npm instead of yarn for better native module support
RUN npm install --unsafe-perm --build-from-source

# Make sure sqlite3 is properly installed
RUN if ! test -f /app/node_modules/sqlite3/lib/binding/node-v*-linux-*/*.node; then \
      echo "SQLite3 native module not found, trying to rebuild..."; \
      cd /app/node_modules/sqlite3 && \
      npm rebuild --build-from-source; \
    fi

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Test that sqlite3 module works
RUN node -e "console.log('Testing SQLite3 installation...'); try { require('sqlite3'); console.log('SQLite3 test successful'); } catch(e) { console.error('SQLite3 test failed:', e); process.exit(1); }"

# Create a lighter production image
FROM node:20.18-alpine3.18

# Install runtime dependencies
RUN apk add --no-cache sqlite sqlite-libs libstdc++ libusb

# Create app directory
WORKDIR /app

# Create necessary directories
RUN mkdir -p /app/database /app/logs

# Copy built application
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/

# Copy rebuild scripts
COPY rebuild-sqlite3.sh /app/rebuild-sqlite3.sh
COPY rebuild-native-modules.sh /app/rebuild-native-modules.sh
RUN chmod +x /app/rebuild-sqlite3.sh /app/rebuild-native-modules.sh

# Copy database if it exists
COPY --from=builder /app/database /app/database

# Define volumes for persistent data
VOLUME ["/app/database", "/app/logs"]

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/app/database/wallet-data.db
ENV SKIP_WRTC_INSTALL_FAILURE=true

EXPOSE 3000

# Run the app
CMD ["node", "dist/index.js"] 