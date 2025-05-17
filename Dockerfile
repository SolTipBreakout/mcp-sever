FROM node:20-alpine AS builder

# Install build tools for SQLite3
RUN apk add --no-cache make gcc g++ python3 git sqlite sqlite-dev

# Create app directory
WORKDIR /app

# Copy package files and install dependencies using pnpm
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm install

# Copy source code
COPY . .

# Build TypeScript code
RUN pnpm run build

# Create a lighter production image
FROM node:20-alpine

# Install SQLite3 runtime dependencies
RUN apk add --no-cache sqlite

# Create app directory
WORKDIR /app

# Make sure the database directory exists
RUN mkdir -p /app/database
RUN mkdir -p /app/logs

# Install pnpm
RUN npm install -g pnpm

# Copy node modules and built app
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/

# Copy database
COPY --from=builder /app/database /app/database

VOLUME ["/app/database", "/app/logs"]

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/app/database/wallet-data.db

EXPOSE 3000

# Run the app
CMD ["node", "dist/index.js"] 