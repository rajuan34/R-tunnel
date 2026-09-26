import React, { useState } from 'react';
import {
  ArrowRight,
  Terminal,
  Smartphone,
  ShieldCheck,
  Zap,
  Globe,
  Copy,
  Check,
  ExternalLink,
  Activity,
  Layers,
  Lock,
  Clock,
  Radio,
  Share2
} from 'lucide-react';
import { SystemStats } from '../types';

interface HomePageProps {
  onNavigate: (path: string) => void;
  onOpenContact: () => void;
  stats?: SystemStats | null;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onOpenContact, stats }) => {
  const [activeTab, setActiveTab] = useState<'termux' | 'node' | 'python' | 'go'>('termux');
  const [copied, setCopied] = useState(false);
  const [quickPort, setQuickPort] = useState('8080');

  const commands = {
    termux: 'pkg install nodejs -y && npx @r-tunnel/client --port 8080',
    node: 'npx @r-tunnel/client --port 3000 --label "Dev Server"',
    python: 'python3 -m http.server 5000 & npx @r-tunnel/client --port 5000',
    go: 'npx @r-tunnel/client --port 8000 --token YOUR_TOKEN',
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(commands[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070b14] text-slate-100 w-full overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-10 pb-16 sm:pt-20 sm:pb-28 px-4 sm:px-6 lg:px-8 border-b border-slate-800/80">
        <div className="max-w-5xl mx-auto text-center flex flex-col items-center">
          {/* Kicker Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-800/50 mb-5 max-w-full">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse shrink-0" />
            <span className="truncate">Edge Tunnel Proxy · Android Termux Ready</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.18] sm:leading-[1.15] mb-5">
            Expose Local Ports to the Web with{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
              Instant Secure HTTPS
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-lg text-slate-300 max-w-2xl mb-8 leading-relaxed px-2 sm:px-0">
            Zero configuration. Punch through mobile Carrier-Grade NAT (CGNAT) and local firewalls.
            Expose your Android Termux local server or Node/Python backend with temporary scoped public links.
          </p>

          {/* Action Row (Responsive Stacking for Mobile, Inline for PC) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 mb-10 sm:mb-14 w-full max-w-xl sm:max-w-none">
            <button
              onClick={() => onNavigate('/dashboard')}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/25 active:scale-98"
            >
              <Activity className="w-4 h-4" />
              <span>Launch Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Crucial requested button: "contact the dev to create your account" */}
            <button
              onClick={onOpenContact}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 hover:text-white border border-cyan-500/50 font-semibold text-sm transition-all shadow-md active:scale-98"
            >
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>contact the dev to create your account</span>
            </button>

            <button
              onClick={() => onNavigate('/docs')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-750 font-medium text-sm transition-colors active:scale-98"
            >
              <Terminal className="w-4 h-4" />
              <span>Documentation</span>
            </button>
          </div>

          {/* Interactive Terminal Showcase (Responsive on all screen widths) */}
          <div className="w-full max-w-3xl bg-[#03060c] border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl text-left">
            {/* Terminal Top Bar */}
            <div className="bg-[#090e1a] px-3 sm:px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 shrink-0">
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500/80" />
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500/80" />
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500/80" />
                <span className="hidden sm:inline-block ml-2 text-xs font-mono text-slate-400">
                  client-pipe: termux/bash
                </span>
              </div>

              {/* Responsive Tabs with scroll on narrow screens */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
                {(['termux', 'node', 'python', 'go'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === tab
                        ? 'bg-slate-800 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>

              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-mono text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors shrink-0"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span className="hidden xs:inline">{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* Terminal Body */}
            <div className="p-4 sm:p-5 font-mono text-xs sm:text-sm space-y-2 leading-relaxed text-slate-300 overflow-x-auto">
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 select-none">$</span>
                <span className="text-white font-semibold break-all">{commands[activeTab]}</span>
              </div>
              <div className="text-slate-500">
                [1/3] Resolving edge tunnel gateway and TLS certificate...
              </div>
              <div className="text-emerald-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>[2/3] WebSocket bidirectional data multiplexer connected</span>
              </div>
              <div className="text-emerald-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>[3/3] Online! Tunnel exposed at:</span>
              </div>
              <div className="pl-4 sm:pl-5 pt-1">
                <span className="text-cyan-400 underline break-all select-all font-bold">
                  {typeof window !== 'undefined' ? `${window.location.origin}/t/demo_session` : 'https://your-tunnel.r-tunnel.dev'}
                </span>
                <span className="text-slate-500 ml-2 block sm:inline mt-1 sm:mt-0">
                  ⇄ 127.0.0.1:{quickPort}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Real-time System Metrics Bar (Responsive 2x2 mobile, 4-col PC) */}
      <section className="bg-[#050811] border-b border-slate-800/80 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
          <div className="space-y-1">
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {stats ? stats.activeTunnels : 0}
            </div>
            <div className="text-xs text-slate-400 font-medium">Active Public Tunnels</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl sm:text-3xl font-extrabold text-cyan-400 font-mono">
              {stats ? stats.totalRequests : 0}
            </div>
            <div className="text-xs text-slate-400 font-medium">Requests Proxied</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl sm:text-3xl font-extrabold text-indigo-400 font-mono truncate">
              {stats ? `${Math.round(stats.totalBytes / 1024)} KB` : '0 KB'}
            </div>
            <div className="text-xs text-slate-400 font-medium">Data Transferred</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">99.98%</div>
            <div className="text-xs text-slate-400 font-medium">Edge SLA Uptime</div>
          </div>
        </div>
      </section>

      {/* Key Architectural Features Grid (Responsive 1 col mobile, 2 cols tablet, 3 cols PC) */}
      <section className="py-12 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
          <div className="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-2">
            Why R-Tunnel?
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Engineered for Android Termux and Mobile Development
          </h2>
          <p className="text-xs sm:text-base text-slate-400 mt-2 sm:mt-3 px-2 sm:px-0">
            Traditional reverse proxies are bloated, require root access, or fail behind cellular carrier NAT.
            R-Tunnel is lightweight, responsive, and works out-of-the-box.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="bg-[#0a0f1e] border border-slate-800 p-5 sm:p-6 rounded-xl space-y-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Android Termux First-Class</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Designed specifically to run smoothly on Android phones inside Termux with minimal RAM consumption
              and zero root privileges needed.
            </p>
          </div>

          <div className="bg-[#0a0f1e] border border-slate-800 p-5 sm:p-6 rounded-xl space-y-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Carrier NAT Punch-Through</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Mobile providers put phones behind restrictive CGNAT. R-Tunnel punches outbound multiplexed
              WebSockets so incoming requests arrive effortlessly.
            </p>
          </div>

          <div className="bg-[#0a0f1e] border border-slate-800 p-5 sm:p-6 rounded-xl space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Instant HTTPS / TLS</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every exposed tunnel receives an edge-terminated SSL/TLS URL. Test external webhooks from
              payment processors and OAuth providers without certificate errors.
            </p>
          </div>

          <div className="bg-[#0a0f1e] border border-slate-800 p-5 sm:p-6 rounded-xl space-y-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Configurable Lifetime</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tunnels automatically expire after 30 minutes, 1 hour, or 3 hours. Never worry about
              leaving test servers permanently open on the public internet.
            </p>
          </div>

          <div className="bg-[#0a0f1e] border border-slate-800 p-5 sm:p-6 rounded-xl space-y-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Live Traffic Inspector</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Watch incoming HTTP requests, headers, query parameters, latency, and status codes live
              on your dashboard without leaving your browser.
            </p>
          </div>

          <div className="bg-[#0a0f1e] border border-slate-800 p-5 sm:p-6 rounded-xl space-y-3">
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Scoped Client Tokens</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Issue temporary worker tokens for Termux devices or remote colleagues without sharing
              your master dashboard secret key.
            </p>
          </div>
        </div>
      </section>

      {/* Developer CTA Callout Section (Responsive Stack on Mobile, Flex Row on PC) */}
      <section className="px-4 sm:px-6 lg:px-8 pb-16 sm:pb-24 max-w-5xl mx-auto w-full">
        <div className="bg-gradient-to-r from-slate-900 via-[#0d1527] to-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-2 text-center md:text-left">
            <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
              Need an Account or Custom Node?
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white">
              Get in touch with RAJUAN
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md">
              Request access credentials, inquire about dedicated server deployment, or integrate custom tunnel configurations.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
            {/* Prominently requested button */}
            <button
              onClick={onOpenContact}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-cyan-600/30 active:scale-98"
            >
              <span>contact the dev to create your account</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            <a
              href="https://RAJUAN.is-a.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs sm:text-sm transition-colors active:scale-98"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              <span>RAJUAN.is-a.dev</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
