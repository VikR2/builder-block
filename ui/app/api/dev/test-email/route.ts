import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

// Test endpoint: GET /api/dev/test-email?to=your@email.com
export async function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get('to');

  if (!to) {
    return NextResponse.json({
      error: 'Missing "to" parameter',
      usage: '/api/dev/test-email?to=your@email.com'
    }, { status: 400 });
  }

  // Check env vars
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  if (!apiKey) {
    return NextResponse.json({
      error: 'RESEND_API_KEY not set',
      env: {
        RESEND_API_KEY: apiKey ? 'SET (hidden)' : 'NOT SET',
        EMAIL_FROM: fromEmail
      }
    }, { status: 500 });
  }

  try {
    const resend = new Resend(apiKey);

    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject: 'Test Email from TCM',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h1 style="color: #f59e0b;">Test Email</h1>
          <p>If you're seeing this, Resend is working correctly!</p>
          <p>Sent at: ${new Date().toISOString()}</p>
        </div>
      `
    });

    return NextResponse.json({
      success: true,
      result,
      config: {
        from: fromEmail,
        to,
        apiKeyPrefix: apiKey.substring(0, 10) + '...'
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      config: {
        from: fromEmail,
        to,
        apiKeyPrefix: apiKey.substring(0, 10) + '...'
      }
    }, { status: 500 });
  }
}
