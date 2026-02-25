import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { postSetup } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface FieldErrors {
  username?: string;
  password?: string;
  confirmPassword?: string;
}

export function SetupPage() {
  const navigate = useNavigate();
  const setupComplete = useAuthStore((s) => s.setupComplete);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState('');
  const [alreadyComplete, setAlreadyComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }
    if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    return errors;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError('');
    setAlreadyComplete(false);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await postSetup(username, password);
      setupComplete();
      navigate('/login');
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'already_complete') {
          setAlreadyComplete(true);
        } else if (err.message === 'setup_failed') {
          const details = (
            err as Error & { details?: { error?: string; details?: Record<string, string[]> } }
          ).details;
          if (details?.details) {
            const apiErrors: FieldErrors = {};
            if (details.details.username) apiErrors.username = details.details.username[0];
            if (details.details.password) apiErrors.password = details.details.password[0];
            setFieldErrors(apiErrors);
          } else {
            setGeneralError(details?.error ?? 'Setup failed. Please try again.');
          }
        } else {
          setGeneralError('An unexpected error occurred. Please try again.');
        }
      } else {
        setGeneralError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (alreadyComplete) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-balance">Dinner Planner</h1>
          </div>
          <div className="bg-card p-6 rounded-lg border space-y-4 text-center">
            <p className="text-sm text-muted-foreground text-pretty">
              Setup already completed. Please log in.
            </p>
            <Link
              to="/login"
              className="inline-block py-2 px-4 bg-primary text-primary-foreground rounded-md
                         font-medium hover:bg-primary/90 transition-colors"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-balance">Dinner Planner</h1>
          <p className="text-muted-foreground mt-2 text-pretty">
            Create your admin account to get started
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card p-6 rounded-lg border space-y-4"
          noValidate
        >
          {generalError && (
            <div role="alert" className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {generalError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-describedby={fieldErrors.username ? 'username-error' : undefined}
              aria-invalid={!!fieldErrors.username}
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground
                         focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="At least 3 characters"
              autoComplete="username"
              autoFocus
            />
            {fieldErrors.username && (
              <p id="username-error" role="alert" className="text-destructive text-xs mt-1">
                {fieldErrors.username}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              aria-invalid={!!fieldErrors.password}
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground
                         focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            {fieldErrors.password && (
              <p id="password-error" role="alert" className="text-destructive text-xs mt-1">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-describedby={fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined}
              aria-invalid={!!fieldErrors.confirmPassword}
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground
                         focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Repeat your password"
              autoComplete="new-password"
            />
            {fieldErrors.confirmPassword && (
              <p id="confirmPassword-error" role="alert" className="text-destructive text-xs mt-1">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md
                       font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {isSubmitting ? 'Creating account...' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
