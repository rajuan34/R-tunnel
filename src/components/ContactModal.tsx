import React, { useState } from 'react';
import { X, ExternalLink, Mail, Copy, Check, ShieldCheck, User } from 'lucide-react';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const email = 'rajuan.r34.gameing@gmail.com';
  const website = 'https://RAJUAN.is-a.dev';

  if (!isOpen) return null;

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#0a0f1d] border border-slate-700/80 rounded-xl shadow-2xl p-5 sm:p-7 relative text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 id="contact-modal-title" className="text-lg font-bold text-white leading-tight">
                Contact the Developer
              </h2>
              <p className="text-xs text-slate-400">Request an account or dedicated tunnel credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-md hover:bg-slate-800"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            R-Tunnel is developed and maintained by <strong className="text-white font-semibold">RAJUAN</strong>.
            Contact directly to obtain client credentials, request custom subdomains, or report feedback.
          </p>

          <div className="bg-[#050811] border border-slate-800 rounded-lg p-4 space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
                Developer Identity
              </div>
              <div className="text-base font-bold text-white flex items-center gap-2">
                <span>RAJUAN</span>
                <span className="text-xs font-normal text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
                  Lead Developer
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
                Official Developer Website
              </div>
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition-colors group"
              >
                <span>RAJUAN.is-a.dev</span>
                <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1">
                Email Address
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-mono text-slate-200 select-all break-all">
                  {email}
                </span>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1.5 rounded transition-colors shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/50 p-3 rounded-md border border-slate-800">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Accounts are provisioned with secure master tokens for Android Termux & Linux clients.</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-3 border-t border-slate-800">
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-cyan-600/20"
          >
            <ExternalLink className="w-4 h-4" />
            Visit RAJUAN.is-a.dev
          </a>

          <a
            href={`mailto:${email}?subject=R-Tunnel%20Account%20Request&body=Hi%20RAJUAN,%0A%0AI%20would%20like%20to%20request%20an%20account%20for%20R-Tunnel%20to%20expose%20my%20local%20Termux%20server.%0A%0AThank%20you!`}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors border border-slate-700"
          >
            <Mail className="w-4 h-4" />
            Email Developer
          </a>
        </div>
      </div>
    </div>
  );
};
