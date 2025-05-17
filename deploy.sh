#!/bin/bash

# Exit on error
set -e

# Display help
if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
  echo "Usage: ./deploy.sh [OPTIONS]"
  echo ""
  echo "Deploy the mcpendpoint application using Docker."
  echo ""
  echo "Options:"
  echo "  -p, --production   Deploy in production mode (detached)"
  echo "  -r, --rebuild      Force rebuild of containers"
  echo "  -b, --backup       Create a database backup before deployment"
  echo "  -s, --sqlite       Rebuild SQLite3 module after deployment"
  echo "  -n, --native       Rebuild all native modules (SQLite3, WebRTC, etc.)"
  echo "  -h, --help         Display this help message"
  exit 0
fi

# Default values
PRODUCTION=false
REBUILD=false
BACKUP=false
REBUILD_SQLITE=false
REBUILD_NATIVE=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    -p|--production)
      PRODUCTION=true
      shift
      ;;
    -r|--rebuild)
      REBUILD=true
      shift
      ;;
    -b|--backup)
      BACKUP=true
      shift
      ;;
    -s|--sqlite)
      REBUILD_SQLITE=true
      shift
      ;;
    -n|--native)
      REBUILD_NATIVE=true
      shift
      ;;
    *)
      # Unknown option
      echo "Unknown option: $arg"
      echo "Run './deploy.sh --help' for usage information."
      exit 1
      ;;
  esac
done

echo "MCP Endpoint Deployment Script"
echo "=============================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
  echo "❌ .env file not found!"
  echo "Creating from .env.example..."
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "✅ Created .env from .env.example. Please edit it with your configuration."
  else
    echo "❌ .env.example not found. Please create a .env file manually."
    exit 1
  fi
fi

# Backup database if requested
if [ "$BACKUP" = true ]; then
  echo "📦 Creating database backup..."
  BACKUP_FILE="backup-$(date +%Y%m%d-%H%M%S).sql"
  
  if [ -f ./database/wallet-data.db ]; then
    # Check if sqlite3 is installed
    if command -v sqlite3 &> /dev/null; then
      sqlite3 ./database/wallet-data.db .dump > "$BACKUP_FILE"
      echo "✅ Database backup created: $BACKUP_FILE"
    else
      echo "⚠️ sqlite3 command not found. If container is already running, using Docker instead."
      if docker ps | grep -q mcpendpoint; then
        docker exec mcpendpoint sh -c "sqlite3 /app/database/wallet-data.db .dump" > "$BACKUP_FILE"
        echo "✅ Database backup created: $BACKUP_FILE"
      else
        echo "❌ Cannot create backup: mcpendpoint container not running and sqlite3 not installed."
      fi
    fi
  else
    echo "⚠️ Database file not found. Skipping backup."
  fi
fi

# Deploy the application
echo "🚀 Deploying MCP Endpoint..."

# Build and run the containers
if [ "$REBUILD" = true ]; then
  echo "🔄 Forcing rebuild of containers..."
  BUILD_ARG="--build"
else
  BUILD_ARG=""
fi

if [ "$PRODUCTION" = true ]; then
  echo "🌐 Deploying in production mode (detached)..."
  docker compose up $BUILD_ARG -d
else
  echo "🛠️ Deploying in development mode..."
  docker compose up $BUILD_ARG
fi

# Rebuild native modules if requested
if [ "$REBUILD_NATIVE" = true ]; then
  echo "🔧 Rebuilding all native modules..."
  if docker ps | grep -q mcpendpoint; then
    echo "🧰 Running comprehensive native module rebuild..."
    docker exec mcpendpoint sh -c "/app/rebuild-native-modules.sh"
    if [ $? -eq 0 ]; then
      echo "✅ Native modules rebuilt successfully!"
      
      # Restart container to apply changes
      echo "🔄 Restarting container to apply changes..."
      docker restart mcpendpoint
    else
      echo "❌ Failed to rebuild native modules."
    fi
  else
    echo "❌ Cannot rebuild modules: mcpendpoint container not running."
  fi
# Only rebuild SQLite if not rebuilding all native modules
elif [ "$REBUILD_SQLITE" = true ]; then
  echo "🔧 Rebuilding SQLite3 module..."
  if docker ps | grep -q mcpendpoint; then
    echo "🧰 Using npm to rebuild SQLite3 native module..."
    docker exec mcpendpoint sh -c "/app/rebuild-sqlite3.sh"
    if [ $? -eq 0 ]; then
      echo "✅ SQLite3 rebuilt successfully!"
      
      # Restart container to apply changes
      echo "🔄 Restarting container to apply changes..."
      docker restart mcpendpoint
    else
      echo "❌ Failed to rebuild SQLite3 module."
    fi
  else
    echo "❌ Cannot rebuild SQLite3: mcpendpoint container not running."
  fi
fi

echo ""
echo "Deployment process completed!"
echo ""

if [ "$PRODUCTION" = true ]; then
  echo "✅ Application is running in the background."
  echo "   View logs with: docker compose logs -f"
  echo "   Access the application at: http://localhost:3000"
fi

exit 0 