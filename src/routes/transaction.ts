/**
 * Transaction Routes
 * 
 * API endpoints for working with transaction history
 * All routes require authentication via API key
 */

import express, { Router } from 'express';
import { transactionService } from '../services/transaction-service.js';
import { walletService } from '../services/wallet-service.js';
import { requireApiKey } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router: Router = express.Router();

// Apply API key authentication to all routes
router.use(requireApiKey);

/**
 * Get a specific transaction by signature
 * GET /transaction/:signature
 */
router.get('/:signature', async (req, res, next) => {
  try {
    const { signature } = req.params;

    if (!signature) {
      throw new ApiError(400, 'Transaction signature is required');
    }

    // Initialize transaction service if not already
    if (!transactionService.isInitialized()) {
      await transactionService.initialize();
    }

    // Get transaction by signature
    const transaction = await transactionService.getTransactionBySignature(signature);

    if (!transaction) {
      throw new ApiError(404, 'Transaction not found');
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Record a new transaction
 * POST /transaction
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      signature,
      senderWalletId,
      recipientAddress,
      amount,
      tokenMint,
      tokenSymbol,
      status = 'pending'
    } = req.body;

    // Validate required fields
    if (!signature) {
      throw new ApiError(400, 'Transaction signature is required');
    }
    if (!senderWalletId) {
      throw new ApiError(400, 'Sender wallet ID is required');
    }
    if (!recipientAddress) {
      throw new ApiError(400, 'Recipient address is required');
    }
    if (amount === undefined || amount === null) {
      throw new ApiError(400, 'Transaction amount is required');
    }

    // Initialize transaction service if not already
    if (!transactionService.isInitialized()) {
      await transactionService.initialize();
    }

    // Record the transaction
    const transaction = await transactionService.recordTransaction({
      signature,
      sender_wallet_id: senderWalletId,
      recipient_address: recipientAddress,
      amount,
      token_mint: tokenMint,
      token_symbol: tokenSymbol,
      status
    });

    res.status(201).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update transaction status
 * PATCH /transaction/:signature/status
 */
router.patch('/:signature/status', async (req, res, next) => {
  try {
    const { signature } = req.params;
    const { status, blockTime, fee } = req.body;

    if (!signature) {
      throw new ApiError(400, 'Transaction signature is required');
    }
    if (!status || !['pending', 'confirmed', 'failed'].includes(status)) {
      throw new ApiError(400, 'Valid status (pending, confirmed, failed) is required');
    }

    // Initialize transaction service if not already
    if (!transactionService.isInitialized()) {
      await transactionService.initialize();
    }

    // Update transaction status
    const success = await transactionService.updateTransactionStatus(
      signature,
      status,
      blockTime,
      fee
    );

    if (!success) {
      throw new ApiError(404, 'Transaction not found');
    }

    res.json({
      success: true,
      message: `Transaction status updated to ${status}`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get transactions for a wallet by public key
 * GET /transaction/wallet/:publicKey
 */
router.get('/wallet/:publicKey', async (req, res, next) => {
  try {
    const { publicKey } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    if (!publicKey) {
      throw new ApiError(400, 'Wallet public key is required');
    }

    // Initialize services if not already
    if (!walletService.isInitialized()) {
      await walletService.initialize();
    }
    if (!transactionService.isInitialized()) {
      await transactionService.initialize();
    }

    // Get wallet by public key
    const wallet = await walletService.getWalletByPublicKey(publicKey);
    
    if (!wallet) {
      throw new ApiError(404, 'Wallet not found');
    }

    // Get transactions for wallet
    const transactions = await transactionService.getTransactionsForWallet(wallet.id, limit, offset);
    const count = await transactionService.getTransactionCountForWallet(wallet.id);

    res.json({
      success: true,
      data: {
        transactions,
        count,
        limit,
        offset
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router; 