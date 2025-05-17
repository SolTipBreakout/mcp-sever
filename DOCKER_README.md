# Docker Setup for MCP Endpoint

This document explains how to build, run, and deploy the MCP Endpoint service using Docker.

## Prerequisites

- Docker installed on your system
- Docker Compose installed on your system

## Quick Start

### Development

1. Clone the repository
2. Navigate to the project directory
3. Make sure you have a valid `.env` file (copy from `.env.example` if needed)
4. Build and start the container:

```bash
docker compose up --build
```

### Production Deployment

1. Clone the repository on your server
2. Navigate to the project directory
3. Create a production `.env` file with your configuration
4. Build and start the container in detached mode:

```bash
docker compose up --build -d
```

## Environment Variables

The following environment variables need to be set in your `.env` file:

- `PORT`: The port the server will listen on (default: 3000)
- `NODE_ENV`: Environment setting (development/production)
- `CORS_ORIGIN`: CORS configuration
- `SOLANA_RPC_URL`: Solana RPC endpoint
- `SOLANA_PRIVATE_KEY`: Your Solana private key
- `WALLET_ENCRYPTION_KEY`: Key used for wallet encryption
- `SQLITE_PATH`: Path to the SQLite database file
- `LOG_LEVEL`: Logging verbosity level
- `API_AUTH_ENABLED`: Whether API key auth is enabled
- `API_KEYS`: Comma-separated list of valid API keys
- `API_KEY_HEADER`: The header name for API key authentication

## Data Persistence

The application uses Docker volumes to persist data:

- `db-data`: Stores the SQLite database files
- `logs`: Stores application logs

These volumes ensure your data is not lost between container restarts.

## Accessing the Container

To access the running container's shell:

```bash
docker exec -it mcpendpoint sh
```

## Backup and Restore

### Backup the SQLite Database

```bash
docker exec mcpendpoint sh -c "sqlite3 /app/database/wallet-data.db .dump" > backup.sql
```

### Restore the SQLite Database

```bash
cat backup.sql | docker exec -i mcpendpoint sh -c "sqlite3 /app/database/wallet-data.db"
```

## Checking Logs

View container logs:

```bash
docker compose logs
```

Follow logs in real-time:

```bash
docker compose logs -f
```

## Troubleshooting

1. **SQLite3 binding issues**: SQLite3 requires native bindings which might cause issues on certain platforms or with certain Node.js versions. If you encounter errors about missing bindings:

   ```
   Error: Could not locate the bindings file
   ```

   You can use the included rebuild script:

   ```bash
   # First ensure the container is running
   docker compose up -d
   
   # Then run the rebuild script
   docker exec mcpendpoint /app/rebuild-sqlite3.sh
   
   # Restart the container
   docker restart mcpendpoint
   ```

   Alternatively, use the deploy script with the --sqlite flag:
   
   ```bash
   ./deploy.sh --production --sqlite
   ```

2. **WebRTC (@roamhq/wrtc) binding issues**: If you encounter errors related to WebRTC bindings:

   ```
   Error: Could not find wrtc binary on any of the paths
   ```

   Use the comprehensive native module rebuild script:

   ```bash
   docker exec mcpendpoint /app/rebuild-native-modules.sh
   ```

   Or use the deploy script with the --native flag:

   ```bash
   ./deploy.sh --production --native
   ```

3. **Architecture-specific issues**: If you're running on ARM64 architecture (like M1/M2 Macs), make sure the Docker image is being built for the correct architecture. The Dockerfile is configured to work with both x64 and ARM64.

4. **Node.js version incompatibility**: If you see errors about incompatible Node.js versions, check that the version in the Dockerfile matches the requirements of your dependencies.

5. **SQLite file permission issues**: If you encounter permission issues with the SQLite database, make sure the volumes are properly mounted and have the correct permissions.

6. **Connection refused errors**: Ensure the port mappings are correct in the docker-compose.yml file and that no other service is using the same port.

7. **Container exits immediately**: Check the logs to see if there are any startup errors:
   ```bash
   docker compose logs mcpendpoint
   ```

## Advanced Native Module Management

### Accessing SQLite CLI

To access the SQLite CLI for direct database manipulation:

```bash
docker exec -it mcpendpoint sh -c "sqlite3 /app/database/wallet-data.db"
```

### Installing Development Dependencies

If you need to install development dependencies inside the container:

```bash
docker exec -it mcpendpoint sh -c "cd /app && npm install --save-dev [package-name]"
```

### Rebuilding All Native Modules

For rebuilding all native modules with debug information:

```bash
docker exec -it mcpendpoint sh -c "cd /app && DEBUG=* /app/rebuild-native-modules.sh"
```

## Package Manager Notes

This Docker setup uses npm instead of pnpm or yarn for better compatibility with native modules on various architectures. If you need to add new dependencies, use:

```bash
docker exec -it mcpendpoint sh -c "cd /app && npm install [package-name]"
```

For development dependencies:

```bash
docker exec -it mcpendpoint sh -c "cd /app && npm install --save-dev [package-name]"
``` 