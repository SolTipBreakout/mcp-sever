/**
 * Simple Wallet Service
 * 
 * Manages Solana wallets for users across Discord/Twitter/Telegram platforms.
 * Supports linking multiple social accounts to the same wallet.
 * For hackathon project with testnet funds only.
 */

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import * as crypto from 'crypto';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { SOLANA_CONFIG, DATABASE_CONFIG } from '../config/index.js';
import * as path from 'path';
import * as fs from 'fs';

// Database schemas
const WALLET_SCHEMA = `
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_key TEXT NOT NULL UNIQUE,
  is_custodial BOOLEAN NOT NULL DEFAULT TRUE,
  label TEXT,
  encrypted_private_key TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`;

const SOCIAL_ACCOUNT_SCHEMA = `
CREATE TABLE IF NOT EXISTS social_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  wallet_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id),
  UNIQUE(platform, platform_id)
)
`;

// Type definitions
export type SocialAccount = {
  id: number;
  platform: string;
  platformId: string;
  walletId: number;
  createdAt: string;
};

export type WalletInfo = {
  id: number;
  publicKey: string;
  isCustodial: boolean;
  label?: string;
  encryptedPrivateKey?: string;
  createdAt: string;
  updatedAt: string;
  socialAccounts: SocialAccount[];
};

/**
 * Simple Wallet Manager
 * 
 * Creates and manages wallets with support for multiple linked social accounts
 */
