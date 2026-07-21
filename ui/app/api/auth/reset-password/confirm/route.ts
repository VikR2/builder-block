import { NextRequest, NextResponse } from 'next/server';
import {
  validateToken,
  consumeToken,
  updateUserPassword,
  hashPassword,
  validatePassword,
  createSession,
} from '@/lib/auth';
import { deleteUserSessions as dbDeleteUserSessions } from '@/lib/auth/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'Reset token is required' },
        { status: 400 }
      );
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    // Validate token
    const authToken = validateToken(token, 'password_reset');

    if (!authToken) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link. Please request a new one.' },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await hashPassword(password);

    // Update password
    updateUserPassword(authToken.user_id, passwordHash);

    // Mark token as used
    consumeToken(token);

    // Invalidate all existing sessions for security
    dbDeleteUserSessions(authToken.user_id);

    // Create new session
    await createSession(authToken.user_id);

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    console.error('Password reset confirm error:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
