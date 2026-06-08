'use client';

import { useState, useRef, useEffect } from 'react';
import { X, UserPlus, Mail, Crown, Loader2, Check, AlertCircle, Shield } from 'lucide-react';

interface AddUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: (user: User) => void;
}

interface User {
  id: number;
  email: string;
  emailVerified: boolean;
  role: string;
  manualPremium: boolean;
  hasPaidSubscription: boolean;
  subscriptionStatus: string | null;
  subscriptionEnd: string | null;
  isPremium: boolean;
  createdAt: string;
  updatedAt: string;
}

export function AddUserDialog({ isOpen, onClose, onUserCreated }: AddUserDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [grantPremium, setGrantPremium] = useState(false);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ user: User; emailSent: boolean; emailError?: string } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setRole('user');
      setGrantPremium(false);
      setSendWelcome(true);
      setError(null);
      setSuccess(null);
      // Focus email input after a brief delay for animation
      setTimeout(() => emailInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, grantPremium, sendWelcome })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to create user');
        return;
      }

      setSuccess({
        user: data.user,
        emailSent: data.emailSent,
        emailError: data.emailError
      });

      // Notify parent after brief success display
      setTimeout(() => {
        onUserCreated(data.user);
        onClose();
      }, 1500);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md mx-4 bg-card border rounded-2xl shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <UserPlus className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Add New User</h2>
              <p className="text-sm text-muted-foreground">Manually create a user account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        {success ? (
          <div className="p-6">
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                <Check className="h-6 w-6 text-emerald-500" />
              </div>
              <h3 className="text-lg font-medium mb-2">User Created Successfully</h3>
              <p className="text-muted-foreground mb-4">{success.user.email}</p>

              {success.emailError ? (
                <div className="flex items-center gap-2 text-sm text-amber-500">
                  <AlertCircle className="h-4 w-4" />
                  <span>Welcome email failed: {success.emailError}</span>
                </div>
              ) : success.emailSent ? (
                <div className="flex items-center gap-2 text-sm text-emerald-500">
                  <Mail className="h-4 w-4" />
                  <span>Welcome email sent</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Email Input */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  ref={emailInputRef}
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Role Selector */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('user')}
                disabled={isSubmitting}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  role === 'user'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                    : 'bg-muted/30 hover:bg-muted'
                } disabled:opacity-50`}
              >
                <UserPlus className="h-4 w-4" />
                User
              </button>
              <button
                type="button"
                onClick={() => setRole('admin')}
                disabled={isSubmitting}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  role === 'admin'
                    ? 'border-rose-500 bg-rose-500/10 text-rose-500'
                    : 'bg-muted/30 hover:bg-muted'
                } disabled:opacity-50`}
              >
                <Shield className="h-4 w-4" />
                Admin
              </button>
            </div>

            {/* Premium Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${grantPremium ? 'bg-amber-500/20' : 'bg-muted'}`}>
                  <Crown className={`h-4 w-4 ${grantPremium ? 'text-amber-500' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="font-medium text-sm">Grant Premium Access</p>
                  <p className="text-xs text-muted-foreground">Give this user free premium access</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGrantPremium(!grantPremium)}
                disabled={isSubmitting}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                  grantPremium ? 'bg-amber-500' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                    grantPremium ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Welcome Email Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${sendWelcome ? 'bg-sky-500/20' : 'bg-muted'}`}>
                  <Mail className={`h-4 w-4 ${sendWelcome ? 'text-sky-500' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="font-medium text-sm">Send Welcome Email</p>
                  <p className="text-xs text-muted-foreground">Notify user about their new account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSendWelcome(!sendWelcome)}
                disabled={isSubmitting}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                  sendWelcome ? 'bg-sky-500' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                    sendWelcome ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 text-rose-500 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2.5 rounded-lg border font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !email}
                className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 text-background font-medium hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Create User
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
