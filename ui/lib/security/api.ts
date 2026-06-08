import { NextResponse } from 'next/server';
import { getCurrentUser, type AuthUser } from '@/lib/auth';

type GuardResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

type RateLimitOptions = {
  scope: string;
  limit: number;
  windowMs: number;
  identifier?: string | null;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

function getRequestOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (origin) {
    return origin;
  }

  const referer = request.headers.get('referer');
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins(request: Request): Set<string> {
  const allowed = new Set<string>([new URL(request.url).origin]);
  const configuredUrls = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
  ];

  for (const configuredUrl of configuredUrls) {
    if (!configuredUrl) {
      continue;
    }

    try {
      allowed.add(new URL(configuredUrl).origin);
    } catch {
      // Ignore malformed configuration here; deployment checks should catch it.
    }
  }

  return allowed;
}

export function requireSameOrigin(request: Request): NextResponse | null {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return null;
  }

  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin || !getAllowedOrigins(request).has(requestOrigin)) {
    return jsonError('Invalid request origin', 403);
  }

  return null;
}

export async function requireAdminApi(request?: Request): Promise<GuardResult> {
  if (request) {
    const originError = requireSameOrigin(request);
    if (originError) {
      return { ok: false, response: originError };
    }
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: jsonError('Authentication required', 401) };
  }

  if (!user.isAdmin) {
    return { ok: false, response: jsonError('Admin access required', 403) };
  }

  return { ok: true, user };
}

export async function requirePremiumApi(request?: Request): Promise<GuardResult> {
  if (request) {
    const originError = requireSameOrigin(request);
    if (originError) {
      return { ok: false, response: originError };
    }
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: jsonError('Authentication required', 401) };
  }

  if (!user.isPremium && !user.isAdmin) {
    return { ok: false, response: jsonError('Premium access required', 403) };
  }

  return { ok: true, user };
}

export function getClientRateLimitKey(request: Request, scope: string, identifier?: string | null): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwardedFor || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${identifier || ip}`;
}

export function enforceRateLimit(
  request: Request,
  options: RateLimitOptions
): NextResponse | null {
  const now = Date.now();
  const key = getClientRateLimitKey(request, options.scope, options.identifier);
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return null;
  }

  bucket.count += 1;

  if (bucket.count > options.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
        },
      }
    );
  }

  return null;
}
