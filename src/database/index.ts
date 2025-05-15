/**
 * Database Service
 * 
 * Provides secure database operations for wallet management
 * Handles encryption and decryption of sensitive data
 * Uses SQLite for persistent storage
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import sqlite3 from 'sqlite3';
import { open, Database as SQLiteDatabase } from 'sqlite';
import path from 'path';
import fs from 'fs';

// Database configuration from environment variables
const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || randomBytes(32).toString('hex');
const DB_PATH = process.env.DB_PATH || './data/wallet_db.sqlite';

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Social platform account interface
 */
export interface SocialAccount {
  platform: 'twitter' | 'telegram' | 'discord';
  platform_id: string;
  wallet_id: number;
  created_at?: string;
}

/**
 * Wallet data interface
 */
export interface WalletRecord {
  id?: number;
  public_key: string;
  is_custodial: boolean;
  label?: string;
  encrypted_private_key?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Transaction record interface
 */
export interface TransactionRecord {
  id?: number;
  signature: string;
  sender_wallet_id: number;
  recipient_wallet_id?: number;
  recipient_address: string;
  amount: number;
  token_mint?: string;
  token_symbol?: string;
  status: 'pending' | 'confirmed' | 'failed';
  created_at?: string;
  confirmed_at?: string;
  block_time?: number;
  fee?: number;
}

/**
 * User profile interface - aggregates information from wallets and social accounts
 */
export interface UserProfile {
  wallets: WalletRecord[];
  socialAccounts: SocialAccount[];
  transactions: TransactionRecord[];
}

/**
 * Database class for wallet storage with encryption support using SQLite
 */
export class Database {
  private connected: boolean = false;
  private db!: SQLiteDatabase;

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<boolean> {
    try {
      // Open SQLite database connection
      this.db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
      });

