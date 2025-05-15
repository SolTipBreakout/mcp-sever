import { logger } from '../utils/logger.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Connection, PublicKey, Transaction, SystemProgram, Keypair, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
// Using web3.js methods instead of spl-token to avoid dependency issues
import bs58 from 'bs58';
import { SimpleWalletManager } from './wallet-service.js';
import { SOLANA_CONFIG } from '../config/index.js';

/**
 * Result from tool execution
 * 
 * @interface ToolExecutionResult
 */
export interface ToolExecutionResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/**
 * Tool description interface
 */
export interface ToolDescription {
  name: string;
  description?: string;
}

/**
 * Transaction information interface
 */
export interface TransactionInfo {
  signature: string;
  status: 'success' | 'error';
  blockTime?: number;
  fee: number;
  details?: any;
}

/**
 * Account information interface
 */
export interface AccountInfo {
  address: string;
  lamports: number;
  owner: string;
  executable: boolean;
  rentEpoch: number;
  data?: any;
}

/**
 * Helper function to diagnose parameter issues
 * 
 * @param expectedParams Array of expected parameter names 
 * @param actualParams Object of received parameters
 * @returns Diagnostic message
 */
function diagnosticParameters(expectedParams: string[], actualParams: Record<string, unknown>): string {
  const receivedParams = Object.keys(actualParams);
  const missing = expectedParams.filter(param => !receivedParams.includes(param));
  const unexpected = receivedParams.filter(param => !expectedParams.includes(param));
  const validParams = expectedParams.filter(param => receivedParams.includes(param));
  
  let message = '';
  
  if (missing.length > 0) {
    message += `Missing parameters: ${missing.join(', ')}\n`;
  }
  
  if (unexpected.length > 0) {
    message += `Unexpected parameters: ${unexpected.join(', ')}\n`;
  }
  
  message += `Received valid parameters: ${validParams.join(', ')}\n`;
  
  // Show actual values for debugging
  message += 'Parameter values:\n';
  validParams.forEach(param => {
    const value = actualParams[param];
    message += `  ${param}: ${typeof value === 'object' ? JSON.stringify(value) : value} (${typeof value})\n`;
  });
  
  return message;
}

/**
 * Handle errors from tool execution
 * 
 * @param error Error that occurred during tool execution
 * @param toolName Name of the tool being executed
 * @returns Standardized error response
 */
const handleToolError = (error: unknown, toolName: string): ToolExecutionResult => {
  let errorMessage = 'Unknown error occurred';
  
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  }
  
  logger.error(`Error executing tool ${toolName}: ${errorMessage}`, {
    toolName,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : error
  });
  
  return {
    content: [{
      type: 'text',
      text: `Error executing tool ${toolName}: ${errorMessage}`
    }],
    isError: true
  };
};

/**
 * Service for executing MCP tools
 */
export class ToolService {
  private mcpServer: McpServer | null = null;
  private connection: Connection | null = null;
  private rpcUrl: string = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  /**
   * Initialize the ToolService with an MCP server instance
   * 
   * @param mcpServer MCP server instance containing tool definitions
   */
  initialize(mcpServer: McpServer): void {
    this.mcpServer = mcpServer;
    this.connection = new Connection(this.rpcUrl, 'confirmed');
    logger.info('Tool service initialized with MCP server');
  }
  
  /**
   * Check if the service is initialized
   * 
   * @returns True if the service is initialized with an MCP server
   */
  isInitialized(): boolean {
    return this.mcpServer !== null && this.connection !== null;
  }
  
