import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Plus,
  Radio,
  Key,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Clock,
  RefreshCw,
  Search,
  AlertCircle,
  Terminal,
  ShieldCheck,
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Eye,
  EyeOff,
  Edit3,
  Share2,
  Send,
  User as UserIcon,
  Shield,
  Layers,
  Zap,
} from 'lucide-react';
import { Tunnel, SystemStats, TrafficLog, ApiToken, ManagedUser } from '../types';

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
  const [activeTab, setActiveTab] = useState<'tunnels' | 'create' | 'users' | 'tokens' | 'activity'>('tunnels');
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [trafficLogs, setTrafficLogs] = useState<TrafficLog[]>([]);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'connected' | 'waiting' | 'expired'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // User Management State
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<ManagedUser | null>(null);
  const [createdUserCredentials, setCreatedUserCredentials] = useState<{
    user: ManagedUser;
    cliLoginCommand: string;
    cliCreateCommand: string;
  } | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  // Add User Form State
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [newMaxTunnels, setNewMaxTunnels] = useState(5);
  const [newExpiryDays, setNewExpiryDays] = useState(0); // 0 = never
  const [keyGenMode, setKeyGenMode] = useState<'auto' | 'custom'>('auto');
  const [customMasterKey, setCustomMasterKey] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userFormError, setUserFormError] = useState<string | null>(null);

  // Create Tunnel Form State
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

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to load users', err);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // Initial load and WebSocket / polling
  useEffect(() => {
    refreshData();
    loadTokens();
    loadUsers();

    const interval = setInterval(() => {
      refreshData();
      loadUsers();
    }, 4000);

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
  }, [refreshData, loadTokens, loadUsers]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleKeyVisibility = (userId: string) => {
    setVisibleKeys((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
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
        body: JSON.stringify({ seconds: additionalSeconds }),
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

  // Generate Ephemeral Token
  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingToken(true);
    try {
      const res = await fetch('/api/tokens/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          label: tokenName || 'Termux Client Node',
          durationSeconds: tokenDuration,
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

  // Create User & Master Key Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    setIsSavingUser(true);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: newUsername.trim(),
          displayName: newDisplayName.trim() || undefined,
          email: newEmail.trim() || undefined,
          note: newNote.trim() || undefined,
          role: newRole,
          maxTunnels: Number(newMaxTunnels),
          expiresInDays: newExpiryDays > 0 ? Number(newExpiryDays) : undefined,
          masterKey: keyGenMode === 'custom' && customMasterKey.trim() ? customMasterKey.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setUserFormError(data.error || 'Failed to create user');
        setIsSavingUser(false);
        return;
      }

      // Success: Close Add modal, open Credentials modal
      setShowAddUserModal(false);
      setCreatedUserCredentials({
        user: data.user,
        cliLoginCommand: data.cliLoginCommand,
        cliCreateCommand: data.cliCreateCommand,
      });

      // Reset form
      setNewUsername('');
      setNewDisplayName('');
      setNewEmail('');
      setNewNote('');
      setNewRole('user');
      setNewMaxTunnels(5);
      setNewExpiryDays(0);
      setKeyGenMode('auto');
      setCustomMasterKey('');

      // Refresh users
      loadUsers();
    } catch (err) {
      setUserFormError('Network error while creating user');
    } finally {
      setIsSavingUser(false);
    }
  };

  // Toggle User Status (Active <-> Suspended)
  const handleToggleUserStatus = async (user: ManagedUser) => {
    const action = user.status === 'active' ? 'suspend' : 'activate';
    if (!confirm(`Are you sure you want to ${action} user "${user.username}"?`)) return;

    try {
      const res = await fetch(`/api/users/${user.id}/toggle-status`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        loadUsers();
        refreshData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update user status');
      }
    } catch (err) {
      alert('Error updating user status');
    }
  };

  // Regenerate Master Key
  const handleRegenerateKey = async (user: ManagedUser) => {
    if (
      !confirm(
        `Regenerate Master Key for "${user.username}"? The previous master key will immediately stop working.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${user.id}/regenerate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setCreatedUserCredentials({
          user: data.user,
          cliLoginCommand: data.cliLoginCommand,
          cliCreateCommand: data.cliCreateCommand,
        });
        loadUsers();
      } else {
        alert(data.error || 'Failed to regenerate Master Key');
      }
    } catch (err) {
      alert('Error regenerating Master Key');
    }
  };

  // Delete User
  const handleDeleteUser = async (user: ManagedUser) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete user "${user.username}"? All their active tunnels will be terminated immediately.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        loadUsers();
        refreshData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete user');
      }
    } catch (err) {
      alert('Error deleting user');
    }
  };

  // Edit User Save
  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForEdit) return;

    try {
      const res = await fetch(`/api/users/${selectedUserForEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          displayName: selectedUserForEdit.displayName,
          email: selectedUserForEdit.email,
          note: selectedUserForEdit.note,
          role: selectedUserForEdit.role,
          status: selectedUserForEdit.status,
          maxTunnels: Number(selectedUserForEdit.maxTunnels),
        }),
      });

      if (res.ok) {
        setShowEditUserModal(false);
        setSelectedUserForEdit(null);
        loadUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update user');
      }
    } catch (err) {
      alert('Error updating user');
    }
  };

  // Filter Tunnels
  const filteredTunnels = tunnels.filter((t) => {
    const matchesSearch =
      (t.label && t.label.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.username && t.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.port.toString().includes(searchQuery);

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });

  // Filter Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.username.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (u.displayName && u.displayName.toLowerCase().includes(userSearchQuery.toLowerCase())) ||
      (u.note && u.note.toLowerCase().includes(userSearchQuery.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(userSearchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (userStatusFilter === 'all') return true;
    return u.status === userStatusFilter;
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

  const getShareableUserMessage = (creds: {
    user: ManagedUser;
    cliLoginCommand: string;
    cliCreateCommand: string;
  }) => {
    const serverUrl = window.location.origin;
    return `Hello ${creds.user.displayName || creds.user.username}!

Here are your R-Tunnel connection credentials:
• Username: ${creds.user.username}
• Master Key: ${creds.user.masterKey}
• Server URL: ${serverUrl}

Quick Setup for Termux / Node CLI:
${creds.cliLoginCommand}

Run a tunnel:
${creds.cliCreateCommand}

Enjoy fast, secure HTTPS tunnels!`;
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col w-full">
      {/* Top Header Banner */}
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
              Manage active tunnel endpoints, provision user accounts with Master Keys, and inspect live payloads.
            </p>
          </div>

          {/* Action Button Row */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                refreshData();
                loadUsers();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors active:scale-95 shrink-0"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Quick Add User Button */}
            <button
              onClick={() => {
                setUserFormError(null);
                setShowAddUserModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-sm transition-colors active:scale-95 shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add User & Master Key</span>
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
        {/* Real-time KPI Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-[#0a0f1d] border border-slate-800 p-3.5 sm:p-4 rounded-xl flex flex-col justify-between">
            <div className="text-[11px] sm:text-xs font-medium text-slate-400 mb-1">Active Tunnels</div>
            <div className="text-xl sm:text-2xl font-extrabold text-white font-mono flex items-center gap-2">
              <span>{stats?.activeTunnels ?? tunnels.length}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>

          <div
            onClick={() => setActiveTab('users')}
            className="bg-[#0a0f1d] border border-slate-800 hover:border-emerald-700/50 p-3.5 sm:p-4 rounded-xl flex flex-col justify-between cursor-pointer transition-colors"
          >
            <div className="text-[11px] sm:text-xs font-medium text-slate-400 mb-1 flex items-center justify-between">
              <span>Users & Master Keys</span>
              <span className="text-[10px] text-emerald-400 font-mono">Manage →</span>
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono flex items-center gap-2">
              <span>{users.length}</span>
              <span className="text-xs text-slate-500 font-sans font-normal">
                ({users.filter((u) => u.status === 'active').length} active)
              </span>
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
        </div>

        {/* Tab Navigation Controls */}
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
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Users & Master Keys ({users.length})</span>
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
              <span>Ephemeral Tokens</span>
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
                  placeholder="Filter by port, label, owner, or tunnel ID..."
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

            {/* Tunnel Cards Grid */}
            {filteredTunnels.length === 0 ? (
              <div className="bg-[#0a0f1d] border border-dashed border-slate-800 rounded-xl p-8 sm:p-12 text-center">
                <Radio className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-white mb-1">No Active Tunnels</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  {searchQuery
                    ? 'No tunnels match your filter query.'
                    : 'Create your first temporary tunnel or provide your user with a Master Key to connect.'}
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    onClick={() => setActiveTab('create')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Tunnel</span>
                  </button>
                  <button
                    onClick={() => setShowAddUserModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 active:scale-95 transition-all"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Add User & Master Key</span>
                  </button>
                </div>
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

                          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-1 flex-wrap">
                            <span>Port: <strong className="text-slate-200">{tunnel.port}</strong></span>
                            <span>·</span>
                            <span>ID: {tunnel.id.slice(0, 8)}</span>
                            {tunnel.username && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1 text-[11px] text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/40">
                                  <UserIcon className="w-3 h-3" />
                                  <span>{tunnel.username}</span>
                                </span>
                              </>
                            )}
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

        {/* TAB 2: CREATE TUNNEL */}
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
                  {/* Presets chips */}
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

        {/* TAB 3: USERS & MASTER KEYS (THE REQUESTED FEATURE!) */}
        {activeTab === 'users' && (
          <div className="space-y-5">
            {/* Top Filter and Add User Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0a0f1d] border border-slate-800 p-4 rounded-xl">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search users by username, display name, note, or email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full bg-[#050811] border border-slate-800 text-xs sm:text-sm text-white rounded-md pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 justify-between sm:justify-start flex-wrap">
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value as any)}
                  className="bg-[#050811] border border-slate-800 text-xs text-white rounded-md px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">All Statuses ({users.length})</option>
                  <option value="active">Active Only</option>
                  <option value="suspended">Suspended Only</option>
                </select>

                <button
                  onClick={() => {
                    setUserFormError(null);
                    setShowAddUserModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shrink-0 shadow-sm active:scale-95"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add New User</span>
                </button>
              </div>
            </div>

            {/* Users List Cards */}
            {filteredUsers.length === 0 ? (
              <div className="bg-[#0a0f1d] border border-dashed border-slate-800 rounded-xl p-8 sm:p-14 text-center">
                <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">
                  {userSearchQuery ? 'No matching users found' : 'No Managed Users Yet'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mb-5">
                  {userSearchQuery
                    ? 'Try searching with a different username or note.'
                    : 'Add users to grant them dedicated persistent Master Keys for their Android Termux or development environments.'}
                </p>
                <button
                  onClick={() => {
                    setUserFormError(null);
                    setShowAddUserModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-md active:scale-95"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add First User & Provide Master Key</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredUsers.map((user) => {
                  const isSuspended = user.status === 'suspended';
                  const isVisible = visibleKeys[user.id];

                  return (
                    <div
                      key={user.id}
                      className={`bg-[#0a0f1d] border rounded-xl p-5 transition-all space-y-4 flex flex-col justify-between ${
                        isSuspended
                          ? 'border-rose-950/60 bg-[#0d0910]'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* User Top Row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Avatar Circle */}
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border ${
                              isSuspended
                                ? 'bg-rose-950/60 border-rose-800/40 text-rose-400'
                                : user.role === 'admin'
                                ? 'bg-indigo-950/80 border-indigo-700/50 text-indigo-300'
                                : 'bg-emerald-950/80 border-emerald-700/50 text-emerald-300'
                            }`}
                          >
                            {user.username.slice(0, 2).toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-sm text-white truncate">
                                {user.username}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
                                  user.role === 'admin'
                                    ? 'bg-purple-950/70 border-purple-800/50 text-purple-300'
                                    : 'bg-slate-800 border-slate-700 text-slate-300'
                                }`}
                              >
                                {user.role}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
                                  isSuspended
                                    ? 'bg-rose-950/80 border-rose-800/60 text-rose-400'
                                    : 'bg-emerald-950/70 border-emerald-800/50 text-emerald-400'
                                }`}
                              >
                                {user.status}
                              </span>
                            </div>

                            {(user.displayName || user.note || user.email) && (
                              <div className="text-xs text-slate-400 truncate mt-0.5">
                                {user.displayName}
                                {user.displayName && user.note ? ' · ' : ''}
                                {user.note}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Top Action Icons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setSelectedUserForEdit({ ...user });
                              setShowEditUserModal(true);
                            }}
                            title="Edit user settings"
                            className="p-1.5 text-slate-400 hover:text-white rounded bg-slate-800/50 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleUserStatus(user)}
                            title={isSuspended ? 'Activate User' : 'Suspend User'}
                            className={`p-1.5 rounded transition-colors ${
                              isSuspended
                                ? 'text-emerald-400 hover:bg-emerald-950/40 bg-slate-800/50'
                                : 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 bg-slate-800/50'
                            }`}
                          >
                            {isSuspended ? (
                              <UserCheck className="w-3.5 h-3.5" />
                            ) : (
                              <UserX className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(user)}
                            title="Delete user"
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded bg-slate-800/50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Master Key Card Section */}
                      <div className="bg-[#050811] border border-slate-800 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="flex items-center gap-1.5 font-medium text-slate-300">
                            <Key className="w-3.5 h-3.5 text-cyan-400" />
                            <span>User Master Key:</span>
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleKeyVisibility(user.id)}
                              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                              title={isVisible ? 'Hide key' : 'Show key'}
                            >
                              {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              <span>{isVisible ? 'Hide' : 'Reveal'}</span>
                            </button>

                            <button
                              onClick={() => handleRegenerateKey(user)}
                              className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline"
                              title="Revoke & Issue new Master Key"
                            >
                              Regenerate
                            </button>
                          </div>
                        </div>

                        {/* Master Key Field with Mask */}
                        <div className="flex items-center justify-between gap-2 font-mono text-xs text-cyan-300 bg-[#02050c] p-2 rounded border border-slate-800/80">
                          <span className="truncate select-all">
                            {isVisible
                              ? user.masterKey
                              : `rt_master_${'•'.repeat(Math.max(8, user.masterKey.length - 10))}`}
                          </span>

                          <button
                            onClick={() => handleCopy(user.masterKey, `key-${user.id}`)}
                            className="p-1 text-slate-400 hover:text-white rounded bg-slate-800 shrink-0 transition-colors"
                            title="Copy Master Key"
                          >
                            {copiedId === `key-${user.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Quick Termux Login / Create Commands */}
                        <div className="pt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                          <button
                            onClick={() => {
                              const cmd = `rtunnel login --server "${window.location.origin}" --token "${user.masterKey}"`;
                              handleCopy(cmd, `login-cmd-${user.id}`);
                            }}
                            className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 font-medium"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                            <span>
                              {copiedId === `login-cmd-${user.id}` ? 'Login Cmd Copied!' : 'Copy Login Command'}
                            </span>
                          </button>

                          <button
                            onClick={() => {
                              const creds = {
                                user,
                                cliLoginCommand: `rtunnel login --server "${window.location.origin}" --token "${user.masterKey}"`,
                                cliCreateCommand: `rtunnel 8080 --server "${window.location.origin}" --token "${user.masterKey}"`,
                              };
                              handleCopy(getShareableUserMessage(creds), `invite-${user.id}`);
                            }}
                            className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 font-medium"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>
                              {copiedId === `invite-${user.id}` ? 'Invite Copied!' : 'Copy Invite Info'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Quota & Footer Info */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            {user.activeTunnelsCount || 0} /{' '}
                            {user.maxTunnels === 0 ? '∞' : user.maxTunnels} Tunnels
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            {user.expiresAt ? `Expires: ${formatRemainingTime(user.expiresAt)}` : 'Permanent'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: EPHEMERAL CLIENT TOKENS */}
        {activeTab === 'tokens' && (
          <div className="space-y-6">
            <div className="bg-[#0a0f1d] border border-slate-800 rounded-xl p-5 sm:p-6">
              <h3 className="text-base font-bold text-white mb-1">Generate Ephemeral Client Token</h3>
              <p className="text-xs text-slate-400 mb-4">
                Use temporary tokens for one-off CLI tests without persistent user accounts.
              </p>

              <form onSubmit={handleGenerateToken} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Token label (e.g. Temporary Test Node)"
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
                  {generatingToken ? 'Generating...' : 'Create Ephemeral Token'}
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
                Active Ephemeral Tokens
              </div>
              {tokens.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No ephemeral client tokens currently active.
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

        {/* TAB 5: TRAFFIC INSPECTOR */}
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

      {/* ========================================================= */}
      {/* MODAL 1: ADD USER & GENERATE MASTER KEY */}
      {/* ========================================================= */}
      {showAddUserModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowAddUserModal(false)}
        >
          <div
            className="w-full max-w-md bg-[#0a0f1d] border border-slate-700/80 rounded-2xl shadow-2xl p-6 relative space-y-4 text-slate-100 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">Add New User</h3>
                  <p className="text-[11px] text-slate-400">Generate a persistent Master Key for a client</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            {userFormError && (
              <div className="bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{userFormError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Username <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. alex_termux, john_dev"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
                <span className="text-[10px] text-slate-500">
                  Alphanumeric characters, underscores, and hyphens (2-32 chars)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Display Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Alex Mobile"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email / Contact (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. alex@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Device / Node Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Android 14 Termux Galaxy S23"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Max Concurrent Tunnels
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newMaxTunnels}
                    onChange={(e) => setNewMaxTunnels(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500">0 = unlimited</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Account Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="user">User (Tunnel Access)</option>
                    <option value="admin">Admin (Full Control)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Key Expiration
                </label>
                <select
                  value={newExpiryDays}
                  onChange={(e) => setNewExpiryDays(parseInt(e.target.value, 10))}
                  className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value={0}>Permanent (Never Expires)</option>
                  <option value={30}>30 Days</option>
                  <option value={90}>90 Days</option>
                  <option value={180}>180 Days</option>
                  <option value={365}>1 Year (365 Days)</option>
                </select>
              </div>

              {/* Master Key Options */}
              <div className="bg-[#050811] border border-slate-800 p-3 rounded-lg space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Master Key Provisioning
                </label>

                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="keygen"
                      checked={keyGenMode === 'auto'}
                      onChange={() => setKeyGenMode('auto')}
                      className="text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Auto-generate secure key</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="keygen"
                      checked={keyGenMode === 'custom'}
                      onChange={() => setKeyGenMode('custom')}
                      className="text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Custom key</span>
                  </label>
                </div>

                {keyGenMode === 'custom' && (
                  <input
                    type="text"
                    placeholder="Enter custom key (min 8 characters)"
                    value={customMasterKey}
                    onChange={(e) => setCustomMasterKey(e.target.value)}
                    className="w-full bg-[#080d19] border border-slate-700 rounded-md px-3 py-1.5 text-xs text-cyan-300 font-mono focus:outline-none focus:border-emerald-500"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isSavingUser ? 'Creating User...' : 'Create User & Generate Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: USER & MASTER KEY CREATED (CREDENTIALS POPUP) */}
      {/* ========================================================= */}
      {createdUserCredentials && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setCreatedUserCredentials(null)}
        >
          <div
            className="w-full max-w-lg bg-[#0a0f1d] border border-emerald-500/50 rounded-2xl shadow-2xl p-6 relative space-y-4 text-slate-100 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Check className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">User Master Key Ready!</h3>
                  <p className="text-[11px] text-slate-400">
                    Account provisioned for <strong className="text-white">{createdUserCredentials.user.username}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCreatedUserCredentials(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            {/* Glowing Master Key Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  <span>Master Key (Provide this to user):</span>
                </span>
                <button
                  onClick={() => handleCopy(createdUserCredentials.user.masterKey, 'modal-key')}
                  className="text-xs text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1 rounded flex items-center gap-1 transition-colors"
                >
                  {copiedId === 'modal-key' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedId === 'modal-key' ? 'Copied' : 'Copy Key'}</span>
                </button>
              </div>

              <pre className="bg-[#03060c] border border-emerald-500/40 p-3 rounded-lg font-mono text-xs sm:text-sm text-cyan-300 overflow-x-auto whitespace-pre-wrap break-all select-all font-bold">
                {createdUserCredentials.user.masterKey}
              </pre>
            </div>

            {/* Termux CLI Connect Commands */}
            <div className="space-y-3 pt-2">
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>1. One-time Setup Command for Termux / PC CLI:</span>
                  <button
                    onClick={() => handleCopy(createdUserCredentials.cliLoginCommand, 'modal-login')}
                    className="text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    {copiedId === 'modal-login' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-[#03060c] border border-slate-800 p-2.5 rounded font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap break-all select-all">
                  {createdUserCredentials.cliLoginCommand}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>2. Direct Run Tunnel Command:</span>
                  <button
                    onClick={() => handleCopy(createdUserCredentials.cliCreateCommand, 'modal-run')}
                    className="text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    {copiedId === 'modal-run' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-[#03060c] border border-slate-800 p-2.5 rounded font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap break-all select-all">
                  {createdUserCredentials.cliCreateCommand}
                </pre>
              </div>
            </div>

            {/* Copy Full Invitation Snippet Button */}
            <div className="pt-2">
              <button
                onClick={() =>
                  handleCopy(getShareableUserMessage(createdUserCredentials), 'modal-full-invite')
                }
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors active:scale-98 shadow-md"
              >
                <Share2 className="w-4 h-4" />
                <span>
                  {copiedId === 'modal-full-invite'
                    ? 'Copied Complete Invite Message!'
                    : 'Copy Formatted Invite Message to Send User'}
                </span>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setCreatedUserCredentials(null)}
                className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: EDIT USER SETTINGS */}
      {/* ========================================================= */}
      {showEditUserModal && selectedUserForEdit && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowEditUserModal(false)}
        >
          <div
            className="w-full max-w-md bg-[#0a0f1d] border border-slate-700/80 rounded-2xl shadow-2xl p-6 relative space-y-4 text-slate-100 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-white text-base">
                    Edit User: {selectedUserForEdit.username}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setShowEditUserModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={selectedUserForEdit.displayName || ''}
                  onChange={(e) =>
                    setSelectedUserForEdit({ ...selectedUserForEdit, displayName: e.target.value })
                  }
                  className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={selectedUserForEdit.email || ''}
                  onChange={(e) =>
                    setSelectedUserForEdit({ ...selectedUserForEdit, email: e.target.value })
                  }
                  className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Device / Node Note
                </label>
                <input
                  type="text"
                  value={selectedUserForEdit.note || ''}
                  onChange={(e) =>
                    setSelectedUserForEdit({ ...selectedUserForEdit, note: e.target.value })
                  }
                  className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Max Concurrent Tunnels
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={selectedUserForEdit.maxTunnels}
                    onChange={(e) =>
                      setSelectedUserForEdit({
                        ...selectedUserForEdit,
                        maxTunnels: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500">0 = unlimited</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={selectedUserForEdit.status}
                    onChange={(e) =>
                      setSelectedUserForEdit({
                        ...selectedUserForEdit,
                        status: e.target.value as any,
                      })
                    }
                    className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Account Role
                </label>
                <select
                  value={selectedUserForEdit.role}
                  onChange={(e) =>
                    setSelectedUserForEdit({
                      ...selectedUserForEdit,
                      role: e.target.value as any,
                    })
                  }
                  className="w-full bg-[#050811] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditUserModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-md active:scale-95"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
