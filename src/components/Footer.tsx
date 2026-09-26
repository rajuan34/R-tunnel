import React from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';

interface FooterProps {
  onNavigate: (path: string) => void;
  onOpenContact: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenContact }) => {
  return (
    <footer className="border-t border-slate-850 bg-[#04060d] text-slate-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-slate-800/80">
          {/* Brand Col */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                R
              </div>
              <span className="font-bold text-white text-base tracking-tight">R-Tunnel Edge System</span>
            </div>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Industrial-grade temporary HTTP/HTTPS tunneling service for exposing Android Termux servers,
              webhooks, and local ports through CGNAT with zero-configuration.
            </p>
            <div className="pt-2">
              <button
                onClick={onOpenContact}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors inline-flex items-center gap-1"
              >
                <span>contact the dev to create your account</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <div className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Platform
            </div>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/')}
                  className="hover:text-white transition-colors"
                >
                  Home Portal
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/dashboard')}
                  className="hover:text-white transition-colors"
                >
                  Tunnel Dashboard
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/docs')}
                  className="hover:text-white transition-colors"
                >
                  Documentation & CLI
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/login')}
                  className="hover:text-white transition-colors"
                >
                  Administrator Sign In
                </button>
              </li>
            </ul>
          </div>

          {/* Developer Identity Col */}
          <div>
            <div className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">
              Developer Info
            </div>
            <div className="space-y-2 text-xs">
              <div className="text-slate-300 font-medium">Built by RAJUAN</div>
              <div>
                <a
                  href="https://RAJUAN.is-a.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center gap-1 group"
                >
                  <span>RAJUAN.is-a.dev</span>
                  <ExternalLink className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </div>
              <div className="text-slate-500 font-mono text-[11px] select-all">
                rajuan.r34.gameing@gmail.com
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Mandatory Copyright Attribution */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="text-slate-400 text-center sm:text-left">
            © Copyright by <strong className="text-white font-medium">RAJUAN</strong> · Web:{' '}
            <a
              href="https://RAJUAN.is-a.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-2"
            >
              RAJUAN.is-a.dev
            </a>
          </div>

          <div className="flex items-center gap-4 text-slate-500 text-[11px]">
            <span>Zero-Config Tunneling</span>
            <span aria-hidden="true">·</span>
            <span>Android Termux Ready</span>
            <span aria-hidden="true">·</span>
            <span>TLS Encryption</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
