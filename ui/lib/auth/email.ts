import { Resend } from 'resend';

// Lazy-load Resend client to avoid initialization errors when API key is missing
let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@example.com';
const APP_NAME = 'The Currency Merchant';

interface EmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send magic link email
 */
export async function sendMagicLinkEmail(
  to: string,
  magicLinkUrl: string
): Promise<EmailResult> {
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Sign in to ${APP_NAME}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a2e;">Sign in to ${APP_NAME}</h1>
          <p>Click the link below to sign in to your account. This link expires in 1 hour.</p>
          <a href="${magicLinkUrl}" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Sign In
          </a>
          <p style="color: #666; font-size: 14px;">
            If you didn't request this email, you can safely ignore it.
          </p>
          <p style="color: #666; font-size: 12px;">
            Or copy and paste this URL into your browser:<br>
            ${magicLinkUrl}
          </p>
        </div>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send magic link email:', error);
    return {
      success: false,
      error: 'Failed to send email. Please try again.'
    };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<EmailResult> {
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Reset your ${APP_NAME} password`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a2e;">Reset Your Password</h1>
          <p>You requested to reset your password. Click the link below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 14px;">
            If you didn't request this password reset, you can safely ignore this email.
          </p>
          <p style="color: #666; font-size: 12px;">
            Or copy and paste this URL into your browser:<br>
            ${resetUrl}
          </p>
        </div>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return {
      success: false,
      error: 'Failed to send email. Please try again.'
    };
  }
}

/**
 * Send email verification email
 */
export async function sendEmailVerificationEmail(
  to: string,
  verifyUrl: string
): Promise<EmailResult> {
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Verify your ${APP_NAME} email`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a2e;">Verify Your Email</h1>
          <p>Welcome to ${APP_NAME}! Please verify your email address by clicking the link below.</p>
          <a href="${verifyUrl}" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Verify Email
          </a>
          <p style="color: #666; font-size: 14px;">
            This link expires in 24 hours.
          </p>
          <p style="color: #666; font-size: 12px;">
            Or copy and paste this URL into your browser:<br>
            ${verifyUrl}
          </p>
        </div>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return {
      success: false,
      error: 'Failed to send email. Please try again.'
    };
  }
}

/**
 * Send welcome email after successful signup
 */
export async function sendWelcomeEmail(to: string): Promise<EmailResult> {
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Welcome to ${APP_NAME}!`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a2e;">Welcome to ${APP_NAME}!</h1>
          <p>Thank you for joining us. Your account has been created successfully.</p>
          <p>With ${APP_NAME}, you'll have access to:</p>
          <ul>
            <li>Trading video courses with synchronized transcripts</li>
            <li>Comprehensive skills library</li>
            <li>AI-powered Knowledge Bot</li>
            <li>Study guides and documentation</li>
          </ul>
          <p>Get started by exploring our content library!</p>
          <p style="color: #666; font-size: 14px;">
            If you have any questions, feel free to reach out to our support team.
          </p>
        </div>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return { success: false, error: 'Failed to send welcome email' };
  }
}
