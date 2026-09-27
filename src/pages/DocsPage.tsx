import React, { useState } from 'react';
import { Terminal, Copy, Check, ExternalLink, ShieldCheck, ArrowRight, Code, Key, Users } from 'lucide-react';

interface DocsPageProps {
  onNavigate: (path: string) => void;
  onOpenContact: () => void;
}

export const DocsPage: React.FC<DocsPageProps> = ({ onNavigate, onOpenContact }) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <div className="space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-cyan-400">
            Developer Documentation
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            R-Tunnel Architecture & CLI Manual
          </h1>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            Learn how R-Tunnel multiplexes local sockets over outbound WebSockets to expose Android Termux ports, local development servers, and APIs.
          </p>
        </div>

        {/* Section 1: Android Termux Quick Start */}
        <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-indigo-400" />
              <span>1. Android Termux Quick Start</span>
            </h2>
            <button
              onClick={() =>
                handleCopy(
                  'pkg update && pkg install nodejs -y\nnpx @r-tunnel/client --port 8080',
                  'termux-setup'
                )
              }
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded"
            >
              {copiedSection === 'termux-setup' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSection === 'termux-setup' ? 'Copied' : 'Copy Snippet'}</span>
            </button>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Install Node.js in Termux and run the R-Tunnel client directly with your target local port:
          </p>

          <pre className="bg-[#03060c] p-4 rounded-lg font-mono text-xs text-cyan-300 overflow-x-auto whitespace-pre-wrap">
{`# 1. Update Termux packages and install Node.js
pkg update && pkg install nodejs -y

# 2. Expose your local port (e.g. 8080)
npx @r-tunnel/client --port 8080`}
          </pre>

          <div className="text-xs text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
            💡 <strong>Note:</strong> R-Tunnel requires no root permissions on Android. It connects directly over outbound port 443/80.
          </div>
        </div>

        {/* Section 2: Command Line Options */}
        <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Code className="w-5 h-5 text-cyan-400" />
            <span>2. CLI Flags & Options</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#050811] text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="p-3">Flag</th>
                  <th className="p-3">Default</th>
                  <th className="p-3">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="p-3 text-cyan-400">--port &lt;number&gt;</td>
                  <td className="p-3 text-slate-500">8080</td>
                  <td className="p-3">Local port on device to forward to</td>
                </tr>
                <tr>
                  <td className="p-3 text-cyan-400">--token &lt;secret&gt;</td>
                  <td className="p-3 text-slate-500">auto</td>
                  <td className="p-3">Authentication token generated in dashboard</td>
                </tr>
                <tr>
                  <td className="p-3 text-cyan-400">--label &lt;name&gt;</td>
                  <td className="p-3 text-slate-500">none</td>
                  <td className="p-3">Friendly human identifier visible in inspector</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Render Cloud Deployment */}
        <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">R</span>
              <span>3. Deploying R-Tunnel on Render</span>
            </h2>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
              render.yaml Included
            </span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            R-Tunnel is optimized for Render with zero-configuration Blueprint infrastructure-as-code, automatic external URL discovery, and free tier cold-start mitigation.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-[#03060c] border border-slate-800 p-4 rounded-lg space-y-2">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>Step 1: One-Click Render Blueprint</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Connect your GitHub repository to Render and choose <strong>New Blueprint</strong>. Render reads <code className="text-cyan-400">render.yaml</code>, creates the web service on Node 20, configures the healthcheck at <code className="text-cyan-400">/health</code>, and auto-generates your secure secrets.
              </p>
            </div>

            <div className="bg-[#03060c] border border-slate-800 p-4 rounded-lg space-y-2">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>Step 2: Connect Your Termux Client</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Run the client with your Render URL. The client automatically detects Render, checks edge health, and wakes sleeping free instances:
              </p>
              <pre className="bg-[#070b14] p-2 rounded text-[11px] text-cyan-300 overflow-x-auto select-all">
                rtunnel login --server https://&lt;service&gt;.onrender.com
              </pre>
            </div>
          </div>
        </div>

        {/* Section 4: User Management & Master Keys */}
        <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-emerald-400" />
              <span>4. Dashboard User Management & Master Keys</span>
            </h2>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
              Multi-User Support
            </span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Administrators can create dedicated user accounts directly from the <strong>Users &amp; Master Keys</strong> dashboard tab. Each user is assigned a unique, cryptographically secure Master Key (<code className="text-cyan-400">rt_master_...</code>).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
            <div className="bg-[#03060c] border border-slate-800 p-3.5 rounded-lg space-y-1.5">
              <div className="font-bold text-white">1. Provision Account</div>
              <p className="text-slate-400 leading-relaxed">
                Add username, optional email or device notes (e.g. &quot;Android 14 Termux Node&quot;), and configure tunnel limits.
              </p>
            </div>

            <div className="bg-[#03060c] border border-slate-800 p-3.5 rounded-lg space-y-1.5">
              <div className="font-bold text-white">2. Share Master Key</div>
              <p className="text-slate-400 leading-relaxed">
                Copy the generated Master Key or full formatted invitation message and share it with your user or colleague.
              </p>
            </div>

            <div className="bg-[#03060c] border border-slate-800 p-3.5 rounded-lg space-y-1.5">
              <div className="font-bold text-white">3. Connect via CLI</div>
              <p className="text-slate-400 leading-relaxed">
                The user runs <code className="text-cyan-400">rtunnel login</code> or passes <code className="text-cyan-400">--token &lt;key&gt;</code> to establish persistent encrypted tunnels.
              </p>
            </div>
          </div>
        </div>

        {/* Section 5: Architecture & Security */}
        <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>5. How Carrier NAT Punch-Through Works</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Mobile cellular networks (4G/5G) assign private IPs behind Carrier-Grade NAT (CGNAT), making inbound port forwarding impossible on mobile devices.
          </p>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            R-Tunnel solves this by establishing a long-lived outbound multiplexed WebSocket connection from your Termux device to the public R-Tunnel edge gateway.
            When a public user visits your temporary HTTPS URL, the edge proxy packages the HTTP request into a binary frame, routes it down the existing WebSocket pipe, fetches your local response, and streams it back with ultra-low latency.
          </p>
        </div>

        {/* Section 6: Developer Credit Banner */}
        <div className="bg-gradient-to-r from-[#0d162b] to-[#0a1020] border border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-cyan-400 uppercase">Need Account Credentials?</div>
            <div className="text-base font-bold text-white">Created & Maintained by RAJUAN</div>
            <div className="text-xs text-slate-400">
              Web: <a href="https://RAJUAN.is-a.dev" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">RAJUAN.is-a.dev</a>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto shrink-0">
            <button
              onClick={onOpenContact}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold active:scale-98 transition-all text-center"
            >
              contact the dev to create your account
            </button>
            <button
              onClick={() => onNavigate('/dashboard')}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold active:scale-98 transition-all text-center"
            >
              Open Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
