import express, { Router } from 'express';
import { apiKeyAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { userService } from '../services/user-service.js';
import { walletService } from '../services/wallet-service.js';

export const userRoutes: Router = express.Router();

// All user routes require authentication
userRoutes.use(apiKeyAuth());

/**
 * @route GET /user/profile
 * @desc Get user profile information
 */
userRoutes.get('/profile', async (req, res, next) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      throw new ApiError(401, 'Unauthorized');
    }
    
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    res.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt
        }
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
      throw new ApiError(400, 'Missing required parameters: platform and platformId');
    }
    
    // Validate platform type
    if (!['twitter', 'telegram', 'discord', 'default'].includes(platform as string)) {
      throw new ApiError(400, 'Invalid platform. Must be one of: twitter, telegram, discord, default');
    }
    
    // Get the wallet associated with this social account
    const wallet = await walletService.getWalletBySocialAccount(
      platform as string,
      platformId as string
    );
    
    if (!wallet) {
      throw new ApiError(404, 'Wallet not found for this social account');
    }
    
    res.json({
      status: 'success',
      wallet: {
        publicKey: wallet.publicKey,
        isCustodial: wallet.isCustodial,
        label: wallet.label
      }
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
      throw new ApiError(400, 'Missing required parameters: platform and platformId');
    }
    
    // Validate platform type
    if (!['twitter', 'telegram', 'discord', 'default'].includes(platform)) {
      throw new ApiError(400, 'Invalid platform. Must be one of: twitter, telegram, discord, default');
    }
    
    // Check if wallet already exists for this social account
    let wallet = await walletService.getWalletBySocialAccount(platform, platformId);
    
    // If no wallet exists, create a new one
    if (!wallet) {
      try {
        wallet = await walletService.createWallet(
          platform,
          platformId,
          label || `${platform}-${platformId}`
        );
      } catch (error) {
        console.error('Error creating wallet:', error);
        throw new ApiError(500, 'Failed to create wallet');
      }
    }
    
    res.json({
      status: 'success',
      wallet: {
        publicKey: wallet.publicKey,
        isCustodial: wallet.isCustodial,
        label: wallet.label
      }
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
      throw new ApiError(400, 'Missing required parameters: platform, platformId, and walletPublicKey');
    }
    
    // Validate platform type
    if (!['twitter', 'telegram', 'discord', 'default'].includes(platform)) {
      throw new ApiError(400, 'Invalid platform. Must be one of: twitter, telegram, discord, default');
    }
    
    // Check if user already has a wallet linked to this platform account
    const existingWallet = await walletService.getWalletBySocialAccount(platform, platformId);
    if (existingWallet) {
      throw new ApiError(409, 'This social account is already linked to a wallet. Please unlink it first.');
    }
    
    // Link social account to the provided wallet
    try {
      const wallet = await walletService.linkSocialAccountToWallet(
        platform,
        platformId,
        walletPublicKey
      );
      
      res.json({
        status: 'success',
        message: 'Social account linked to wallet successfully',
        wallet: {
          publicKey: wallet.publicKey,
          isCustodial: wallet.isCustodial,
          label: wallet.label
        }
      });
    } catch (error) {
      console.error('Error linking wallet:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        throw new ApiError(404, 'Wallet not found with the provided public key');
      }
      throw new ApiError(500, 'Failed to link social account to wallet');
    }
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
    const userId = (req as any).userId;
    if (!userId) {
      throw new ApiError(401, 'Unauthorized');
    }
    
    const wallets = await walletService.getWalletsForUser(userId);
    
    res.json({
      status: 'success',
      data: { wallets }
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
    const userId = (req as any).userId;
    if (!userId) {
      throw new ApiError(401, 'Unauthorized');
    }
    
    const wallet = await walletService.createWalletForUser(userId);
    
    res.status(201).json({
      status: 'success',
      data: { wallet }
    });
  } catch (error) {
    next(error);
  }
}); 