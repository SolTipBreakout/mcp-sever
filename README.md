# MCP Endpoint: Solana Blockchain API Server

[![Model Context Protocol](https://img.shields.io/badge/MCP-v1.11.2-blue)](https://github.com/modelcontextprotocol/sdk)
[![Solana](https://img.shields.io/badge/Solana-v1.98.2-green)](https://solana.com/)

MCP Endpoint is a specialized HTTP server that exposes Solana blockchain functionality through a standardized API using the Model Context Protocol. It serves as the infrastructure backbone for the SolTip cross-platform tipping system, handling wallet operations, transaction signing, and blockchain interactions.

## 🏛️ Architecture

The MCP Endpoint is an Express-based HTTP server that:

1. Exposes a REST API for frontend and bot integrations
2. Implements the Model Context Protocol (MCP) for AI agent integrations
3. Provides a secure wallet management system for social account linking
4. Handles Solana blockchain interaction through the Solana Web3.js SDK

```
┌─────────────────────────────────────┐
│            MCP Endpoint             │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────┐    ┌────────────┐  │
│  │  REST API   │    │ MCP Server │  │
│  └─────────────┘    └────────────┘  │
│         │                │          │
│         ▼                ▼          │
│  ┌─────────────────────────────┐    │
│  │        Core Services        │    │
│  ├─────────────────────────────┤    │
│  │  - Wallet Service           │    │
│  │  - Transaction Service      │    │
│  │  - User Service             │    │
│  │  - Tool Service             │    │
│  └─────────────────────────────┘    │
│                  │                  │
│                  ▼                  │
│  ┌─────────────────────────────┐    │
│  │       SQLite Database       │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
         │                  │
         ▼                  ▼
┌─────────────────┐  ┌─────────────────┐
│  Solana Network │  │ Social Platforms │
└─────────────────┘  └─────────────────┘
```

## 🔑 Features

- **MCP Tool Integration**: Implements the Model Context Protocol for AI agent interaction
- **Wallet Management**: Creates and manages wallets for users
- **Social Account Linking**: Links social accounts (Twitter, Discord, Telegram) to wallets
- **Transaction Handling**: Sends SOL and tokens between accounts
- **Secure Key Management**: Encrypted storage of sensitive wallet information
- **API Authentication**: Secures endpoints with API key validation
- **Rate Limiting**: Prevents abuse with configurable rate limits
- **Comprehensive Logging**: Detailed logging for debugging and monitoring

## 🛠️ Project Structure

```
mcpendpoint/
├── src/
│   ├── config/           # Configuration loaders and validators
│   ├── database/         # Database schema and connection management
│   ├── middleware/       # Express middleware (auth, rate limiting, etc.)
│   ├── routes/           # API route definitions
│   ├── services/         # Core business logic
│   │   ├── mcp-service.ts        # MCP server configuration
│   │   ├── tool-service.ts       # MCP tool implementations
│   │   ├── wallet-service.ts     # Wallet management
│   │   ├── user-service.ts       # User account handling
│   │   └── transaction-service.ts # Transaction processing
│   ├── utils/            # Utility functions and helpers
│   └── index.ts          # Application entry point
├── database/             # SQLite database storage
├── dist/                 # Compiled JavaScript output
├── logs/                 # Application logs
├── .env                  # Environment configuration
└── package.json          # Project dependencies
```

## 📋 API Endpoints

The MCP Endpoint exposes several REST API endpoints:

### Authentication & Health
- `GET /api/health` - Server health check
- `GET /api/status` - Detailed server status

### MCP Tools
- `POST /api/mcp/tools/{toolName}` - Execute MCP tools via HTTP

### Wallet Management
- `POST /api/user/wallet` - Create or retrieve a wallet
- `GET /api/user/{walletAddress}` - Get user profile by wallet address
- `GET /api/user/wallet/{platform}/{username}` - Get wallet by social account

### Social Accounts
- `POST /api/user/wallet/link` - Link wallet to social account
- `DELETE /api/user/wallet/unlink` - Unlink wallet from platform
- `GET /api/user/social-accounts/{walletAddress}` - Get linked social accounts

### Transactions
- `POST /api/transaction` - Record a transaction
- `PATCH /api/transaction/{signature}/status` - Update transaction status

## 🚀 Getting Started

### Prerequisites

- Node.js 16+
- pnpm
- SQLite (included)
- Solana wallet (for development)

### Installation

1. Clone the repository
```bash
git clone https://github.com/SolTipBreakout/solBreakOut.git
cd solBreakOut/mcpendpoint
```

2. Install dependencies
```bash
pnpm install
```

3. Create a `.env` file in the root directory (see `.env.example` for reference)
```env
# Server
PORT=3000
APP_URL=http://localhost:3000
EXPLORER_URL=https://explorer.solana.com/tx

# Solana
SOLANA_PRIVATE_KEY="your_private_key_as_array"
RPC_URL=https://api.devnet.solana.com

# MCP Endpoint
API_KEY=your-api-key
```

4. Build the project
```bash
pnpm build
```

5. Start the server
```bash
pnpm start
```

For development:
```bash
pnpm dev
```

## 🔧 Configuration

The MCP Endpoint can be configured using environment variables:

| Variable           | Description                                   | Default                       |
|--------------------|-----------------------------------------------|-------------------------------|
| PORT               | Server port                                   | 3000                          |
| APP_URL            | Public URL of the application                 | http://localhost:3000         |
| EXPLORER_URL       | Solana explorer URL                           | https://explorer.solana.com/tx |
| SOLANA_PRIVATE_KEY | Private key for server wallet                 | (Required)                    |
| RPC_URL            | Solana RPC endpoint                           | https://api.devnet.solana.com |
| API_KEY            | API key for authentication                    | (Required)                    |
| LOG_LEVEL          | Logging level                                 | info                          |

## 🔒 Security Considerations

- The server wallet private key is sensitive and should be properly secured
- API keys should be rotated regularly and kept confidential
- Rate limiting is implemented to prevent abuse
- Input validation is performed on all endpoints
- SQLite database is secured with proper permissions

## 📜 MCP Tool Reference

The MCP Endpoint implements the following MCP tools:

### getWalletAddress
Returns the wallet address of the agent

### getBalance
Get the balance of a Solana wallet or token account

### getTokenBalances
Get the token balances of a Solana wallet

### transferSOL
Transfer SOL to another address

### sendSolToUser
Send SOL to a user identified by their social platform username

## 🤝 Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](../CONTRIBUTING.md) file for details on our code of conduct and the process for submitting pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details. 