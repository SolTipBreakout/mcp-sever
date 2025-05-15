import { Express } from 'express';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createSolanaRpc, address, isSolanaError, assertIsAddress, assertIsSignature } from '@solana/kit';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import { SOLANA_CONFIG, MCP_CONFIG, AUTH_CONFIG } from '../config/index.js';
import { getAuthConfig } from '../middleware/auth.js';
import { toolService } from './tool-service.js';
import { walletService } from './wallet-service.js';

// Create Solana RPC client 
const solanaRpc = createSolanaRpc(SOLANA_CONFIG.rpcUrl);

// Program IDs for SPL tokens
const SPL_PROGRAM_KEYS = {
  TOKEN_PROGRAM: address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  TOKEN_2022_PROGRAM: address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
};

/**
 * Initialize the MCP server with all routes and transports
 * @param app Express application instance
 */
export const initMcpServer = async (app: Express): Promise<boolean> => {
  try {
    // If tool service is already running, don't initialize again
    if (toolService.isInitialized()) {
      logger.info('MCP server already initialized');
      return true;
    }
    
    // Log MCP SDK version information if available
    try {
      // Use a different approach to get version info
      const mcpPackage = '@modelcontextprotocol/sdk';
      logger.info(`Using MCP SDK package: ${mcpPackage}`);
      
      // Log server available tools
      const serverMethods = Object.getOwnPropertyNames(McpServer.prototype)
        .filter(method => typeof (McpServer.prototype as any)[method] === 'function');
      logger.info(`MCP Server available methods: ${serverMethods.join(', ')}`);
    } catch (error) {
      logger.info('Could not determine MCP SDK details', { error: String(error) });
    }
    
    // Create a new MCP server
    const server = new McpServer({
      name: "SolanaMCP",
      version: "1.0.0"
    });
    
    console.log("🔶 Created new MCP server instance");
    
    // Initialize the tool service with the MCP server instance
    toolService.initialize(server);
    console.log("🔶 Initialized tool service with MCP server");
    
    // Ensure the wallet service is initialized
    if (!walletService.isInitialized()) {
      await walletService.initialize();
      console.log("🔶 Initialized wallet service");
    }
    
    // Tool 1: Get SOL balance for an address
    server.tool(
      "getBalance",
      {
        walletAddress: z.string().describe("Solana wallet address to check the balance for")
      },
      async ({ walletAddress }: { walletAddress: string }) => {
        try {
          assertIsAddress(walletAddress);
          const accountAddress = address(walletAddress);

          const { value: lamports } = await solanaRpc
            .getBalance(accountAddress)
            .send();

          const solBalance = Number(lamports) / 1_000_000_000;

          return {
            content: [
              {
                type: "text" as const,
                text: `Balance for ${walletAddress}: ${solBalance} SOL (${lamports.toString()} lamports)`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error while getting balance: ${isSolanaError(error) ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
    console.log("🔶 Registered tool: getBalance");

    // Tool 2: Get token balances for an address
    server.tool(
      "getTokenBalances",
      {
        walletAddress: z.string().describe("Solana wallet address to check token balances for")
      },
      async ({ walletAddress }: { walletAddress: string }) => {
        try {
          const results = await toolService.getTokenBalances(walletAddress);
          
          // Format the token data as a markdown table for better readability
          let markdownTable = "| Token | Amount | Decimals |\n";
          markdownTable += "|-------|--------|----------|\n";
          
          // Format and display non-zero balances
          results
            .filter(token => token.amount > 0)
            .sort((a, b) => b.amount - a.amount)
            .forEach(token => {
              markdownTable += `| ${token.mint} | ${token.amount} | ${token.decimals} |\n`;
            });
          
          return {
            content: [
              {
                type: "text",
                text: `Found ${results.length} token accounts for ${walletAddress}`,
              },
              {
                type: "text",
                text: markdownTable,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error while getting token balances: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 3: Get transaction details
    server.tool(
      "getTransaction",
      {
        signature: z.string().describe("Solana transaction signature to look up")
      },
      async ({ signature }: { signature: string }) => {
        try {
          assertIsSignature(signature);
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Not a valid signature: ${signature}`,
              },
            ],
            isError: true,
          };
        }
        
        try {
          const txInfo = await toolService.getTransaction(signature);
          
          // Format transaction info for better readability
          const formattedTx = {
            signature: txInfo.signature,
            status: txInfo.status,
            timestamp: txInfo.blockTime ? new Date(txInfo.blockTime * 1000).toISOString() : 'Unknown',
            fee: `${txInfo.fee} lamports`,
            accounts: txInfo.details?.accounts.length || 0,
            logs: txInfo.details?.logs?.length > 0 
              ? txInfo.details.logs.slice(0, 5).map((log: string) => `- ${log}`).join('\n') + (txInfo.details.logs.length > 5 ? '\n- ...' : '') 
              : 'No logs available'
          };

          return {
            content: [
              {
                type: "text",
                text: `Transaction ${signature} found:\n\n${JSON.stringify(formattedTx, null, 2)}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error while getting transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 4: Check network status
    server.tool(
      "networkStatus", 
      {}, 
      async () => {
        try {
          await solanaRpc.getHealth().send();
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Network is down`,
              },
            ],
          };
        }
        
        try {
          const { epoch, blockHeight, absoluteSlot } = await solanaRpc
            .getEpochInfo()
            .send();

          const status = {
            health: "okay",
            currentEpoch: epoch.toString(),
            blockHeight: blockHeight.toString(),
            currentSlot: absoluteSlot.toString(),
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(status, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error while getting network status: ${isSolanaError(error) ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 5: Get account information
    server.tool(
      "getAccountInfo",
      {
        address: z.string().describe("Solana account address to get information for")
      },
      async ({ address }: { address: string }) => {
        try {
          const accountInfo = await toolService.getAccountInfo(address);
          
          return {
            content: [
              {
                type: "text",
                text: `Account Information for ${address}:\n\n${JSON.stringify({
                  owner: accountInfo.owner,
                  balance: `${accountInfo.lamports / 1_000_000_000} SOL (${accountInfo.lamports} lamports)`,
                  executable: accountInfo.executable,
                  rentEpoch: accountInfo.rentEpoch,
                  dataSize: accountInfo.data ? accountInfo.data.length : 0,
                }, null, 2)}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error while getting account info: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: Create a wallet for a user
    server.tool(
      "createWallet",
      {
        platform: z.enum(["twitter", "telegram", "discord"]).describe("Platform the user is coming from"),
        platformId: z.string().describe("Platform-specific user ID"),
        label: z.string().optional().describe("Optional label for the wallet")
      },
      async ({ platform, platformId, label }: { platform: string, platformId: string, label?: string }) => {
        try {
          // Initialize wallet service if not already initialized
          if (!walletService.isInitialized()) {
            await walletService.initialize();
          }
          
          // Create a wallet for the user with the new method
          const walletInfo = await walletService.createWallet(platform, platformId, label);
          
          return {
            content: [
              {
                type: "text" as const,
                text: `Created new wallet for ${platform}:${platformId}: ${walletInfo.publicKey}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error creating wallet: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: Get user wallets
    server.tool(
      "getUserWallets",
      {
        platform: z.enum(["twitter", "telegram", "discord"]).describe("The social platform"),
        platformId: z.string().describe("Platform-specific user ID")
      },
      async ({ platform, platformId }: { platform: string, platformId: string }) => {
        try {
          // Initialize wallet service if not already initialized
          if (!walletService.isInitialized()) {
            await walletService.initialize();
          }
          
          // Get wallet for the user using the new method
          const wallet = await walletService.getWalletBySocialAccount(platform, platformId);
          
          if (!wallet) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No wallet found for ${platform}:${platformId}`,
                },
              ],
            };
          }
          
          // Format the wallet data
          let walletsInfo = "Wallet information:\n\n";
          walletsInfo += `Public Key: ${wallet.publicKey}\n`;
          walletsInfo += `Label: ${wallet.label || "Unnamed wallet"}\n\n`;
          
          walletsInfo += "Linked accounts:\n";
          wallet.socialAccounts.forEach((account, index) => {
            walletsInfo += `${index + 1}. ${account.platform}:${account.platformId}\n`;
          });
          
          return {
            content: [
              {
                type: "text" as const,
                text: walletsInfo,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error getting user wallet: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: Link social account to wallet
    server.tool(
      "linkAccount",
      {
        platform: z.enum(["twitter", "telegram", "discord"]).describe("The social platform to link"),
        platformId: z.string().describe("Platform-specific user ID"),
        walletPublicKey: z.string().describe("Public key of the wallet to link to")
      },
      async ({ platform, platformId, walletPublicKey }: { platform: string, platformId: string, walletPublicKey: string }) => {
        try {
          // Initialize wallet service if not already initialized
          if (!walletService.isInitialized()) {
            await walletService.initialize();
          }
          
          // Link the social account to the wallet
          const walletInfo = await walletService.linkSocialAccountToWallet(
            platform,
            platformId,
            walletPublicKey
          );
          
          return {
            content: [
              {
                type: "text" as const,
                text: `Successfully linked ${platform}:${platformId} to wallet ${walletPublicKey}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error linking account: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Secure Tool: Send SOL
    server.tool(
      "sendSol",
      {
        platform: z.enum(["twitter", "telegram", "discord"]).describe("The social platform of the sender"),
        platformId: z.string().describe("Platform-specific user ID of the sender"),
        recipientAddress: z.string().describe("Recipient's Solana address"),
        amount: z.number().positive().describe("Amount of SOL to send")
      },
      async ({ platform, platformId, recipientAddress, amount }: { platform: string, platformId: string, recipientAddress: string, amount: number }) => {
        try {
          // Initialize wallet service if not already initialized
          if (!walletService.isInitialized()) {
            await walletService.initialize();
          }
          
          // Get the wallet for this social account
          const wallet = await walletService.getWalletBySocialAccount(platform, platformId);
          
          if (!wallet) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No wallet found for ${platform}:${platformId}`,
                },
              ],
              isError: true,
            };
          }
          
          // Validate the recipient address
          try {
            new PublicKey(recipientAddress);
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Invalid recipient address: ${recipientAddress}`,
                },
              ],
              isError: true,
            };
          }
          
          // Create and send the transaction using the tool service but with secure wallet signing
          const signature = await toolService.sendSolSecure(
            wallet.publicKey, 
            recipientAddress, 
            amount, 
            walletService
          );
          
          return {
            content: [
              {
                type: "text" as const,
                text: `Successfully sent ${amount} SOL from ${wallet.publicKey} to ${recipientAddress}.\nTransaction signature: ${signature}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error sending SOL: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 7: Send SPL token
    server.tool(
      "sendToken",
      {
        platform: z.enum(["twitter", "telegram", "discord"]).describe("The social platform of the sender"),
        platformId: z.string().describe("Platform-specific user ID of the sender"),
        toAddress: z.string().describe("Recipient's Solana wallet address"),
        tokenMint: z.string().describe("Mint address of the token to send"),
        amount: z.number().positive().describe("Amount of tokens to send"),
        decimals: z.number().int().describe("Decimal places for the token")
      },
      async ({ platform, platformId, toAddress, tokenMint, amount, decimals }: 
        { platform: string, platformId: string, toAddress: string, tokenMint: string, amount: number, decimals: number }) => {
        try {
          // Initialize wallet service if not already initialized
          if (!walletService.isInitialized()) {
            await walletService.initialize();
          }
          
          // Get the wallet for this social account
          const wallet = await walletService.getWalletBySocialAccount(platform, platformId);
          
          if (!wallet) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No wallet found for ${platform}:${platformId}`,
                },
              ],
              isError: true,
            };
          }

          // Validate recipient address
          try {
            new PublicKey(toAddress);
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Invalid recipient address: ${toAddress}`,
                },
              ],
              isError: true,
            };
          }
          
          // Validate token mint
          try {
            new PublicKey(tokenMint);
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Invalid token mint address: ${tokenMint}`,
                },
              ],
              isError: true,
            };
          }
          
          // Send token securely using wallet service for signing
          const signature = await toolService.sendTokenSecure(
            wallet.publicKey, 
            toAddress, 
            tokenMint, 
            amount, 
            decimals,
            walletService
          );
          
          return {
            content: [
              {
                type: "text",
                text: `Successfully sent ${amount} tokens from ${wallet.publicKey} to ${toAddress}\nTransaction signature: ${signature}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error sending token: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: Send SOL to a tagged user
    server.tool(
      "sendSolToUser",
      {
        senderPlatform: z.enum(["twitter", "telegram", "discord"]).describe("The social platform of the sender"),
        senderPlatformId: z.string().describe("Platform-specific user ID of the sender"),
        recipientPlatform: z.enum(["twitter", "telegram", "discord"]).describe("The social platform of the recipient"),
        recipientPlatformId: z.string().describe("Platform-specific user ID of the recipient (username)"),
        amount: z.number().positive().describe("Amount of SOL to send")
      },
      async ({ senderPlatform, senderPlatformId, recipientPlatform, recipientPlatformId, amount }: 
        { senderPlatform: string, senderPlatformId: string, recipientPlatform: string, recipientPlatformId: string, amount: number }) => {
        try {
          // Initialize wallet service if not already initialized
          if (!walletService.isInitialized()) {
            await walletService.initialize();
          }
          
          // Get the sender's wallet
          const senderWallet = await walletService.getWalletBySocialAccount(senderPlatform, senderPlatformId);
          
          if (!senderWallet) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No wallet found for sender ${senderPlatform}:${senderPlatformId}`,
                },
              ],
              isError: true,
            };
          }
          
          // Check if recipient has a wallet, if not, create one
          let recipientWallet = await walletService.getWalletBySocialAccount(recipientPlatform, recipientPlatformId);
          let walletCreated = false;
          
          if (!recipientWallet) {
            // Create a new wallet for the recipient
            recipientWallet = await walletService.createWallet(
              recipientPlatform, 
              recipientPlatformId, 
              `${recipientPlatform}-${recipientPlatformId}`
            );
            walletCreated = true;
            logger.info(`Created new wallet ${recipientWallet.publicKey} for ${recipientPlatform}:${recipientPlatformId}`);
          }
          
          // Execute the transaction using the secure method
          const signature = await toolService.sendSolSecure(
            senderWallet.publicKey, 
            recipientWallet.publicKey, 
            amount, 
            walletService
          );
          
          // Prepare response message
          let responseText = `Successfully sent ${amount} SOL from ${senderPlatform}:${senderPlatformId} to ${recipientPlatform}:${recipientPlatformId}.\n`;
          
          if (walletCreated) {
            responseText += `A new wallet was created for ${recipientPlatform}:${recipientPlatformId}.\n`;
          }
          
          responseText += `Transaction signature: ${signature}`;
          
          return {
            content: [
              {
                type: "text" as const,
                text: responseText,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error sending SOL to user: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool: Send SPL token to a tagged user
    server.tool(
      "sendTokenToUser",
      {
        senderPlatform: z.enum(["twitter", "telegram", "discord"]).describe("The social platform of the sender"),
        senderPlatformId: z.string().describe("Platform-specific user ID of the sender"),
        recipientPlatform: z.enum(["twitter", "telegram", "discord"]).describe("The social platform of the recipient"),
        recipientPlatformId: z.string().describe("Platform-specific user ID of the recipient (username)"),
        tokenMint: z.string().describe("Mint address of the token to send"),
        amount: z.number().positive().describe("Amount of tokens to send"),
        decimals: z.number().int().describe("Decimal places for the token")
      },
      async ({ senderPlatform, senderPlatformId, recipientPlatform, recipientPlatformId, tokenMint, amount, decimals }: 
        { senderPlatform: string, senderPlatformId: string, recipientPlatform: string, recipientPlatformId: string, 
          tokenMint: string, amount: number, decimals: number }) => {
        try {
          // Initialize wallet service if not already initialized
          if (!walletService.isInitialized()) {
            await walletService.initialize();
          }
          
          // Get the sender's wallet
          const senderWallet = await walletService.getWalletBySocialAccount(senderPlatform, senderPlatformId);
          
          if (!senderWallet) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No wallet found for sender ${senderPlatform}:${senderPlatformId}`,
                },
              ],
              isError: true,
            };
          }
          
          // Check if recipient has a wallet, if not, create one
          let recipientWallet = await walletService.getWalletBySocialAccount(recipientPlatform, recipientPlatformId);
          let walletCreated = false;
          
          if (!recipientWallet) {
            // Create a new wallet for the recipient
            recipientWallet = await walletService.createWallet(
              recipientPlatform, 
              recipientPlatformId, 
              `${recipientPlatform}-${recipientPlatformId}`
            );
            walletCreated = true;
            logger.info(`Created new wallet ${recipientWallet.publicKey} for ${recipientPlatform}:${recipientPlatformId}`);
          }
          
          // Validate token mint
          try {
            new PublicKey(tokenMint);
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Invalid token mint address: ${tokenMint}`,
                },
              ],
              isError: true,
            };
          }
          
          // Send token securely using wallet service for signing
          const signature = await toolService.sendTokenSecure(
            senderWallet.publicKey, 
            recipientWallet.publicKey, 
            tokenMint, 
            amount, 
            decimals,
            walletService
          );
          
          // Prepare response message
          let responseText = `Successfully sent ${amount} tokens from ${senderPlatform}:${senderPlatformId} to ${recipientPlatform}:${recipientPlatformId}.\n`;
          
          if (walletCreated) {
            responseText += `A new wallet was created for ${recipientPlatform}:${recipientPlatformId}.\n`;
          }
          
          responseText += `Transaction signature: ${signature}`;
          
          return {
            content: [
              {
                type: "text" as const,
                text: responseText,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error sending token to user: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Resource: Transaction optimization guide
    server.resource(
      "solana-tx-optimization",
      "Transaction Optimization Guide",
      async (uri) => {
        const optimizationGuide = {
          title: "Optimizing Solana Transactions",
          sections: [
            {
              title: "Compute Unit Optimization",
              content: `
                Solana transactions are limited by Compute Units (CUs). To optimize transactions:
                
                1. Use priority fees wisely with \`ComputeBudgetProgram.setComputeUnitPrice()\`
                2. Request sufficient compute units with \`ComputeBudgetProgram.setComputeUnitLimit()\`
                3. Batch related operations into a single transaction
                4. Use versioned transactions for more efficient serialization
              `
            },
            {
              title: "Fee Management",
              content: `
                Solana fees consist of:
                - Base fee: Currently 5000 lamports per signature
                - Priority fee: Additional fee to prioritize transaction
                
                To manage fees:
                1. Consolidate signatures where possible
                2. Use durable nonces for high-priority transactions
                3. Monitor network congestion before sending
              `
            },
            {
              title: "Best Practices",
              content: `
                1. Use versioned transactions and address lookup tables
                2. Implement proper error handling and retries
                3. Pre-compute network fees before sending transactions
                4. Validate all public keys and inputs client-side
                5. Consider using compiled programs when possible
              `
            }
          ],
        };

        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(optimizationGuide, null, 2),
            },
          ],
        };
      }
    );
    
    // Log the tools for debugging
    const serverAny = server as any;
    logger.info('MCP server properties:', Object.keys(serverAny));
    
    // Check for tool registry with various property names
    const registryProps = ['_toolRegistry', 'toolRegistry', 'tools', '_tools'];
    const foundRegistryProp = registryProps.find(prop => serverAny[prop] && Object.keys(serverAny[prop]).length > 0);
    
    if (foundRegistryProp) {
      const toolRegistry = serverAny[foundRegistryProp];
      logger.info(`MCP server has ${Object.keys(toolRegistry).length} tools registered in ${foundRegistryProp}:`, 
        { tools: Object.keys(toolRegistry) });
      
      // Log a sample tool structure to understand the registry format
      const sampleToolName = Object.keys(toolRegistry)[0];
      if (sampleToolName) {
        const sampleTool = toolRegistry[sampleToolName];
        logger.debug(`Sample tool structure for ${sampleToolName}:`, {
          properties: Object.keys(sampleTool),
          hasHandler: typeof sampleTool.handler === 'function',
          schema: sampleTool.schema,
        });
      }
    } else {
      logger.warn('No tool registry found in MCP server with expected property names');
      
      // Try to find any property that might contain the tools
      const potentialRegistries = Object.keys(serverAny)
        .filter(key => typeof serverAny[key] === 'object' && serverAny[key] !== null)
        .map(key => ({ key, count: serverAny[key] ? Object.keys(serverAny[key]).length : 0 }))
        .filter(({ count }) => count > 0);
      
      if (potentialRegistries.length > 0) {
        logger.info('Potential tool registries found:', potentialRegistries);
      }
      
      // Look at the server methods to check for any tool registration related methods
      const methods = Object.keys(serverAny)
        .filter(key => typeof serverAny[key] === 'function')
        .join(', ');
      logger.debug('MCP server methods:', methods);
    }

    // Prompt: Analyze wallet
    server.prompt(
      "analyze-wallet",
      { walletAddress: z.string() },
      ({ walletAddress }) => ({
        description:
          "Analyze a Solana wallet address and provide a summary of its balances and activity",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please analyze this Solana wallet address: ${walletAddress}

1. What is the SOL balance of this wallet?
2. What token balances does this wallet hold?
3. Provide a summary of the wallet's assets and activity if possible.`,
            },
          },
        ],
      }),
    );

    // Prompt: Explain transaction
    server.prompt(
      "explain-transaction",
      { signature: z.string() },
      ({ signature }) => ({
        description: "Analyze and explain a Solana transaction in simple terms",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please analyze this Solana transaction signature: ${signature}

1. Was this transaction successful?
2. What type of transaction is this? (e.g., token transfer, swap, NFT mint)
3. What accounts were involved?
4. Explain what happened in simple terms.`,
            },
          },
        ],
      }),
    );

    logger.info('Solana MCP server setup complete');
    
    // Set up HTTP transport via Express (StreamableHTTPServerTransport)
    if (app) {
      // Create HTTP transport and connect server to it
      app.use(MCP_CONFIG.path, express.json());
      
      // Create HTTP transport for handling Express requests
      app.post(MCP_CONFIG.path, async (req, res) => {
        try {
          // Manual auth check before creating the transport
          if (AUTH_CONFIG.enabled) {
            const apiKey = req.headers[AUTH_CONFIG.headerName.toLowerCase()];
            if (!apiKey || !AUTH_CONFIG.apiKeys.includes(apiKey as string)) {
              res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or missing API key'
              });
              return;
            }
          }
          
          // Create a transport for this request with unique session ID
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });
          
          // Connect the server to this transport
          await server.connect(transport);
          
          // Handle the request
          await transport.handleRequest(req, res, req.body);
        } catch (error) {
          logger.error('Error handling MCP request', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
          
          if (!res.headersSent) {
            res.status(500).json({ 
              error: 'Internal server error',
              message: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
        }
      });
      
      logger.info(`MCP HTTP transport registered at ${MCP_CONFIG.path}`);
    }
    
    // Set up StdIO transport for local integrations if enabled (e.g. via CLI arg --stdio)
    if (process.argv.includes('--stdio')) {
      const stdioTransport = new StdioServerTransport();
      await server.connect(stdioTransport);
      logger.info('MCP StdIO transport registered');
    }
    
    logger.info('MCP Server initialized successfully');
    console.log('🟢 MCP SERVER INITIALIZATION COMPLETE');
    console.log('🔶 MCP server capabilities:');
    const serverCapabilities = (server as any).capabilities;
    if (serverCapabilities) {
      console.log(JSON.stringify(serverCapabilities, null, 2));
    }
    
    console.log('🔶 Registered tools summary:');
    // List all tools we should have registered
    const expectedTools = [
      'getBalance', 
      'getTokenBalances', 
      'getTransaction', 
      'getAccountInfo',
      'networkStatus',
      'createWallet',
      'getUserWallets',
      'linkAccount',
      'sendSol',
      'sendToken',
      'sendSolToUser',
      'sendTokenToUser'
    ];
    console.log(`Expected tools: ${expectedTools.join(', ')}`);
    
    // Verify all tools are registered
    const mcpServerAny = server as any;
    const toolRegistry = mcpServerAny._toolRegistry || 
                        mcpServerAny.toolRegistry || 
                        mcpServerAny.tools || 
                        mcpServerAny._tools || 
                        {};
    
    if (toolRegistry) {
      const actualTools = Object.keys(toolRegistry);
      console.log(`Actual registered tools: ${actualTools.join(', ')}`);
      
      // Check for missing tools
      const missingTools = expectedTools.filter(tool => !actualTools.includes(tool));
      if (missingTools.length > 0) {
        logger.warn(`Warning: Some expected tools are not registered: ${missingTools.join(', ')}`);
      } else {
        logger.info('All expected tools are properly registered');
      }
    }
    
    return true;
  } catch (error) {
    logger.error('Failed to initialize MCP server', { error });
    return false;
  }
}; 