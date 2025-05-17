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
docker-compose up --build
```

### Production Deployment

1. Clone the repository on your server
2. Navigate to the project directory
3. Create a production `.env` file with your configuration
4. Build and start the container in detached mode:

```bash
docker-compose up --build -d
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
docker-compose logs
```

Follow logs in real-time:

```bash
docker-compose logs -f
```

## Troubleshooting

1. **SQLite file permission issues**: If you encounter permission issues with the SQLite database, make sure the volumes are properly mounted and have the correct permissions.

2. **Connection refused errors**: Ensure the port mappings are correct in the docker-compose.yml file and that no other service is using the same port.

3. **Container exits immediately**: Check the logs to see if there are any startup errors:
   ```bash
   docker-compose logs mcpendpoint
   ``` 