  /**
   * List all available tools
   * 
   * @returns Array of tool names and descriptions
   */
  async listTools(): Promise<ToolDescription[]> {
    if (!this.mcpServer) {
      throw new Error('Tool service not initialized');
    }
    
    try {
      // Get tool definitions using internal properties for now
      // This is a workaround until the MCP SDK provides a proper API
      const mcpServerAny = this.mcpServer as any;
      
      // MCP SDK might use different property names depending on version
      // Try common property names where tools might be stored
      const toolRegistry = mcpServerAny._toolRegistry || 
                           mcpServerAny.toolRegistry || 
                           mcpServerAny.tools || 
                           mcpServerAny._tools || 
                           {};
      
      let tools: ToolDescription[] = [];
      
      // Add tools from registry if available
      if (toolRegistry && Object.keys(toolRegistry).length > 0) {
        logger.info('Found tool registry with keys:', Object.keys(toolRegistry));
        
        tools = Object.entries(toolRegistry).map(([name, toolInfo]) => {
          const toolInfoAny = toolInfo as any;
          return {
            name,
            description: toolInfoAny.description || 
                        (toolInfoAny.schema && toolInfoAny.schema.description) || 
                        `Tool: ${name}`
          };
        });
        
        logger.info(`Retrieved ${tools.length} tools from registry`);
      } else {
        logger.warn('Tool registry not found or empty in MCP server');
        
        // Log MCP server properties for debugging
        logger.debug('MCP server properties:', 
          Object.keys(mcpServerAny).filter(key => !key.startsWith('_')));
      }
      
      // Add direct implementation tools
      const directTools: ToolDescription[] = [
        { name: 'getBalance', description: 'Get SOL balance for an address' },
        { name: 'getTokenBalances', description: 'Get token balances for an address' },
        { name: 'getTransaction', description: 'Get transaction details' },
        { name: 'getAccountInfo', description: 'Get account information' },
        { name: 'networkStatus', description: 'Get Solana network status information' },
        { name: 'sendSolToUser', description: 'Send SOL from one social account to another, creating a wallet if needed' },
        { name: 'sendTokenToUser', description: 'Send tokens from one social account to another, creating a wallet if needed' },
        { name: 'sendSolSecure', description: 'Send SOL securely using the wallet service' },
        { name: 'sendTokenSecure', description: 'Send SPL tokens securely using the wallet service' },
      ];
      
      // Add any direct tools that aren't already in the registry
      const existingToolNames = new Set(tools.map(tool => tool.name));
      for (const directTool of directTools) {
        if (!existingToolNames.has(directTool.name)) {
          tools.push({ 
            ...directTool,
            description: `[DIRECT IMPL] ${directTool.description}`
          });
          existingToolNames.add(directTool.name);
          logger.info(`Added direct implementation for tool: ${directTool.name}`);
        }
      }
      
      return tools;
    } catch (error) {
      logger.error('Error listing tools', { error });
      // Provide fallback tools even on error
      logger.info('Using fallback hardcoded tool list after error');
      return [
        { name: 'getBalance', description: 'Get SOL balance for an address' },
        { name: 'getTokenBalances', description: 'Get token balances for an address' },
        { name: 'getTransaction', description: 'Get transaction details' },
        { name: 'getAccountInfo', description: 'Get account information' },
        { name: 'networkStatus', description: 'Get Solana network status information' },
        { name: 'sendSolToUser', description: 'Send SOL from one social account to another, creating a wallet if needed' },
        { name: 'sendTokenToUser', description: 'Send tokens from one social account to another, creating a wallet if needed' },
        { name: 'sendSolSecure', description: 'Send SOL securely using the wallet service' },
        { name: 'sendTokenSecure', description: 'Send SPL tokens securely using the wallet service' },
      ];
    }
  }

