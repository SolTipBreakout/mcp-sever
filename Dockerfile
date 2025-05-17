FROM node:20.11-alpine3.18 AS builder

# Install build tools and dependencies for SQLite3
RUN apk add --no-cache python3 make g++ gcc git libc-dev sqlite-dev

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies with explicit build-from-source for sqlite3
ENV SQLITE_FORCE_BUILD=1
ENV npm_config_build_from_source=true
ENV npm_config_sqlite_libname=sqlite3
RUN yarn install --network-timeout 100000

# Make sure sqlite3 is properly installed
RUN if ! test -f /app/node_modules/sqlite3/lib/binding/node-v*-linux-*/*.node; then \
      echo "SQLite3 native module not found, trying to rebuild..."; \
      cd /app/node_modules/sqlite3 && \
      yarn rebuild --build-from-source; \
    fi

# Copy source code
COPY . .

# Build TypeScript code
RUN yarn build

# Test that sqlite3 module works
RUN node -e "console.log('Testing SQLite3 installation...'); require('sqlite3'); console.log('SQLite3 test successful');"

# Create a lighter production image
FROM node:20.11-alpine3.18

# Install SQLite3 runtime and dependencies
RUN apk add --no-cache sqlite sqlite-libs

# Create app directory
WORKDIR /app

# Create necessary directories
RUN mkdir -p /app/database /app/logs

# Copy built application
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/

# Copy the rebuild script
COPY rebuild-sqlite3.sh /app/rebuild-sqlite3.sh
RUN chmod +x /app/rebuild-sqlite3.sh

# Copy database if it exists
COPY --from=builder /app/database /app/database

# Define volumes for persistent data
VOLUME ["/app/database", "/app/logs"]

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/app/database/wallet-data.db

EXPOSE 3000

# Run the app
CMD ["node", "dist/index.js"] 