import express, { Router } from 'express';
import { apiKeyAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { userService } from '../services/user-service.js';
import { walletService } from '../services/wallet-service.js';
import { transactionService } from '../services/transaction-service.js';

export const userRoutes: Router = express.Router();

// All user routes require authentication
userRoutes.use(apiKeyAuth());

/**
 * @route GET /user/profile
 * @desc Get user profile information
 */
userRoutes.get('/profile', async (req, res, next) => {
  try {
    const user = (req as any).user;
    
    if (!user) {
      throw new ApiError(401, 'Unauthorized - User not found');
    }
    
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /user/wallet/social
 * @desc Get wallet for a social platform account (Twitter, Telegram, Discord)
 */
userRoutes.get('/wallet/social', async (req, res, next) => {
  try {
    const { platform, platformId } = req.query;
    
    if (!platform || !platformId) {
      throw new ApiError(400, 'Platform and platformId are required');
    }
    
    // Initialize wallet service if needed
    if (!walletService.isInitialized()) {
      await walletService.initialize();
    }
    
    // Get wallet for the social account
    const wallet = await walletService.getWalletBySocialAccount(
      platform as string,
      platformId as string
    );
    
    if (!wallet) {
      throw new ApiError(404, 'Wallet not found for this social account');
    }
    
    res.json({
      success: true,
      data: wallet
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /user/wallet/get-or-create
 * @desc Get existing wallet for a social account or create a new one
 */
userRoutes.post('/wallet/get-or-create', async (req, res, next) => {
  try {
    const { platform, platformId, label } = req.body;
    
    if (!platform || !platformId) {
      throw new ApiError(400, 'Platform and platformId are required');
    }
    
    // Initialize user service if needed
    if (!userService.isInitialized()) {
      await userService.initialize();
    }
    
    // Get or create wallet
    const wallet = await userService.getOrCreateUserWallet(
      platform,
      platformId,
      label
    );
    
    res.json({
      success: true,
      data: wallet
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /user/wallet/link
 * @desc Link an existing wallet to a social platform account
 */
userRoutes.post('/wallet/link', async (req, res, next) => {
  try {
    const { platform, platformId, walletPublicKey } = req.body;
    
    if (!platform || !platformId || !walletPublicKey) {
      throw new ApiError(400, 'Platform, platformId, and walletPublicKey are required');
    }
    
    // Initialize user service if needed
    if (!userService.isInitialized()) {
      await userService.initialize();
    }
    
    // Link account to wallet
    const wallet = await userService.linkAccountToWallet(
      platform,
      platformId,
      walletPublicKey
    );
    
    res.json({
      success: true,
      data: wallet
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /user/wallets
 * @desc Get user wallets
 */
userRoutes.get('/wallets', async (req, res, next) => {
  try {
    const user = (req as any).user;
    
    if (!user) {
      throw new ApiError(401, 'Unauthorized - User not found');
    }
    
    // Initialize user service if needed
    if (!userService.isInitialized()) {
      await userService.initialize();
    }
    
    // Get all wallets for this user
    const wallets = await userService.getAllUserWallets(user.id);
    
    res.json({
      success: true,
      data: wallets
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /user/wallets
 * @desc Create a new wallet for user
 */
userRoutes.post('/wallets', async (req, res, next) => {
  try {
    const { platform, platformId, label } = req.body;
    
    if (!platform || !platformId) {
      throw new ApiError(400, 'Platform and platformId are required');
    }
    
    // Initialize user service if needed
    if (!userService.isInitialized()) {
      await userService.initialize();
    }
    
    // Create a new wallet
    const wallet = await userService.createUserWallet(
      platform,
      platformId,
      label
    );
    
    res.json({
      success: true,
      data: wallet
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /user/transactions/:walletAddress
 * @desc Get transaction history for a wallet
 */
userRoutes.get('/transactions/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    if (!walletAddress) {
      throw new ApiError(400, 'Wallet address is required');
    }

    // Initialize services
    if (!walletService.isInitialized()) {
      await walletService.initialize();
    }
    if (!transactionService.isInitialized()) {
      await transactionService.initialize();
    }

    // Get wallet by public key
    const wallet = await walletService.getWalletByPublicKey(walletAddress);
    
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

/**
 * @route GET /user/transaction/:signature
 * @desc Get details of a specific transaction
 */
userRoutes.get('/transaction/:signature', async (req, res, next) => {
  try {
    const { signature } = req.params;

    if (!signature) {
      throw new ApiError(400, 'Transaction signature is required');
    }

    // Initialize transaction service
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
 * @route GET /user/profile/social
 * @desc Get complete user profile with wallet, social accounts, and transaction history
 */
userRoutes.get('/profile/social', async (req, res, next) => {
  try {
    const { platform, platformId } = req.query;
    
    if (!platform || !platformId) {
      throw new ApiError(400, 'Platform and platformId are required');
    }
    
    // Initialize user service
    if (!userService.isInitialized()) {
      await userService.initialize();
    }
    
    // Get user profile
    const profile = await userService.getUserProfileBySocialAccount(
      platform as string,
      platformId as string
    );
    
    if (!profile) {
      throw new ApiError(404, 'User profile not found');
    }
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /user/social-accounts/:walletAddress
 * @desc Get all social accounts linked to a wallet
 */
userRoutes.get('/social-accounts/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    
    if (!walletAddress) {
      throw new ApiError(400, 'Wallet address is required');
    }
    
    // Initialize wallet service
    if (!walletService.isInitialized()) {
      await walletService.initialize();
    }
    
    // Get wallet by public key first to validate it exists
    const wallet = await walletService.getWalletByPublicKey(walletAddress);
    
    if (!wallet) {
      throw new ApiError(404, 'Wallet not found');
    }
    
    // Get social accounts for this wallet
    const socialAccounts = await walletService.getSocialAccountsForWallet(walletAddress);
    
    res.json({
      success: true,
      data: socialAccounts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /user/wallet/export-private-key
 * @desc Export encrypted private key for a wallet (requires authentication)
 */
userRoutes.post('/wallet/export-private-key', async (req, res, next) => {
  try {
    const { walletPublicKey } = req.body;
    
    if (!walletPublicKey) {
      throw new ApiError(400, 'Wallet public key is required');
    }
    
    // Initialize wallet service if needed
    if (!walletService.isInitialized()) {
      await walletService.initialize();
    }
    
    // Get wallet by public key first
    const wallet = await walletService.getWalletByPublicKey(walletPublicKey);
    
    if (!wallet) {
      throw new ApiError(404, 'Wallet not found');
    }
    
    // Check if wallet has an encrypted private key
    if (!wallet.encryptedPrivateKey) {
      throw new ApiError(400, 'No private key available for this wallet');
    }
    
    // Decrypt the private key
    const privateKey =  walletService.decryptPrivateKey(wallet.encryptedPrivateKey);
    
    res.json({
      success: true,
      data: {
        privateKey
      }
    });
  } catch (error) {
    next(error);
  }
}); 

/**
 * @route GET /user/profile/:walletAddress
 * @desc Get user profile by wallet address
 */
userRoutes.get('/profile/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    
    if (!walletAddress) {
      throw new ApiError(400, 'Wallet address is required');
    }
    
    const profile = await userService.getUserProfileByWalletAddress(walletAddress);
    
    if (!profile) {
      throw new ApiError(404, 'User profile not found, please create one');
    }
    
    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
});