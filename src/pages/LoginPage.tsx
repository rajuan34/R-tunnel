import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldCheck, ExternalLink, Key } from 'lucide-react';

interface LoginPageProps {
  onNavigate: (path: string) => void;
  onOpenContact: () => void;
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onNavigate,
  onOpenContact,
  onLoginSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (res.ok) {
        onLoginSuccess();
        onNavigate('/dashboard');
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Connection error authenticating with control plane');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 bg-[#070b14]">
      <div className="w-full max-w-md bg-[#0a0f1d] border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
            <Key className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">R-Tunnel Authentication</h1>
          <p className="text-xs text-slate-400">
            Sign in with your master control plane secret key to manage tunnels.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Master Admin Secret Key
            </label>
            <input
              type="password"
              placeholder="Enter master key..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800 text-center space-y-3">
          <p className="text-xs text-slate-400">
            Do not have an account or access token?
          </p>

          <button
            onClick={onOpenContact}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <span>contact the dev to create your account</span>
            <span aria-hidden="true">→</span>
          </button>

          <div className="pt-2 text-[11px] text-slate-500">
            Developer: <strong className="text-slate-400">RAJUAN</strong> ·{' '}
            <a
              href="https://RAJUAN.is-a.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:underline"
            >
              RAJUAN.is-a.dev
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