      // Create tables if they don't exist
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS wallets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          public_key TEXT UNIQUE NOT NULL,
          is_custodial BOOLEAN NOT NULL,
          label TEXT,
          encrypted_private_key TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS social_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          platform_id TEXT NOT NULL,
          wallet_id INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (wallet_id) REFERENCES wallets (id),
          UNIQUE (platform, platform_id)
        );
        
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          signature TEXT UNIQUE NOT NULL,
          sender_wallet_id INTEGER NOT NULL,
          recipient_wallet_id INTEGER,
          recipient_address TEXT NOT NULL,
          amount REAL NOT NULL,
          token_mint TEXT,
          token_symbol TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          confirmed_at TEXT,
          block_time INTEGER,
          fee INTEGER,
          FOREIGN KEY (sender_wallet_id) REFERENCES wallets (id),
          FOREIGN KEY (recipient_wallet_id) REFERENCES wallets (id)
        );
      `);

      this.connected = true;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create a wallet record
   * @param walletData Wallet data to store
   */
  async createWallet(walletData: WalletRecord): Promise<WalletRecord> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      // Encrypt private key if provided
      let encryptedKey = null;
      if (walletData.encrypted_private_key) {
        encryptedKey = this.encryptPrivateKey(walletData.encrypted_private_key);
      }

      // Add timestamps
      const now = new Date().toISOString();

      // Insert wallet into database
      const result = await this.db.run(
        `INSERT INTO wallets 
        (public_key, is_custodial, label, encrypted_private_key, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          walletData.public_key,
          walletData.is_custodial ? 1 : 0,
          walletData.label || null,
          encryptedKey,
          now,
          now
        ]
      );

      // Return the created wallet with id
      const createdWallet: WalletRecord = {
        id: result.lastID,
        ...walletData,
        encrypted_private_key: encryptedKey || undefined,
        created_at: now,
        updated_at: now
      };

      return createdWallet;
    } catch (error) {
      throw new Error(`Failed to create wallet in database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Link a social account to a wallet
   * @param platform The social platform
   * @param platformId The platform-specific ID
   * @param walletId The wallet ID to link to
   */
  async linkSocialAccount(platform: 'twitter' | 'telegram' | 'discord', platformId: string, walletId: number): Promise<void> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      const now = new Date().toISOString();

      // Check if this social account is already linked to a wallet
      const existingAccount = await this.db.get(
        'SELECT id FROM social_accounts WHERE platform = ? AND platform_id = ?',
        [platform, platformId]
      );

      if (existingAccount) {
        // Update existing link
        await this.db.run(
          'UPDATE social_accounts SET wallet_id = ? WHERE platform = ? AND platform_id = ?',
          [walletId, platform, platformId]
        );
      } else {
        // Create new link
        await this.db.run(
          'INSERT INTO social_accounts (platform, platform_id, wallet_id, created_at) VALUES (?, ?, ?, ?)',
          [platform, platformId, walletId, now]
        );
      }
    } catch (error) {
      throw new Error(`Failed to link social account to wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get wallet by public key
   * @param publicKey Wallet public key
   */
  async getWalletByPublicKey(publicKey: string): Promise<WalletRecord | null> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      const wallet = await this.db.get(
        'SELECT * FROM wallets WHERE public_key = ?',
        [publicKey]
      );

      if (!wallet) {
        return null;
      }

      // Convert boolean from SQLite integer
      wallet.is_custodial = !!wallet.is_custodial;

      return wallet as WalletRecord;
    } catch (error) {
      throw new Error(`Failed to retrieve wallet from database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a wallet by social account
   * @param platform The social platform
   * @param platformId The platform-specific ID
   */
  async getWalletBySocialAccount(platform: 'twitter' | 'telegram' | 'discord', platformId: string): Promise<WalletRecord | null> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      const wallet = await this.db.get(
        `SELECT w.* 
         FROM wallets w
         JOIN social_accounts sa ON w.id = sa.wallet_id
         WHERE sa.platform = ? AND sa.platform_id = ?`,
        [platform, platformId]
      );

      if (!wallet) {
        return null;
      }

      // Convert boolean from SQLite integer
      wallet.is_custodial = !!wallet.is_custodial;

      return wallet as WalletRecord;
    } catch (error) {
      throw new Error(`Failed to retrieve wallet for social account: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all social accounts linked to a wallet
   * @param walletId The wallet ID
   */
  async getSocialAccountsForWallet(walletId: number): Promise<SocialAccount[]> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      const accounts = await this.db.all(
        'SELECT platform, platform_id, created_at FROM social_accounts WHERE wallet_id = ?',
        [walletId]
      );

      return accounts as SocialAccount[];
    } catch (error) {
      throw new Error(`Failed to retrieve social accounts for wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update a wallet record
   * @param walletData Wallet data to update
   */
  async updateWallet(walletData: WalletRecord): Promise<WalletRecord> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      if (!walletData.id) {
        throw new Error('Wallet ID is required for update');
      }

      // Encrypt private key if provided
      let encryptedKey = undefined;
      if (walletData.encrypted_private_key) {
        encryptedKey = this.encryptPrivateKey(walletData.encrypted_private_key);
      }

      const now = new Date().toISOString();

      // Update the wallet
      await this.db.run(
        `UPDATE wallets 
         SET label = COALESCE(?, label),
             encrypted_private_key = COALESCE(?, encrypted_private_key),
             updated_at = ?
         WHERE id = ?`,
        [
          walletData.label,
          encryptedKey,
          now,
          walletData.id
        ]
      );

      // Get the updated wallet
      const updatedWallet = await this.db.get(
        'SELECT * FROM wallets WHERE id = ?',
        [walletData.id]
      );

      if (!updatedWallet) {
        throw new Error(`Wallet with ID ${walletData.id} not found after update`);
      }

      // Convert boolean from SQLite integer
      updatedWallet.is_custodial = !!updatedWallet.is_custodial;

      return updatedWallet as WalletRecord;
    } catch (error) {
      throw new Error(`Failed to update wallet in database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Record a new transaction
   * @param transactionData Transaction data to store
   */
  async recordTransaction(transactionData: TransactionRecord): Promise<TransactionRecord> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      // Add timestamps
      const now = new Date().toISOString();

      // Insert transaction into database
      const result = await this.db.run(
        `INSERT INTO transactions 
        (signature, sender_wallet_id, recipient_wallet_id, recipient_address, amount, token_mint, token_symbol, status, created_at, confirmed_at, block_time, fee) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionData.signature,
          transactionData.sender_wallet_id,
          transactionData.recipient_wallet_id || null,
          transactionData.recipient_address,
          transactionData.amount,
          transactionData.token_mint || null,
          transactionData.token_symbol || null,
          transactionData.status,
          now,
          transactionData.confirmed_at || null,
          transactionData.block_time || null,
          transactionData.fee || null
        ]
      );

      // Return the created transaction with id
      const createdTransaction: TransactionRecord = {
        id: result.lastID,
        ...transactionData,
        created_at: now
      };

      return createdTransaction;
    } catch (error) {
      throw new Error(`Failed to record transaction in database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update a transaction status
   * @param signature Transaction signature
   * @param status New status
   * @param blockTime Optional block time
   * @param fee Optional transaction fee
   */
  async updateTransactionStatus(signature: string, status: 'pending' | 'confirmed' | 'failed', blockTime?: number, fee?: number): Promise<boolean> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      const confirmedAt = status === 'confirmed' ? new Date().toISOString() : null;

      // Update the transaction
      const result = await this.db.run(
        `UPDATE transactions 
         SET status = ?, confirmed_at = ?, block_time = ?, fee = ?
         WHERE signature = ?`,
        [status, confirmedAt, blockTime || null, fee || null, signature]
      );

      return result.changes ? result.changes > 0 : false;
    } catch (error) {
      throw new Error(`Failed to update transaction status in database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get transaction by signature
   * @param signature Transaction signature
   */
  async getTransactionBySignature(signature: string): Promise<TransactionRecord | null> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      const transaction = await this.db.get(
        'SELECT * FROM transactions WHERE signature = ?',
        [signature]
      );

      return transaction as TransactionRecord | null;
    } catch (error) {
      throw new Error(`Failed to retrieve transaction from database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get transactions for a wallet (sent or received)
   * @param walletId Wallet ID
   * @param limit Maximum number of transactions to return
   * @param offset Offset for pagination
   */
  async getTransactionsForWallet(walletId: number, limit: number = 10, offset: number = 0): Promise<TransactionRecord[]> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      const transactions = await this.db.all(
        `SELECT * FROM transactions 
         WHERE sender_wallet_id = ? OR recipient_wallet_id = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [walletId, walletId, limit, offset]
      );

      return transactions as TransactionRecord[];
    } catch (error) {
      throw new Error(`Failed to retrieve transactions for wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get transaction count for a wallet
   * @param walletId Wallet ID
   */
  async getTransactionCountForWallet(walletId: number): Promise<number> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      const result = await this.db.get(
        `SELECT COUNT(*) as count FROM transactions 
         WHERE sender_wallet_id = ? OR recipient_wallet_id = ?`,
        [walletId, walletId]
      );

      return result ? result.count : 0;
    } catch (error) {
      throw new Error(`Failed to retrieve transaction count for wallet: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get user profile data including wallets, social accounts, and transactions
   * @param socialPlatform The social platform
   * @param platformId The platform-specific ID 
   */
  async getUserProfile(socialPlatform: 'twitter' | 'telegram' | 'discord', platformId: string): Promise<UserProfile | null> {
    try {
      if (!this.connected) {
        throw new Error('Database not connected');
      }

      // Find the social account
      const socialAccount = await this.db.get(
        'SELECT * FROM social_accounts WHERE platform = ? AND platform_id = ?',
        [socialPlatform, platformId]
      );

      if (!socialAccount) {
        return null;
      }

      // Get all wallets linked to this social identity (could be more than one)
      const wallets = await this.db.all(
        `SELECT w.* FROM wallets w
         JOIN social_accounts sa ON w.id = sa.wallet_id
         WHERE sa.platform_id = ?`,
        [platformId]
      );

      if (wallets.length === 0) {
        return null;
      }

      // Convert boolean from SQLite integer for each wallet
      const processedWallets = wallets.map(w => ({
        ...w,
        is_custodial: !!w.is_custodial
      })) as WalletRecord[];

      // Get all social accounts linked to these wallets
      const walletIds = wallets.map(w => w.id);
      const socialAccounts = await this.db.all(
        `SELECT * FROM social_accounts
         WHERE wallet_id IN (${walletIds.map(() => '?').join(',')})`,
        walletIds
      ) as SocialAccount[];

      // Get transactions for these wallets (limited to most recent 20)
      const transactions = await this.db.all(
        `SELECT * FROM transactions
         WHERE sender_wallet_id IN (${walletIds.map(() => '?').join(',')})
         OR recipient_wallet_id IN (${walletIds.map(() => '?').join(',')})
         ORDER BY created_at DESC LIMIT 20`,
        [...walletIds, ...walletIds]
      ) as TransactionRecord[];

      return {
        wallets: processedWallets,
        socialAccounts,
        transactions
      };
    } catch (error) {
      throw new Error(`Failed to retrieve user profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decrypt a private key
   * @param encryptedPrivateKey Encrypted private key
   */
  async decryptPrivateKey(encryptedPrivateKey: string): Promise<string> {
    try {
      // Parse the stored data
      const [ivHex, encryptedData] = encryptedPrivateKey.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const encryptedBuffer = Buffer.from(encryptedData, 'hex');

      // Create decipher
      const decipher = createDecipheriv(
        'aes-256-cbc', 
        Buffer.from(DB_ENCRYPTION_KEY.slice(0, 32), 'hex'), 
        iv
      );

      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final()
      ]).toString();

      return decrypted;
    } catch (error) {
      throw new Error(`Failed to decrypt private key: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Encrypt a private key
   * @param privateKey Private key to encrypt
   */
  private encryptPrivateKey(privateKey: string): string {
    // Generate random IV
    const iv = randomBytes(16);
    
    // Create cipher
    const cipher = createCipheriv(
      'aes-256-cbc', 
      Buffer.from(DB_ENCRYPTION_KEY.slice(0, 32), 'hex'), 
      iv
    );
    
    // Encrypt
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(privateKey)),
      cipher.final()
    ]);
    
    // Return as iv:encryptedData format
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }
} 