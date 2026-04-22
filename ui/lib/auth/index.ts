// Auth module exports

// Database operations
export {
  getAuthDb,
  ensureAuthTables,
  createUser,
  getUserByEmail,
  getUserById,
  updateUserPassword,
  updateUserEmailVerified,
  updateUserStripeCustomerId,
  updateUserManualPremium,
  getUserByStripeCustomerId,
  createSubscription,
  getSubscriptionByStripeId,
  getActiveSubscriptionByUserId,
  updateSubscription,
  getAllUsers,
  searchUsers,
  getUserCount,
  getUserCreditAccount,
  getUserCreditBalance,
  grantUserCredits,
  consumeUserCredits,
  getUserCreditTransactions,
  type User,
  type Session,
  type Subscription,
  type AuthToken,
  type UserCreditAccount,
  type UserCreditTransaction,
  type UserWithSubscription,
} from './db';

// Password utilities
export {
  hashPassword,
  verifyPassword,
  validatePassword,
  validateEmail,
} from './password';

// Session management
export {
  createSession,
  getSession,
  deleteSession,
  cleanupSessions,
  type SessionUser,
} from './session';

// Token management
export {
  createAuthToken,
  validateToken,
  consumeToken,
  cleanupTokens,
  buildMagicLinkUrl,
  buildPasswordResetUrl,
  buildEmailVerifyUrl,
} from './tokens';

// Middleware
export {
  getCurrentUser,
  requireAuth,
  requirePremium,
  requireAdmin,
  checkPremium,
  checkAdmin,
  type AuthUser,
} from './middleware';

// Email
export {
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendWelcomeEmail,
} from './email';

// Client context
export {
  AuthProvider,
  useAuth,
  usePremium,
  useAdmin,
  type ClientUser,
} from './context';