  /**
   * Get balance of a Solana wallet address
   * 
   * @param address Solana wallet address
   * @returns Balance in SOL and lamports
   */
  async getWalletBalance(address: string): Promise<{ sol: number; lamports: number }> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }
    
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return {
        sol: balance / 1000000000, // Convert lamports to SOL
        lamports: balance
      };
    } catch (error) {
      throw new Error(`Failed to get wallet balance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get token balances for a Solana wallet address
   * 
   * @param address Solana wallet address
   * @returns Array of token accounts and balances
   */
  async getTokenBalances(address: string): Promise<any[]> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }
    
    try {
      const publicKey = new PublicKey(address);
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') } // TOKEN_PROGRAM_ID
      );
      
      return tokenAccounts.value.map(account => {
        const parsedInfo = account.account.data.parsed.info;
        return {
          mint: parsedInfo.mint,
          tokenAddress: account.pubkey.toString(),
          amount: parsedInfo.tokenAmount.uiAmount,
          decimals: parsedInfo.tokenAmount.decimals
        };
      });
    } catch (error) {
      throw new Error(`Failed to get token balances: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get transaction information by signature
   * 
   * @param signature Transaction signature
   * @returns Transaction information
   */
  async getTransaction(signature: string): Promise<TransactionInfo> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }
    
    try {
      const transaction = await this.connection.getTransaction(signature);
      if (!transaction) {
        throw new Error(`Transaction not found: ${signature}`);
      }
      
      // Ensure fee is always a number
      const fee: number = typeof transaction.meta?.fee === 'number' ? transaction.meta.fee : 0;
      
      return {
        signature,
        status: transaction.meta?.err ? 'error' : 'success',
        blockTime: transaction.blockTime || undefined,
        fee,
        details: {
          accounts: transaction.transaction.message.accountKeys.map(key => key.toString()),
          instructions: transaction.transaction.message.instructions,
          logs: transaction.meta?.logMessages || []
        }
      };
    } catch (error) {
      throw new Error(`Failed to get transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get account information by address
   * 
   * @param address Solana account address
   * @returns Account information
   */
  async getAccountInfo(address: string): Promise<AccountInfo> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }
    
    try {
      const publicKey = new PublicKey(address);
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      
      if (!accountInfo) {
        throw new Error(`Account not found: ${address}`);
      }
      
      return {
        address,
        lamports: accountInfo.lamports,
        owner: accountInfo.owner.toString(),
        executable: accountInfo.executable,
        rentEpoch: accountInfo.rentEpoch || 0, // Ensure rentEpoch is a number
        data: accountInfo.data
      };
    } catch (error) {
      throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send SOL from one wallet to another securely using the wallet service
   * 
   * @param fromWalletPublicKey Public key of the sender's wallet
   * @param toAddress Recipient address
   * @param amount Amount of SOL to send
   * @param walletService The wallet service to use for signing
   * @returns Transaction signature
   */
  async sendSolSecure(
    fromWalletPublicKey: string,
    toAddress: string,
    amount: number,
    walletService: SimpleWalletManager
  ): Promise<string> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }
    
    try {
      // Convert string addresses to PublicKey objects
      const fromPublicKey = new PublicKey(fromWalletPublicKey);
      const toPublicKey = new PublicKey(toAddress);
      
      // Validate amount
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      
      // Convert SOL to lamports
      const lamports = Math.round(amount * 1_000_000_000);
      
      // Create a new transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromPublicKey,
          toPubkey: toPublicKey,
          lamports
        })
      );
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(fromWalletPublicKey);
      
      // Sign the transaction with the user's wallet using the new method
      const signedTransaction = await walletService.signWalletTransaction(
        fromWalletPublicKey,
        transaction
      );
      
      // Send the transaction
      const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
      
      // Wait for confirmation
      await this.connection.confirmTransaction(signature);
      
      logger.info('SOL transaction sent successfully', {
        from: fromWalletPublicKey,
        to: toAddress,
        amount,
        signature
      });
      
      return signature;
    } catch (error) {
      logger.error('Failed to send SOL', {
        fromWalletPublicKey,
        toAddress,
        amount,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error
      });
      
      throw new Error(`Failed to send SOL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send SPL tokens from one account to another using TransferInstruction
   * 
   * @param fromPrivateKey Private key of sender (base58 encoded)
   * @param toAddress Recipient address
   * @param tokenMint Token mint address
   * @param amount Amount of tokens
   * @param decimals Token decimals
   * @returns Transaction signature
   */
  async sendToken(
    fromPrivateKey: string, 
    toAddress: string, 
    tokenMint: string,
    amount: number,
    decimals: number
  ): Promise<string> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }
    
    try {
      // Since we don't use @solana/spl-token directly, we need to implement the token transfer
      // using raw instructions from @solana/web3.js
      
      // Create a keypair from the private key
      const secretKey = bs58.decode(fromPrivateKey);
      const fromKeypair = Keypair.fromSecretKey(secretKey);
      const fromPublicKey = fromKeypair.publicKey;
      const toPublicKey = new PublicKey(toAddress);
      const mintPublicKey = new PublicKey(tokenMint);
      
      // Get associated token accounts manually
      // This is a simpler approach where we just assume the associated token accounts already exist
      // For a production app, you'd want to check if they exist and create them if they don't
      
      // TOKEN_PROGRAM_ID
      const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      
      // Fetch the sender's token accounts to find the right one
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        fromPublicKey,
        { mint: mintPublicKey }
      );
      
      if (tokenAccounts.value.length === 0) {
        throw new Error(`No token account found for mint ${tokenMint}`);
      }
      
      // Get the sender's token account for this mint
      const fromTokenAccount = tokenAccounts.value[0].pubkey;
      
      // Find or derive the recipient's associated token account
      // For simplicity, we're fetching existing accounts. In a real app, you might need to create it.
      const recipientTokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        toPublicKey,
        { mint: mintPublicKey }
      );
      
      let toTokenAccount;
      if (recipientTokenAccounts.value.length > 0) {
        toTokenAccount = recipientTokenAccounts.value[0].pubkey;
      } else {
        throw new Error(`Recipient does not have a token account for mint ${tokenMint}`);
      }
      
      // Adjust amount based on decimals
      const adjustedAmount = Math.floor(amount * Math.pow(10, decimals));
      
      // Convert adjustedAmount to a Buffer correctly
      // First convert to a BigInt and then to a Buffer with little endian
      const amountBuffer = Buffer.alloc(8); // 8 bytes for a u64
      amountBuffer.writeBigUInt64LE(BigInt(adjustedAmount), 0);
      
      // Create a transfer instruction
      const instruction = {
        programId: tokenProgramId,
        keys: [
          { pubkey: fromTokenAccount, isSigner: false, isWritable: true },
          { pubkey: toTokenAccount, isSigner: false, isWritable: true },
          { pubkey: fromPublicKey, isSigner: true, isWritable: false }
        ],
        data: Buffer.from([3, ...new Uint8Array(amountBuffer)]) // 3 is the instruction code for Transfer
      };
      
      // Create and sign transaction
      const transaction = new Transaction().add(instruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [fromKeypair]
      );
      
      return signature;
    } catch (error) {
      throw new Error(`Failed to send token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Execute an MCP tool with parameters
   * 
   * @param toolName Name of the tool to execute
   * @param params Parameters to pass to the tool
   * @returns Result of the tool execution
   */
  async executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolExecutionResult> {
    if (!this.mcpServer) {
      logger.error('Tool service not initialized');
      return {
        content: [{ type: 'text', text: 'Tool service not initialized' }],
        isError: true
      };
    }
    
    try {
      logger.info(`Executing tool ${toolName} with params`, { toolName, params });
      
      // Access the server's internal registry
      const mcpServerAny = this.mcpServer as any;
      
      // MCP SDK might use different property names depending on version
      const toolRegistry = mcpServerAny._toolRegistry || 
                           mcpServerAny.toolRegistry || 
                           mcpServerAny.tools || 
                           mcpServerAny._tools || 
                           {};
      
      // Check if the tool exists
      if (!toolRegistry || !toolRegistry[toolName]) {
        logger.warn(`Tool ${toolName} not found in registry, trying direct implementation`);
        
        // Fallback to direct implementation for known tools
        switch (toolName) {
          case 'getBalance':
            if (typeof params.walletAddress !== 'string') {
              return {
                content: [{ type: 'text', text: 'Missing or invalid walletAddress parameter' }],
                isError: true
              };
            }
            try {
              const balance = await this.getWalletBalance(params.walletAddress);
              return {
                content: [{ 
                  type: 'text', 
                  text: `Balance for ${params.walletAddress}: ${balance.sol} SOL (${balance.lamports} lamports)` 
                }]
              };
            } catch (error) {
              return handleToolError(error, toolName);
            }
            
          case 'getTokenBalances':
            if (typeof params.walletAddress !== 'string') {
              return {
                content: [{ type: 'text', text: 'Missing or invalid walletAddress parameter' }],
                isError: true
              };
            }
            try {
              const tokens = await this.getTokenBalances(params.walletAddress);
              if (tokens.length === 0) {
                return {
                  content: [{ type: 'text', text: `No token balances found for ${params.walletAddress}` }]
                };
              }
              return {
                content: [{ 
                  type: 'text', 
                  text: `Token balances for ${params.walletAddress}:\n${tokens.map(t => 
                    `${t.amount} of mint ${t.mint}`).join('\n')}` 
                }]
              };
            } catch (error) {
              return handleToolError(error, toolName);
            }
            
          case 'getTransaction':
            if (typeof params.signature !== 'string') {
              return {
                content: [{ type: 'text', text: 'Missing or invalid signature parameter' }],
                isError: true
              };
            }
            try {
              const txInfo = await this.getTransaction(params.signature);
              return {
                content: [{ 
                  type: 'text', 
                  text: `Transaction ${params.signature}:\nStatus: ${txInfo.status}\nFee: ${txInfo.fee} lamports\nBlock time: ${txInfo.blockTime || 'unknown'}` 
                }]
              };
            } catch (error) {
              return handleToolError(error, toolName);
            }
            
          case 'getAccountInfo':
            if (typeof params.address !== 'string') {
              return {
                content: [{ type: 'text', text: 'Missing or invalid address parameter' }],
                isError: true
              };
            }
            try {
              const accountInfo = await this.getAccountInfo(params.address);
              return {
                content: [{ 
                  type: 'text', 
                  text: `Account ${params.address}:\nBalance: ${accountInfo.lamports / LAMPORTS_PER_SOL} SOL\nOwner: ${accountInfo.owner}\nExecutable: ${accountInfo.executable}` 
                }]
              };
            } catch (error) {
              return handleToolError(error, toolName);
            }
            
          case 'sendSolToUser':
            try {
              // Log incoming parameters for debugging
              logger.info(`sendSolToUser called with params:`, { params });
              
              // Expected parameters
              const expectedParams = ['senderPlatform', 'senderPlatformId', 'recipientPlatform', 'recipientPlatformId', 'amount'];
              
              // Log detailed parameter diagnostics
              const diagnostics = diagnosticParameters(expectedParams, params);
              logger.info(`Parameter diagnostics for sendSolToUser:\n${diagnostics}`);
              
              // Validate parameters
              const senderPlatform = params.senderPlatform as string;
              const senderPlatformId = params.senderPlatformId as string;
              const recipientPlatform = params.recipientPlatform as string;
              const recipientPlatformId = params.recipientPlatformId as string;
              const amount = params.amount as number;
              
              if (!senderPlatform || !senderPlatformId || !recipientPlatform || !recipientPlatformId || typeof amount !== 'number') {
                logger.error(`Invalid parameters for sendSolToUser:`, { params });
                return {
                  content: [{ 
                    type: 'text', 
                    text: `Missing or invalid parameters for sendSolToUser. Required: senderPlatform, senderPlatformId, recipientPlatform, recipientPlatformId, amount\n\nDiagnostics:\n${diagnostics}` 
                  }],
                  isError: true
                };
              }
              
              // Get the walletService - We need this for the actual implementation
              const { walletService } = await import('./wallet-service.js');
              
              // Check sender wallet
              const senderWallet = await walletService.getWalletBySocialAccount(senderPlatform, senderPlatformId);
              if (!senderWallet) {
                logger.error(`No wallet found for sender:`, { senderPlatform, senderPlatformId });
                return {
                  content: [{ type: 'text', text: `No wallet found for sender ${senderPlatform}:${senderPlatformId}` }],
                  isError: true
                };
              }
              
              // Check recipient wallet - create if it doesn't exist
              let recipientWallet = await walletService.getWalletBySocialAccount(recipientPlatform, recipientPlatformId);
              let walletCreated = false;
              
              if (!recipientWallet) {
                logger.info(`Creating new wallet for recipient:`, { recipientPlatform, recipientPlatformId });
                recipientWallet = await walletService.createWallet(
                  recipientPlatform, 
                  recipientPlatformId, 
                  `${recipientPlatform}-${recipientPlatformId}`
                );
                walletCreated = true;
                logger.info(`Created new wallet ${recipientWallet.publicKey} for ${recipientPlatform}:${recipientPlatformId}`);
              }
              
              // Call sendSolSecure
              logger.info(`Sending SOL:`, { 
                from: senderWallet.publicKey, 
                to: recipientWallet.publicKey, 
                amount 
              });
              
              const signature = await this.sendSolSecure(
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
              
              logger.info(`SOL transfer completed:`, { signature, walletCreated });
              
              return {
                content: [{ type: 'text', text: responseText }]
              };
            } catch (error) {
              logger.error(`Error in sendSolToUser:`, { error: error instanceof Error ? error.message : error });
              return handleToolError(error, toolName);
            }
            
          case 'sendTokenToUser':
            try {
              // Log incoming parameters for debugging
              logger.info(`sendTokenToUser called with params:`, { params });
              
              // Expected parameters
              const expectedParams = ['senderPlatform', 'senderPlatformId', 'recipientPlatform', 'recipientPlatformId', 'tokenMint', 'amount', 'decimals'];
              
              // Log detailed parameter diagnostics
              const diagnostics = diagnosticParameters(expectedParams, params);
              logger.info(`Parameter diagnostics for sendTokenToUser:\n${diagnostics}`);
              
              // Validate parameters
              const senderPlatform = params.senderPlatform as string;
              const senderPlatformId = params.senderPlatformId as string;
              const recipientPlatform = params.recipientPlatform as string;
              const recipientPlatformId = params.recipientPlatformId as string;
              const tokenMint = params.tokenMint as string;
              const amount = params.amount as number;
              const decimals = params.decimals as number;
              
              if (!senderPlatform || !senderPlatformId || !recipientPlatform || !recipientPlatformId || 
                  !tokenMint || typeof amount !== 'number' || typeof decimals !== 'number') {
                logger.error(`Invalid parameters for sendTokenToUser:`, { params });
                return {
                  content: [{ 
                    type: 'text', 
                    text: `Missing or invalid parameters for sendTokenToUser. Required: senderPlatform, senderPlatformId, recipientPlatform, recipientPlatformId, tokenMint, amount, decimals\n\nDiagnostics:\n${diagnostics}` 
                  }],
                  isError: true
                };
              }
              
              // Get the walletService - We need this for the actual implementation
              const { walletService } = await import('./wallet-service.js');
              
              // Check sender wallet
              const senderWallet = await walletService.getWalletBySocialAccount(senderPlatform, senderPlatformId);
              if (!senderWallet) {
                logger.error(`No wallet found for sender:`, { senderPlatform, senderPlatformId });
                return {
                  content: [{ type: 'text', text: `No wallet found for sender ${senderPlatform}:${senderPlatformId}` }],
                  isError: true
                };
              }
              
              // Check recipient wallet - create if it doesn't exist
              let recipientWallet = await walletService.getWalletBySocialAccount(recipientPlatform, recipientPlatformId);
              let walletCreated = false;
              
              if (!recipientWallet) {
                logger.info(`Creating new wallet for recipient:`, { recipientPlatform, recipientPlatformId });
                recipientWallet = await walletService.createWallet(
                  recipientPlatform, 
                  recipientPlatformId, 
                  `${recipientPlatform}-${recipientPlatformId}`
                );
                walletCreated = true;
                logger.info(`Created new wallet ${recipientWallet.publicKey} for ${recipientPlatform}:${recipientPlatformId}`);
              }
              
              // Call sendTokenSecure
              logger.info(`Sending token:`, { 
                from: senderWallet.publicKey, 
                to: recipientWallet.publicKey, 
                tokenMint,
                amount,
                decimals
              });
              
              const signature = await this.sendTokenSecure(
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
              
              logger.info(`Token transfer completed:`, { signature, walletCreated });
              
              return {
                content: [{ type: 'text', text: responseText }]
              };
            } catch (error) {
              logger.error(`Error in sendTokenToUser:`, { error: error instanceof Error ? error.message : error });
              return handleToolError(error, toolName);
            }
            
          case 'networkStatus':
            try {
              // Check if connection is established
              if (!this.connection) {
                throw new Error('Connection not initialized');
              }

              // Get network health
              let health = 'unknown';
              try {
                // Use getVersion() instead of getHealth() which doesn't exist
                await this.connection.getVersion();
                health = 'okay';
              } catch (e) {
                health = 'down';
              }

              // Get epoch info
              try {
                const epochInfo = await this.connection.getEpochInfo();
                
                const status = {
                  health,
                  currentEpoch: epochInfo.epoch.toString(),
                  blockHeight: epochInfo.blockHeight?.toString() || 'unknown',
                  currentSlot: epochInfo.absoluteSlot.toString(),
                };

                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(status, null, 2),
                    },
                  ],
                };
              } catch (error) {
                logger.error('Error getting epoch info:', error);
                throw new Error(`Failed to get network status: ${error instanceof Error ? error.message : String(error)}`);
              }
            } catch (error) {
              logger.error('Error in networkStatus tool:', error);
              return handleToolError(error, toolName);
            }
            
          default:
            // Log available tools for debugging
            const availableTools = toolRegistry ? Object.keys(toolRegistry) : [];
            logger.debug('Available tools:', availableTools);
            
            return {
              content: [{ type: 'text', text: `Tool ${toolName} not found or not implemented directly. Available tools in registry: ${availableTools.join(', ')}` }],
              isError: true
            };
        }
      }
      
      // Get the tool handler
      const toolInfo = toolRegistry[toolName];
      
      if (typeof toolInfo.handler !== 'function') {
        logger.error(`Tool ${toolName} handler is not a function`);
        return {
          content: [{ type: 'text', text: `Tool ${toolName} is not properly defined` }],
          isError: true
        };
      }
      
      // Execute the tool handler directly
      // Note: We're bypassing the normal MCP call mechanism here
      const result = await toolInfo.handler(params);
      
      logger.info(`Tool ${toolName} executed successfully`);
      return result;
    } catch (error) {
      return handleToolError(error, toolName);
    }
  }

  /**
   * Send SPL tokens from one account to another securely using the wallet service
   * 
   * @param fromWalletPublicKey Public key of the sender's wallet
   * @param toAddress Recipient address
   * @param tokenMint Token mint address
   * @param amount Amount of tokens
   * @param decimals Token decimals
   * @param walletService The wallet service to use for signing
   * @returns Transaction signature
   */
  async sendTokenSecure(
    fromWalletPublicKey: string, 
    toAddress: string, 
    tokenMint: string,
    amount: number,
    decimals: number,
    walletService: SimpleWalletManager
  ): Promise<string> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }
    
    try {
      // Convert addresses to PublicKey objects
      const fromPublicKey = new PublicKey(fromWalletPublicKey);
      const toPublicKey = new PublicKey(toAddress);
      const mintPublicKey = new PublicKey(tokenMint);
      
      // TOKEN_PROGRAM_ID
      const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      
      // Fetch the sender's token accounts to find the right one
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        fromPublicKey,
        { mint: mintPublicKey }
      );
      
      if (tokenAccounts.value.length === 0) {
        throw new Error(`No token account found for mint ${tokenMint}`);
      }
      
      // Get the sender's token account for this mint
      const fromTokenAccount = tokenAccounts.value[0].pubkey;
      
      // Find or derive the recipient's associated token account
      const recipientTokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        toPublicKey,
        { mint: mintPublicKey }
      );
      
      let toTokenAccount;
      if (recipientTokenAccounts.value.length > 0) {
        toTokenAccount = recipientTokenAccounts.value[0].pubkey;
      } else {
        throw new Error(`Recipient does not have a token account for mint ${tokenMint}`);
      }
      
      // Adjust amount based on decimals
      const adjustedAmount = Math.floor(amount * Math.pow(10, decimals));
      
      // Convert adjustedAmount to a Buffer correctly
      const amountBuffer = Buffer.alloc(8); // 8 bytes for a u64
      amountBuffer.writeBigUInt64LE(BigInt(adjustedAmount), 0);
      
      // Create a transfer instruction
      const instruction = {
        programId: tokenProgramId,
        keys: [
          { pubkey: fromTokenAccount, isSigner: false, isWritable: true },
          { pubkey: toTokenAccount, isSigner: false, isWritable: true },
          { pubkey: fromPublicKey, isSigner: true, isWritable: false }
        ],
        data: Buffer.from([3, ...new Uint8Array(amountBuffer)]) // 3 is the instruction code for Transfer
      };
      
      // Create transaction
      const transaction = new Transaction().add(instruction);
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPublicKey;
      
      // Sign the transaction using the wallet service
      const signedTransaction = await walletService.signWalletTransaction(
        fromWalletPublicKey,
        transaction
      );
      
      // Send the transaction
      const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
      
      // Wait for confirmation
      await this.connection.confirmTransaction(signature);
      
      logger.info('Token transaction sent successfully', {
        from: fromWalletPublicKey,
        to: toAddress,
        tokenMint,
        amount,
        signature
      });
      
      return signature;
    } catch (error) {
      logger.error('Failed to send token', {
        fromWalletPublicKey,
        toAddress,
        tokenMint,
        amount,
        decimals,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error
      });
      
      throw new Error(`Failed to send token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Create a singleton instance
export const toolService = new ToolService();

// Send SOL securely for a user wallet
export async function sendSolSecure(
  walletPublicKey: string,
  recipientAddress: string,
  amount: number,
  walletService: SimpleWalletManager
): Promise<string> {
  try {
    // Create connection to Solana network
    const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');
    
    // Create transaction
    const transaction = new Transaction();
    
    // Get wallet public key
    const fromPubkey = new PublicKey(walletPublicKey);
    const toPubkey = new PublicKey(recipientAddress);
    
    // Add transfer instruction
    transaction.add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: amount * LAMPORTS_PER_SOL
      })
    );
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;
    
    // Sign transaction with wallet's private key (securely through wallet service)
    const signedTransaction = await walletService.signWalletTransaction(
      walletPublicKey,
      transaction
    );
    
    // Send and confirm transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    await connection.confirmTransaction(signature, 'confirmed');
    
    logger.info(`Transaction sent successfully`, { signature, amount, recipient: recipientAddress });
    return signature;
  } catch (error) {
    logger.error('Error sending SOL securely', {
      error: error instanceof Error ? error.message : String(error),
      walletPublicKey,
      recipient: recipientAddress,
      amount
    });
    throw error;
  }
} 