export class SimpleWalletManager {
  /**
   * Get all wallets associated with a user's platform ID
   * @param platformId Platform-specific user identifier
   * @returns Array of wallet information
   */
  async getWalletsForUser(platformId: string): Promise<WalletInfo[]> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }
    
    try {
      // Query social accounts linked to this platform ID from the database
      // This retrieves all platform accounts with this identifier
      // and then gets the corresponding wallets
      
      // Query social accounts for this platform ID
      const socialAccounts = await this.db.all(
        'SELECT * FROM social_accounts WHERE platform_id = ?',
        [platformId]
      );
      
      if (!socialAccounts || socialAccounts.length === 0) {
        return [];
      }
      
      // Get unique wallet IDs
      const walletIds = [...new Set(socialAccounts.map(account => account.wallet_id))];
      
      // Get wallet info for each wallet ID
      const wallets: WalletInfo[] = [];
      for (const walletId of walletIds) {
        const wallet = await this.getWalletById(walletId);
        wallets.push(wallet);
      }
      
      return wallets;
    } catch (error) {
      console.error('Error getting wallets for platform ID:', error);
      return [];
    }
  }
  
  /**
   * Create a new wallet for a user with a platform-specific identifier
   * @param platformId Platform-specific user identifier
   * @param label Optional label for the wallet
   * @returns The created wallet information
   */
  async createWalletForUser(platformId: string, label?: string): Promise<WalletInfo> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }
    
    try {
      // Create a new wallet and link it to this user
      // We use 'user' as the platform and the provided ID as the platformId
      return await this.createWallet('user', platformId, label || `Wallet for ${platformId}`);
    } catch (error) {
      throw new Error(`Failed to create wallet for user: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private serviceKeypair: Keypair | null = null;
  private initialized = false;
  private db: Database | null = null;
  private encryptionKey: string = '';
  private connection: Connection;
  
  constructor() {
    // Create connection to Solana network
    this.connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');
    // Set up encryption key from environment variable or config
    this.encryptionKey = SOLANA_CONFIG.encryptionKey || crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Initialize the wallet service
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('Starting wallet service initialization...');
      console.log(`Using database path: ${DATABASE_CONFIG.sqlitePath}`);
      
      // Create db directory if it doesn't exist
      const dbDir = path.dirname(DATABASE_CONFIG.sqlitePath);
      console.log(`Ensuring database directory exists: ${dbDir}`);
      if (!fs.existsSync(dbDir)) {
        console.log(`Creating database directory: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Initialize database
      console.log('Opening SQLite database connection...');
      
      // Explicitly pass the sqlite3.Database as the driver
      this.db = await open({
        filename: DATABASE_CONFIG.sqlitePath,
        driver: sqlite3.Database
      });
      
      console.log('Database connection established.');

      // Create tables if they don't exist
      console.log('Creating wallet schema if needed...');
      await this.db.exec(WALLET_SCHEMA);
      console.log('Creating social account schema if needed...');
      await this.db.exec(SOCIAL_ACCOUNT_SCHEMA);

      console.log('Wallet service initialization complete.');
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Wallet service initialization failed:', error);
      if (error instanceof Error && error.message.includes('driver is not defined')) {
        console.error('This is likely due to an issue with the SQLite driver.');
        console.error('Make sure sqlite3 is properly installed: npm install sqlite3 --save');
      }
      return false;
    }
  }
  
  /**
   * Check if the wallet service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Create a new wallet and link it to a social account
   */
  async createWallet(
    platform: string,
    platformId: string,
    label?: string
  ): Promise<WalletInfo> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }

    // Check if social account already exists
    const existingAccount = await this.db.get(
      'SELECT * FROM social_accounts WHERE platform = ? AND platform_id = ?',
      [platform, platformId]
    );

    if (existingAccount) {
      throw new Error(`Social account ${platform}:${platformId} already linked to a wallet`);
    }

    // Generate new keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const privateKey = bs58.encode(keypair.secretKey);

    // Encrypt private key
    const encryptedPrivateKey = this.encryptPrivateKey(privateKey);

    // Create wallet record in database
    const walletResult = await this.db.run(
      'INSERT INTO wallets (public_key, is_custodial, label, encrypted_private_key) VALUES (?, ?, ?, ?)',
      [publicKey, true, label || null, encryptedPrivateKey]
    );

    const walletId = walletResult.lastID;

    // Create social account record
    await this.db.run(
      'INSERT INTO social_accounts (platform, platform_id, wallet_id) VALUES (?, ?, ?)',
      [platform, platformId, walletId]
    );

    // Return wallet info
    return this.getWalletById(walletId!);
  }

  /**
   * Get a wallet by its database ID
   */
  private async getWalletById(walletId: number): Promise<WalletInfo> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }

    const wallet = await this.db.get('SELECT * FROM wallets WHERE id = ?', [walletId]);
    
    if (!wallet) {
      throw new Error(`Wallet with ID ${walletId} not found`);
    }

    const socialAccounts = await this.db.all(
      'SELECT * FROM social_accounts WHERE wallet_id = ?',
      [walletId]
    );

    return {
      id: wallet.id,
      publicKey: wallet.public_key,
      isCustodial: wallet.is_custodial === 1,
      label: wallet.label,
      encryptedPrivateKey: wallet.encrypted_private_key,
      createdAt: wallet.created_at,
      updatedAt: wallet.updated_at,
      socialAccounts: socialAccounts.map(account => ({
        id: account.id,
        platform: account.platform,
        platformId: account.platform_id,
        walletId: account.wallet_id,
        createdAt: account.created_at
      }))
    };
  }

  /**
   * Get a wallet by its public key
   * @param publicKey Wallet public key
   * @returns Wallet info or null if not found
   */
  async getWalletByPublicKey(publicKey: string): Promise<WalletInfo | null> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }
    
    try {
      // Get wallet by public key
      const wallet = await this.db.get(
        'SELECT * FROM wallets WHERE public_key = ?',
        [publicKey]
      );
      
      if (!wallet) {
        return null;
      }
      
      // Get all social accounts linked to this wallet
      const socialAccounts = await this.db.all(
        'SELECT * FROM social_accounts WHERE wallet_id = ?',
        [wallet.id]
      );
      
      // Transform to our expected format
      const socialAccountsFormatted: SocialAccount[] = socialAccounts.map(account => ({
        id: account.id,
        platform: account.platform,
        platformId: account.platform_id,
        walletId: account.wallet_id,
        createdAt: account.created_at
      }));
      
      return {
        id: wallet.id,
        publicKey: wallet.public_key,
        isCustodial: Boolean(wallet.is_custodial),
        label: wallet.label,
        encryptedPrivateKey: wallet.encrypted_private_key,
        createdAt: wallet.created_at,
        updatedAt: wallet.updated_at,
        socialAccounts: socialAccountsFormatted
      };
    } catch (error) {
      console.error('Error getting wallet by public key:', error);
      return null;
    }
  }

  /**
   * Get all social accounts linked to a wallet
   * @param publicKey Wallet public key
   * @returns Array of social accounts
   */
  async getSocialAccountsForWallet(publicKey: string): Promise<SocialAccount[]> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }
    
    try {
      // First get the wallet ID
      const wallet = await this.db.get(
        'SELECT id FROM wallets WHERE public_key = ?',
        [publicKey]
      );
      
      if (!wallet) {
        return [];
      }
      
      // Get all social accounts for this wallet
      const socialAccounts = await this.db.all(
        'SELECT * FROM social_accounts WHERE wallet_id = ?',
        [wallet.id]
      );
      
      // Transform to our expected format
      return socialAccounts.map(account => ({
        id: account.id,
        platform: account.platform,
        platformId: account.platform_id,
        walletId: account.wallet_id,
        createdAt: account.created_at
      }));
    } catch (error) {
      console.error('Error getting social accounts for wallet:', error);
      return [];
    }
  }
  
  /**
   * Get all wallets in the system
   * @returns Array of all wallet info objects
   */
  async getAllWallets(): Promise<WalletInfo[]> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }
    
    try {
      // Get all wallets
      const wallets = await this.db.all('SELECT * FROM wallets');
      
      // Get all social accounts for each wallet
      const result: WalletInfo[] = [];
      
      for (const wallet of wallets) {
        const socialAccounts = await this.db.all(
          'SELECT * FROM social_accounts WHERE wallet_id = ?',
          [wallet.id]
        );
        
        // Transform to our expected format
        const socialAccountsFormatted: SocialAccount[] = socialAccounts.map(account => ({
          id: account.id,
          platform: account.platform,
          platformId: account.platform_id,
          walletId: account.wallet_id,
          createdAt: account.created_at
        }));
        
        result.push({
          id: wallet.id,
          publicKey: wallet.public_key,
          isCustodial: Boolean(wallet.is_custodial),
          label: wallet.label,
          encryptedPrivateKey: wallet.encrypted_private_key,
          createdAt: wallet.created_at,
          updatedAt: wallet.updated_at,
          socialAccounts: socialAccountsFormatted
        });
      }
      
      return result;
    } catch (error) {
      console.error('Error getting all wallets:', error);
      return [];
    }
  }

  /**
   * Get a wallet by social account
   */
  async getWalletBySocialAccount(
    platform: string,
    platformId: string
  ): Promise<WalletInfo | null> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }

    try {
      const socialAccount = await this.db.get(
        'SELECT wallet_id FROM social_accounts WHERE platform = ? AND platform_id = ?',
        [platform, platformId]
      );

      if (!socialAccount) {
        return null;
      }

      return this.getWalletById(socialAccount.wallet_id);
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Link a social account to an existing wallet
   */
  async linkSocialAccountToWallet(
    platform: string,
    platformId: string,
    walletPublicKey: string
  ): Promise<WalletInfo> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }

    // Get wallet by public key
    const walletRecord = await this.db.get(
      'SELECT id FROM wallets WHERE public_key = ?',
      [walletPublicKey]
    );

    if (!walletRecord) {
      throw new Error(`Wallet with public key ${walletPublicKey} not found`);
    }

    // Check if social account already exists
    const existingAccount = await this.db.get(
      'SELECT * FROM social_accounts WHERE platform = ? AND platform_id = ?',
      [platform, platformId]
    );

    if (existingAccount) {
      throw new Error(`Social account ${platform}:${platformId} already linked to a wallet`);
    }

    // Link social account to wallet
    await this.db.run(
      'INSERT INTO social_accounts (platform, platform_id, wallet_id) VALUES (?, ?, ?)',
      [platform, platformId, walletRecord.id]
    );

    return this.getWalletById(walletRecord.id);
  }

  /**
   * Unlink a social account from a wallet
   */
  async unlinkSocialAccount(platform: string, platformId: string): Promise<boolean> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }

    const result = await this.db.run(
      'DELETE FROM social_accounts WHERE platform = ? AND platform_id = ?',
      [platform, platformId]
    );

    return result.changes ? result.changes > 0 : false;
  }

  /**
   * Sign a transaction using a wallet's private key
   */
  async signWalletTransaction(
    walletPublicKey: string,
    transaction: Transaction
  ): Promise<Transaction> {
    if (!this.initialized || !this.db) {
      throw new Error('Wallet service not initialized');
    }

    // Get wallet by public key
    const wallet = await this.db.get(
      'SELECT encrypted_private_key FROM wallets WHERE public_key = ?',
      [walletPublicKey]
    );

    if (!wallet || !wallet.encrypted_private_key) {
      throw new Error(`Cannot sign with wallet ${walletPublicKey}: wallet not found or no private key available`);
    }

    // Decrypt private key
    const privateKey = this.decryptPrivateKey(wallet.encrypted_private_key);
    
    // Create keypair from private key
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
    
    // Sign transaction
    transaction.sign(keypair);
    
    return transaction;
  }

  /**
   * Encrypt a private key
   */
  private encryptPrivateKey(privateKey: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey.slice(0, 32)),
      iv
    );
    
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a private key
   */
   decryptPrivateKey(encryptedPrivateKey: string): string {
    const [ivHex, encryptedHex] = encryptedPrivateKey.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey.slice(0, 32)),
      iv
    );
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Get the service keypair public key
   */
  getServicePublicKey(): string | null {
    return this.serviceKeypair ? this.serviceKeypair.publicKey.toString() : null;
  }
}

// Export singleton instance
export const walletService = new SimpleWalletManager(); 