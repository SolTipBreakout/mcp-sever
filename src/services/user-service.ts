/**
 * User Service
 * 
 * Service that handles user-related operations by wrapping wallet-service functionality.
 * Provides methods for getting, creating, and linking user wallets.
 */

import { walletService, WalletInfo, SocialAccount as WalletServiceSocialAccount } from './wallet-service.js';
import { transactionService } from './transaction-service.js';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { SERVER_CONFIG, AUTH_CONFIG } from '../config/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { Database, UserProfile, SocialAccount as DatabaseSocialAccount } from '../database/index.js';

interface User {
  id: string;
  email: string;
  apiKey: string;
  createdAt: Date;
}

/**
 * Simple in-memory user service
 * In a real implementation, this would use a database
 */
class UserService {
  private users: Map<string, User> = new Map();
  private usersByApiKey: Map<string, User> = new Map();
  private initialized = false;
  private db: Database;
  
  constructor() {
    this.db = new Database();
  }

  /**
   * Initialize the user service
   */
  async initialize(): Promise<boolean> {
    try {
      if (AUTH_CONFIG.apiKeys && AUTH_CONFIG.apiKeys.length > 0) {
        // Create default admin users for each configured API key
        for (const apiKey of AUTH_CONFIG.apiKeys) {
          const userId = randomUUID();
          const email = `admin-${userId.substring(0, 6)}@example.com`;
          
          const user: User = {
            id: userId,
            email,
            apiKey,
            createdAt: new Date()
          };
          
          this.users.set(userId, user);
          this.usersByApiKey.set(apiKey, user);
        }
      }

      this.initialized = true;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Authenticate a user by API key
   */
  getUserByApiKey(apiKey: string): User | null {
    return this.usersByApiKey.get(apiKey) || null;
  }

  /**
   * Get a user by ID
   */
  getUserById(id: string): User | null {
    return this.users.get(id) || null;
  }

  /**
   * Create a new user
   */
  createUser(email: string): User {
    // Generate a unique ID and API key
    const id = randomUUID();
    const apiKey = this.generateApiKey();
    
    const user: User = {
      id,
      email,
      apiKey,
      createdAt: new Date()
    };
    
    this.users.set(id, user);
    this.usersByApiKey.set(apiKey, user);
    
    return user;
  }

  /**
   * Generate a secure API key
   */
  private generateApiKey(): string {
    const bytes = randomBytes(32);
    return createHash('sha256')
      .update(bytes)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Validate an API key
   */
  validateApiKey(apiKey: string): boolean {
    return this.usersByApiKey.has(apiKey);
  }

  /**
   * Get a user's wallet by platform and platformId
   * @param platform Platform (twitter, telegram, discord)
   * @param platformId User's unique ID on the platform
   * @returns Wallet info or null if not found
   */
  async getUserWallet(platform: string, platformId: string): Promise<WalletInfo | null> {
    try {
      if (!walletService.isInitialized()) {
        await walletService.initialize();
      }
      
      return await walletService.getWalletBySocialAccount(platform, platformId);
    } catch (error) {
      return null;
    }
  }

  /**
   * Create a new wallet for a user
   * @param platform Platform (twitter, telegram, discord)
   * @param platformId User's unique ID on the platform
   * @param label Optional label for the wallet
   * @returns Newly created wallet info
   */
  async createUserWallet(platform: string, platformId: string, label?: string): Promise<WalletInfo> {
    try {
      if (!walletService.isInitialized()) {
        await walletService.initialize();
      }
      
      return await walletService.createWallet(platform, platformId, label);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get or create a wallet for a user
   * @param platform Platform (twitter, telegram, discord) 
   * @param platformId User's unique ID on the platform
   * @param label Optional label for the wallet if creating new one
   * @returns WalletInfo object
   */
  async getOrCreateUserWallet(platform: string, platformId: string, label?: string): Promise<WalletInfo> {
    const existingWallet = await this.getUserWallet(platform, platformId);
    
    if (existingWallet) {
      return existingWallet;
    }
    
    return await this.createUserWallet(platform, platformId, label || `${platform}-${platformId}`);
  }

  /**
   * Link a social account to an existing wallet
   * @param platform Platform (twitter, telegram, discord)
   * @param platformId User's unique ID on the platform
   * @param walletPublicKey Public key of the wallet to link
   * @returns Updated wallet info
   */
  async linkAccountToWallet(platform: string, platformId: string, walletPublicKey: string): Promise<WalletInfo> {
    try {
      if (!walletService.isInitialized()) {
        await walletService.initialize();
      }
      
      return await walletService.linkSocialAccountToWallet(platform, platformId, walletPublicKey);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Unlink a social account from its wallet
   * @param platform Platform (twitter, telegram, discord)
   * @param platformId User's unique ID on the platform
   * @returns true if successful, false otherwise
   */
  async unlinkAccount(platform: string, platformId: string): Promise<boolean> {
    try {
      if (!walletService.isInitialized()) {
        await walletService.initialize();
      }
      
      return await walletService.unlinkSocialAccount(platform, platformId);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get a complete user profile with wallet and social accounts
   * @param platform Platform (twitter, telegram, discord)
   * @param platformId User's unique ID on the platform
   * @returns Complete user profile or null if not found
   */
  async getUserProfileBySocialAccount(platform: string, platformId: string): Promise<UserProfile | null> {
    try {
      if (!this.db.isConnected()) {
        await this.db.connect();
      }
      
      // Get the wallet associated with this social account
      const wallet = await walletService.getWalletBySocialAccount(platform, platformId);
      
      if (!wallet) {
        return null;
      }
      
      // Get all social accounts linked to this wallet
      const walletSocialAccounts = await walletService.getSocialAccountsForWallet(wallet.publicKey);
      
      // Transform to database format
      const socialAccounts: DatabaseSocialAccount[] = walletSocialAccounts.map(account => ({
        platform: account.platform as 'twitter' | 'telegram' | 'discord',
        platform_id: account.platformId,
        wallet_id: account.walletId,
        created_at: account.createdAt
      }));
      
      // Get recent transactions for this wallet
      const transactions = await transactionService.getTransactionsForWallet(wallet.id, 5, 0);
      
      return {
        wallets: [{
          id: wallet.id,
          public_key: wallet.publicKey,
          is_custodial: wallet.isCustodial,
          label: wallet.label,
          created_at: wallet.createdAt,
          updated_at: wallet.updatedAt
        }],
        socialAccounts,
        transactions
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a user profile by wallet address
   * @param walletAddress Wallet public key
   * @returns Complete user profile or null if not found
   */
  async getUserProfileByWalletAddress(walletAddress: string): Promise<UserProfile | null> {
    try {
      if (!this.db.isConnected()) {
        await this.db.connect();
      }
      
      // Get wallet by public key
      const wallet = await walletService.getWalletByPublicKey(walletAddress);
      
      if (!wallet) {
        return null;
      }
      
      // Get all social accounts linked to this wallet
      const walletSocialAccounts = await walletService.getSocialAccountsForWallet(walletAddress);
      
      // Transform to database format
      const socialAccounts: DatabaseSocialAccount[] = walletSocialAccounts.map(account => ({
        platform: account.platform as 'twitter' | 'telegram' | 'discord',
        platform_id: account.platformId,
        wallet_id: account.walletId,
        created_at: account.createdAt
      }));
      
      // Get recent transactions for this wallet
      const transactions = await transactionService.getTransactionsForWallet(wallet.id, 5, 0);
      
      return {
        wallets: [{
          id: wallet.id,
          public_key: wallet.publicKey,
          is_custodial: wallet.isCustodial,
          label: wallet.label,
          created_at: wallet.createdAt,
          updated_at: wallet.updatedAt
        }],
        socialAccounts,
        transactions
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all wallets for a user (across all social platforms)
   * @param userId User ID (typically email or platform-specific ID)
   * @returns Array of wallets
   */
  async getAllUserWallets(userId: string): Promise<WalletInfo[]> {
    try {
      if (!walletService.isInitialized()) {
        await walletService.initialize();
      }
      
      // This is a simplified approach - in a real implementation,
      // we would need to query by user ID across platforms
      const user = this.getUserById(userId);
      if (!user) {
        return [];
      }
      
      // For now, just return wallets associated with the user's email domain
      // This is a placeholder implementation
      const emailDomain = user.email.split('@')[1];
      return await walletService.getAllWallets();
    } catch (error) {
      return [];
    }
  }
}

// Create a singleton instance
export const userService = new UserService(); 