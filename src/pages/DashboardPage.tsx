import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Plus,
  Radio,
  Key,
  ListFilter,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Clock,
  RefreshCw,
  Search,
  AlertCircle,
  Terminal,
  Zap,
  ArrowUpRight,
  ShieldCheck,
  PauseCircle,
  PlayCircle
} from 'lucide-react';
import { Tunnel, SystemStats, TrafficLog, ApiToken } from '../types';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
  onOpenContact: () => void;
  isAuthenticated: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onOpenContact,
  isAuthenticated,
}) => {
  const [activeTab, setActiveTab] = useState<'tunnels' | 'create' | 'tokens' | 'activity'>('tunnels');
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [trafficLogs, setTrafficLogs] = useState<TrafficLog[]>([]);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'connected' | 'waiting' | 'expired'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create Form State
  const [createPort, setCreatePort] = useState(8080);
  const [createDuration, setCreateDuration] = useState(3600);
  const [createLabel, setCreateLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    tunnel: Tunnel;
    cliCommand: string;
  } | null>(null);

  // Token Form State
  const [tokenName, setTokenName] = useState('');
  const [tokenDuration, setTokenDuration] = useState(86400 * 30);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);

  // Fetch tunnels & stats
  const refreshData = useCallback(async () => {
    try {
      const [tunnelsRes, statsRes] = await Promise.all([
        fetch('/api/tunnels', { credentials: 'include' }),
        fetch('/api/stats', { credentials: 'include' }),
      ]);

      if (tunnelsRes.ok) {
        const data = await tunnelsRes.json();
        setTunnels(data.tunnels || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats || data);
      }
    } catch (err) {
      console.error('Failed to load tunnels', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/tokens', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTokens(data.tokens || []);
      }
    } catch (err) {
      console.error('Failed to load tokens', err);
    }
  }, []);

  // Initial load and WebSocket / polling
  useEffect(() => {
    refreshData();
    loadTokens();

    const interval = setInterval(refreshData, 4000);

    // Setup real-time WebSocket connection to /ws/dashboard if supported
    let ws: WebSocket | null = null;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'tunnel_update') {
            refreshData();
          } else if (msg.type === 'traffic_log') {
            setTrafficLogs((prev) => [msg.log, ...prev].slice(0, 100));
          } else if (msg.type === 'stats_update') {
            setStats(msg.stats);
          }
        } catch (e) {
          // ignore parsing error
        }
      };
    } catch (e) {
      // fallback to interval
    }

    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, [refreshData, loadTokens]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Submit Create Tunnel
  const handleCreateTunnel = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          port: Number(createPort),
          duration: createDuration,
          label: createLabel.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to create tunnel');
        return;
      }

      setCreatedResult({
        tunnel: data.tunnel,
        cliCommand: data.cliCommand,
      });

      refreshData();
    } catch (err) {
      alert('Network error creating tunnel');
    } finally {
      setCreating(false);
    }
  };

  // Stop Tunnel
  const handleStopTunnel = async (tunnelId: string) => {
    if (!confirm('Are you sure you want to stop and delete this tunnel?')) return;
    try {
      const res = await fetch(`/api/tunnels/${tunnelId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        refreshData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to stop tunnel');
      }
    } catch (err) {
      alert('Error stopping tunnel');
    }
  };

  // Extend Tunnel Duration
  const handleExtendTunnel = async (tunnelId: string, additionalSeconds: number = 3600) => {
    try {
      const res = await fetch(`/api/tunnels/${tunnelId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ additionalSeconds }),
      });
      if (res.ok) {
        refreshData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to extend tunnel');
      }
    } catch (err) {
      alert('Error extending tunnel');
    }
  };

  // Generate Token
  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingToken(true);
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: tokenName || 'Termux Client Node',
          expiresIn: tokenDuration,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewlyCreatedToken(data.token);
        setTokenName('');
        loadTokens();
      } else {
        alert(data.error || 'Failed to generate token');
      }
    } catch (err) {
      alert('Error generating token');
    } finally {
      setGeneratingToken(false);
    }
  };

  // Filter Tunnels
  const filteredTunnels = tunnels.filter((t) => {
    const matchesSearch =
      (t.label && t.label.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.port.toString().includes(searchQuery);

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });

  const formatRemainingTime = (expiresAt: number) => {
    const diff = Math.max(0, expiresAt - Date.now());
    if (diff === 0) return 'Expired';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m`;
    }
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col w-full">
      {/* Top Header Banner (Fully Responsive for Mobile & PC) */}
      <div className="border-b border-slate-800 bg-[#060910] px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Control Plane Dashboard
              </h1>
              <span className="text-[10px] sm:text-xs font-mono px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/40 text-indigo-300">
                Live Edge
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-xl">
              Manage active tunnel endpoints, inspect live payloads, and configure Android Termux nodes.
            </p>
          </div>

          {/* Action Button Row */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={refreshData}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors active:scale-95 shrink-0"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => setActiveTab('create')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition-colors active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Tunnel</span>
            </button>

            <button
              onClick={onOpenContact}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-cyan-500/40 text-xs font-medium text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/60 transition-colors active:scale-95 shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Contact Dev</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full flex-1 flex flex-col">
        {/* Real-time KPI Metric Cards (Mobile 2x2, Tablet/PC 4 cols) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-[#0a0f1d] border border-slate-800 p-3.5 sm:p-4 rounded-xl flex flex-col justify-between">
            <div className="text-[11px] sm:text-xs font-medium text-slate-400 mb-1">Active Tunnels</div>
            <div className="text-xl sm:text-2xl font-extrabold text-white font-mono flex items-center gap-2">
              <span>{stats?.activeTunnels ?? tunnels.length}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>

          <div className="bg-[#0a0f1d] border border-slate-800 p-3.5 sm:p-4 rounded-xl flex flex-col justify-between">
            <div className="text-[11px] sm:text-xs font-medium text-slate-400 mb-1">Requests Proxied</div>
            <div className="text-xl sm:text-2xl font-extrabold text-cyan-400 font-mono">
              {stats?.totalRequests ?? 0}
            </div>
          </div>

          <div className="bg-[#0a0f1d] border border-slate-800 p-3.5 sm:p-4 rounded-xl flex flex-col justify-between">
            <div className="text-[11px] sm:text-xs font-medium text-slate-400 mb-1">Data Transferred</div>
            <div className="text-xl sm:text-2xl font-extrabold text-indigo-400 font-mono truncate">
              {stats ? `${(stats.totalBytes / 1024).toFixed(1)} KB` : '0 KB'}
            </div>
          </div>

          <div className="bg-[#0a0f1d] border border-slate-800 p-3.5 sm:p-4 rounded-xl flex flex-col justify-between">
            <div className="text-[11px] sm:text-xs font-medium text-slate-400 mb-1">Termux Clients</div>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono">
              {stats?.connectedClients ?? 0}
            </div>
          </div>
        </div>

        {/* Tab Navigation Controls (Mobile Swipeable Scrollbar-none, Desktop Inline Segmented) */}
        <div className="overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 mb-6 pb-1">
          <div className="flex items-center gap-1.5 p-1 bg-[#090e1a] border border-slate-800 rounded-lg w-max min-w-full sm:min-w-0 sm:w-fit">
            <button
              onClick={() => setActiveTab('tunnels')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'tunnels'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Active Tunnels ({tunnels.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('create')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'create'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Tunnel</span>
            </button>

            <button
              onClick={() => setActiveTab('tokens')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'tokens'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Client Tokens</span>
            </button>

            <button
              onClick={() => setActiveTab('activity')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'activity'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Traffic Inspector</span>
            </button>
          </div>
        </div>

        {/* TAB 1: TUNNELS LIST */}
        {activeTab === 'tunnels' && (
          <div className="space-y-4">
            {/* Search and Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0a0f1d] border border-slate-800 p-3 rounded-lg">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Filter by port, label, or tunnel ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#050811] border border-slate-800 text-xs sm:text-sm text-white rounded-md pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 justify-between sm:justify-start">
                <span className="text-xs text-slate-400 shrink-0">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-[#050811] border border-slate-800 text-xs text-white rounded-md px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">All Tunnels</option>
                  <option value="connected">Connected</option>
                  <option value="waiting">Waiting for Client</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            </div>

            {/* Tunnel Cards Grid (Responsive 1 col mobile, 2 cols tablet, 3 cols wide desktop) */}
            {filteredTunnels.length === 0 ? (
              <div className="bg-[#0a0f1d] border border-dashed border-slate-800 rounded-xl p-8 sm:p-12 text-center">
                <Radio className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-white mb-1">No Active Tunnels</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  {searchQuery
                    ? 'No tunnels match your filter query.'
                    : 'Create your first temporary tunnel to expose your local Android Termux port.'}
                </p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Tunnel</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredTunnels.map((tunnel) => {
                  const isConnected = tunnel.status === 'connected';
                  const isExpired = tunnel.status === 'expired' || tunnel.expiresAt < Date.now();

                  return (
                    <div
                      key={tunnel.id}
                      className="bg-[#0a0f1d] border border-slate-800 hover:border-slate-700/80 rounded-xl p-4 sm:p-5 transition-all space-y-3.5 flex flex-col justify-between"
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white truncate max-w-[200px]">
                              {tunnel.label || `Tunnel :${tunnel.port}`}
                            </span>
                            <span
                              className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border shrink-0 ${
                                isConnected
                                  ? 'bg-emerald-950/60 border-emerald-800/40 text-emerald-400'
                                  : isExpired
                                  ? 'bg-rose-950/60 border-rose-800/40 text-rose-400'
                                  : 'bg-amber-950/60 border-amber-800/40 text-amber-400'
                              }`}
                            >
                              {tunnel.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-slate-400 mt-1">
                            Port: <strong className="text-slate-200">{tunnel.port}</strong> · ID:{' '}
                            {tunnel.id.slice(0, 8)}
                          </div>
                        </div>

                        {/* Stop Button */}
                        <button
                          onClick={() => handleStopTunnel(tunnel.id)}
                          title="Revoke / Stop Tunnel"
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-md transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Public URL Box */}
                      <div className="bg-[#050811] border border-slate-800/90 rounded-lg p-2.5 flex items-center justify-between gap-2">
                        <div className="truncate text-xs font-mono text-cyan-400 select-all">
                          {tunnel.publicUrl}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleCopy(tunnel.publicUrl, `url-${tunnel.id}`)}
                            className="p-1.5 text-slate-400 hover:text-white rounded bg-slate-800/60"
                            title="Copy Public URL"
                          >
                            {copiedId === `url-${tunnel.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <a
                            href={tunnel.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-400 hover:text-white rounded bg-slate-800/60"
                            title="Open in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {/* Termux Command Snippet */}
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                          <span>Run in Termux / CLI:</span>
                          <button
                            onClick={() => {
                              const cmd = `npx @r-tunnel/client --port ${tunnel.port} --token ${tunnel.token || 'auto'}`;
                              handleCopy(cmd, `cmd-${tunnel.id}`);
                            }}
                            className="text-cyan-400 hover:underline flex items-center gap-1 font-medium"
                          >
                            {copiedId === `cmd-${tunnel.id}` ? 'Copied!' : 'Copy Command'}
                          </button>
                        </div>
                        <div className="bg-[#050811] border border-slate-800 rounded p-2 text-[11px] font-mono text-slate-300 truncate select-all">
                          {`npx @r-tunnel/client --port ${tunnel.port}`}
                        </div>
                      </div>

                      {/* Footer Info & Duration Extension */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>{formatRemainingTime(tunnel.expiresAt)}</span>
                        </div>

                        {!isExpired && (
                          <button
                            onClick={() => handleExtendTunnel(tunnel.id, 3600)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold hover:underline"
                          >
                            +1h Extend
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CREATE TUNNEL (Side-by-side on PC, Stacked on Mobile) */}
        {activeTab === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Form */}
            <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-white">Create Temporary Tunnel</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Specify your Android Termux local port and generate an instant secure tunnel.
                </p>
              </div>

              <form onSubmit={handleCreateTunnel} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Local Target Port (on Device)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={createPort}
                    onChange={(e) => setCreatePort(parseInt(e.target.value, 10))}
                    className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm sm:text-base text-white font-mono focus:outline-none focus:border-indigo-500"
                    required
                  />
                  {/* Presets chips with mobile-friendly touch targets */}
                  <div className="flex items-center gap-1.5 mt-2.5 flex-wrap text-xs">
                    <span className="text-slate-500 text-[11px]">Quick Presets:</span>
                    {[8080, 3000, 5000, 5173, 8000].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setCreatePort(p)}
                        className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all min-h-[32px] ${
                          createPort === p
                            ? 'bg-indigo-600 text-white font-bold shadow-sm'
                            : 'bg-slate-850 text-slate-300 hover:text-white border border-slate-800'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tunnel Lifetime Duration
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: '30 Mins', sec: 1800 },
                      { label: '1 Hour', sec: 3600 },
                      { label: '2 Hours', sec: 7200 },
                      { label: '3 Hours', sec: 10800 },
                    ].map((item) => (
                      <button
                        key={item.sec}
                        type="button"
                        onClick={() => setCreateDuration(item.sec)}
                        className={`py-2.5 text-xs font-semibold rounded-lg border transition-colors ${
                          createDuration === item.sec
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                            : 'bg-[#050811] border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tunnel Label (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Termux Flask App, React Dev"
                    value={createLabel}
                    onChange={(e) => setCreateLabel(e.target.value)}
                    className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 active:scale-[0.99] shadow-md shadow-indigo-600/20"
                >
                  {creating ? 'Creating Tunnel...' : '🚀 Create Tunnel & Generate Command'}
                </button>
              </form>
            </div>

            {/* Generated Command Box */}
            <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-base font-bold text-white mb-1">Connection Details</h3>
                <p className="text-xs text-slate-400">
                  Execute the client command on your local device running Android Termux.
                </p>
              </div>

              {createdResult ? (
                <div className="bg-[#050811] border border-emerald-800/50 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>Tunnel Created Successfully</span>
                    </span>
                    <button
                      onClick={() => handleCopy(createdResult.cliCommand, 'result-cmd')}
                      className="text-xs text-slate-300 hover:text-white bg-slate-800 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors"
                    >
                      {copiedId === 'result-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === 'result-cmd' ? 'Copied' : 'Copy Command'}</span>
                    </button>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-400 mb-1">Public URL:</div>
                    <a
                      href={createdResult.tunnel.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs sm:text-sm font-mono text-cyan-400 hover:underline break-all block font-bold"
                    >
                      {createdResult.tunnel.publicUrl}
                    </a>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-400 mb-1">Execute in Android Termux:</div>
                    <pre className="bg-[#02050c] p-3 rounded-lg font-mono text-xs text-slate-200 overflow-x-auto whitespace-pre-wrap break-all select-all">
                      {createdResult.cliCommand}
                    </pre>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => setActiveTab('tunnels')}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold hover:underline"
                    >
                      View in Active Tunnels List →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-800 rounded-xl p-8 sm:p-12 text-center text-slate-500 text-xs">
                  Submit the configuration on the left to generate your live public endpoint.
                </div>
              )}

              <div className="text-[11px] text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-800 leading-relaxed">
                💡 <strong>Tip for Termux:</strong> Make sure your server is bound to{' '}
                <code className="text-cyan-400">0.0.0.0</code> or <code className="text-cyan-400">127.0.0.1</code>.
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CLIENT TOKENS */}
        {activeTab === 'tokens' && (
          <div className="space-y-6">
            <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-5 sm:p-6">
              <h3 className="text-base font-bold text-white mb-1">Generate Scoped Client Token</h3>
              <p className="text-xs text-slate-400 mb-4">
                Use dedicated tokens for automated Termux nodes without revealing your master password.
              </p>

              <form onSubmit={handleGenerateToken} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Token label (e.g. Galaxy-S23-Termux)"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  className="flex-1 bg-[#050811] border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
                <button
                  type="submit"
                  disabled={generatingToken}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shrink-0 active:scale-95"
                >
                  {generatingToken ? 'Generating...' : 'Create Token'}
                </button>
              </form>

              {newlyCreatedToken && (
                <div className="mt-4 p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/50">
                  <div className="text-xs font-semibold text-emerald-400 mb-1.5">
                    New Token Created! Copy it now (will not be displayed again):
                  </div>
                  <div className="flex items-center justify-between gap-2 font-mono text-xs text-white bg-[#03060c] p-2.5 rounded border border-emerald-800/30">
                    <span className="truncate select-all">{newlyCreatedToken}</span>
                    <button
                      onClick={() => handleCopy(newlyCreatedToken, 'new-token')}
                      className="px-3 py-1.5 text-xs bg-slate-800 text-slate-200 hover:text-white rounded transition-colors shrink-0"
                    >
                      {copiedId === 'new-token' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Existing Tokens Table */}
            <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 text-xs font-bold text-white">
                Active Client Tokens
              </div>
              {tokens.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No dedicated client tokens provisioned yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-800 text-xs">
                  {tokens.map((tok) => (
                    <div key={tok.id} className="p-4 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-white">{tok.name}</div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          Created: {new Date(tok.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-0.5 rounded">
                        ACTIVE
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: TRAFFIC INSPECTOR (Desktop Table + Mobile Responsive Cards Stream) */}
        {activeTab === 'activity' && (
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Live Traffic Inspector</h3>
                <p className="text-xs text-slate-400">Streamed real-time HTTP requests through your tunnels</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Live Feed</span>
              </div>
            </div>

            {trafficLogs.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Waiting for incoming HTTP requests to active tunnels...
              </div>
            ) : (
              <>
                {/* Mobile Cards View (< 640px) */}
                <div className="block sm:hidden divide-y divide-slate-800 font-mono text-xs">
                  {trafficLogs.map((log) => (
                    <div key={log.id} className="p-3.5 space-y-2 hover:bg-slate-850/30">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.method === 'GET'
                                ? 'bg-sky-950/60 text-sky-400'
                                : log.method === 'POST'
                                ? 'bg-emerald-950/60 text-emerald-400'
                                : 'bg-purple-950/60 text-purple-400'
                            }`}
                          >
                            {log.method}
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              log.statusCode < 400 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {log.statusCode}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="text-slate-200 text-xs truncate font-medium">
                        {log.path}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>Duration: {log.durationMs}ms</span>
                        <span>Size: {(log.bytes / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View (>= 640px) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#050811] text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="p-3">Time</th>
                        <th className="p-3">Method</th>
                        <th className="p-3">Path</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Duration</th>
                        <th className="p-3">Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {trafficLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 text-slate-400">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                log.method === 'GET'
                                  ? 'bg-sky-950/60 text-sky-400'
                                  : log.method === 'POST'
                                  ? 'bg-emerald-950/60 text-emerald-400'
                                  : 'bg-purple-950/60 text-purple-400'
                              }`}
                            >
                              {log.method}
                            </span>
                          </td>
                          <td className="p-3 text-slate-200 truncate max-w-xs">{log.path}</td>
                          <td className="p-3">
                            <span
                              className={
                                log.statusCode < 400
                                  ? 'text-emerald-400 font-bold'
                                  : 'text-rose-400 font-bold'
                              }
                            >
                              {log.statusCode}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400">{log.durationMs}ms</td>
                          <td className="p-3 text-slate-400">{(log.bytes / 1024).toFixed(1)} KB</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
