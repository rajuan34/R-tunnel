import React, { useState } from 'react';
import { Radio, Menu, X, ExternalLink, ArrowRight, ShieldCheck, Plus, Terminal } from 'lucide-react';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenContact: () => void;
  isAuthenticated: boolean;
  onLogout?: () => void;
  activeTunnelCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPath,
  onNavigate,
  onOpenContact,
  isAuthenticated,
  onLogout,
  activeTunnelCount = 0,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Documentation', path: '/docs' },
  ];

  const handleLinkClick = (path: string) => {
    onNavigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#060910]/95 backdrop-blur-none border-b border-slate-800/90 text-slate-100 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        {/* Brand */}
        <div
          onClick={() => handleLinkClick('/')}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none group shrink-0"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-indigo-500 via-indigo-600 to-cyan-500 flex items-center justify-center text-white font-extrabold text-sm sm:text-base shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform">
            R
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-extrabold text-white text-sm sm:text-base tracking-tight leading-none">
                R-Tunnel
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-800/40 text-cyan-400">
                v1.0
              </span>
            </div>
            <div className="text-[9px] sm:text-[10px] text-slate-400 font-mono tracking-wider uppercase mt-0.5">
              Edge Control Plane
            </div>
          </div>
        </div>

        {/* Desktop Nav Links (PC / Tablet >= 768px) */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = currentPath === link.path;
            return (
              <button
                key={link.path}
                onClick={() => handleLinkClick(link.path)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-white bg-slate-800 font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-850'
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Right CTA Actions for Desktop (PC) */}
        <div className="hidden sm:flex items-center gap-3">
          {/* Active Tunnels Indicator Badge */}
          <div
            onClick={() => handleLinkClick('/dashboard')}
            className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-900/80 border border-slate-800 px-2.5 py-1.5 rounded-lg cursor-pointer hover:border-slate-700 transition-colors"
            title="Active Tunnels"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                activeTunnelCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="font-mono font-bold text-white">{activeTunnelCount}</span>
            <span className="text-slate-400 text-[11px]">live</span>
          </div>

          {/* Requested button: "contact the dev to create your account" */}
          <button
            type="button"
            onClick={onOpenContact}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-cyan-500/40 text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/60 hover:text-white hover:border-cyan-400 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span className="whitespace-nowrap">Contact Dev for Account</span>
          </button>

          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleLinkClick('/dashboard')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-sm active:scale-95"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Sign Out
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => handleLinkClick('/login')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-all border border-slate-700 active:scale-95"
            >
              <span>Sign In</span>
            </button>
          )}
        </div>

        {/* Mobile Header Bar Actions (Mobile Phone < 640px) */}
        <div className="flex sm:hidden items-center gap-2">
          {/* Quick status pill on mobile */}
          <div
            onClick={() => handleLinkClick('/dashboard')}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 cursor-pointer"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                activeTunnelCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span>{activeTunnelCount}</span>
          </div>

          {/* Quick contact button on mobile */}
          <button
            onClick={onOpenContact}
            className="p-1.5 text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 rounded-lg"
            title="Contact Developer"
            aria-label="Contact Developer"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>

          {/* Hamburger Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer (Smooth, Accessible & Fully Featured) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800/90 bg-[#070b14] px-4 pt-3 pb-6 space-y-2 animate-in slide-in-from-top-2 duration-150">
          <div className="space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => handleLinkClick(link.path)}
                className={`flex items-center justify-between w-full px-3.5 py-3 rounded-lg text-sm font-medium transition-colors ${
                  currentPath === link.path
                    ? 'text-white bg-indigo-600/30 border border-indigo-500/40 font-bold'
                    : 'text-slate-300 hover:bg-slate-850 hover:text-white'
                }`}
              >
                <span>{link.label}</span>
                {currentPath === link.path && (
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded">
                    Current
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
            {/* Prominently requested button for mobile */}
            <button
              onClick={() => {
                onOpenContact();
                setMobileMenuOpen(false);
              }}
              className="w-full py-3 px-3 rounded-lg text-xs font-semibold text-center border border-cyan-500/50 text-cyan-300 bg-cyan-950/50 hover:bg-cyan-900/70 flex items-center justify-center gap-2 shadow-sm"
            >
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>contact the dev to create your account</span>
            </button>

            {isAuthenticated ? (
              <div className="flex gap-2">
                <button
                  onClick={() => handleLinkClick('/dashboard')}
                  className="flex-1 py-3 px-3 rounded-lg text-xs font-bold text-center bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5"
                >
                  <span>Open Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                {onLogout && (
                  <button
                    onClick={() => {
                      onLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="py-3 px-4 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-850 border border-slate-800"
                  >
                    Logout
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => handleLinkClick('/login')}
                className="w-full py-3 px-3 rounded-lg text-xs font-bold text-center bg-slate-850 hover:bg-slate-800 text-white border border-slate-750"
              >
                Sign In to Dashboard
              </button>
            )}

            {/* Mobile Footer Credit inside Drawer */}
            <div className="pt-2 text-center text-[11px] text-slate-500">
              © Copyright by <strong className="text-slate-300">RAJUAN</strong> ·{' '}
              <a
                href="https://RAJUAN.is-a.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 underline underline-offset-2"
              >
                RAJUAN.is-a.dev
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
