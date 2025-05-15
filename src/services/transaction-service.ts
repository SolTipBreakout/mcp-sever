/**
 * Transaction Service
 * 
 * Handles operations related to transaction history and tracking.
 * Works with the database to store and retrieve transaction data.
 */

import { Database, TransactionRecord } from '../database/index.js';
import { logger } from '../utils/logger.js';

/**
 * Service for managing transaction records
 */
class TransactionService {
  private db: Database;
  private initialized = false;

  constructor() {
    this.db = new Database();
  }

  /**
   * Initialize the transaction service
   */
  async initialize(): Promise<boolean> {
    try {
      const dbConnected = await this.db.connect();
      
      if (dbConnected) {
        this.initialized = true;
        logger.info('Transaction service initialized successfully');
        return true;
      }
      
      logger.error('Failed to connect to database for transaction service');
      return false;
    } catch (error) {
      logger.error('Error initializing transaction service', { error });
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
   * Record a new transaction in the database
   * 
   * @param transactionData Transaction data to record
   * @returns The recorded transaction
   */
  async recordTransaction(transactionData: TransactionRecord): Promise<TransactionRecord> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      return await this.db.recordTransaction(transactionData);
    } catch (error) {
      logger.error('Error recording transaction', { 
        signature: transactionData.signature,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Update the status of a transaction
   * 
   * @param signature Transaction signature
   * @param status New status (pending, confirmed, failed)
   * @param blockTime Optional block time
   * @param fee Optional transaction fee
   * @returns Whether the update was successful
   */
  async updateTransactionStatus(
    signature: string, 
    status: 'pending' | 'confirmed' | 'failed',
    blockTime?: number,
    fee?: number
  ): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      return await this.db.updateTransactionStatus(signature, status, blockTime, fee);
    } catch (error) {
      logger.error('Error updating transaction status', { 
        signature,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get a transaction by its signature
   * 
   * @param signature Transaction signature
   * @returns Transaction record or null if not found
   */
  async getTransactionBySignature(signature: string): Promise<TransactionRecord | null> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      return await this.db.getTransactionBySignature(signature);
    } catch (error) {
      logger.error('Error retrieving transaction by signature', { 
        signature,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get transactions for a specific wallet
   * 
   * @param walletId Wallet ID
   * @param limit Maximum number of transactions to return (default: 10)
   * @param offset Offset for pagination (default: 0)
   * @returns Array of transaction records
   */
  async getTransactionsForWallet(
    walletId: number, 
    limit: number = 10, 
    offset: number = 0
  ): Promise<TransactionRecord[]> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      return await this.db.getTransactionsForWallet(walletId, limit, offset);
    } catch (error) {
      logger.error('Error retrieving transactions for wallet', { 
        walletId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get transaction count for a wallet
   * 
   * @param walletId Wallet ID
   * @returns Count of transactions
   */
  async getTransactionCountForWallet(walletId: number): Promise<number> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      return await this.db.getTransactionCountForWallet(walletId);
    } catch (error) {
      logger.error('Error retrieving transaction count for wallet', { 
        walletId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

// Export singleton instance
export const transactionService = new TransactionService(); 