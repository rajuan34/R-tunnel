import {
  setCsrfToken,
  fetchWithAuth,
  clearAuth,
  showToast,
  copyToClipboard,
  formatBytes,
  formatDuration,
  formatRelativeTime,
} from './common.js';

let tunnels = [];
let clientTokens = [];
let activityLogs = [];
let systemStats = null;
let activeTab = 'dashboard';
let ws = null;
let currentExtendTunnelId = null;
let tunnelSearchQuery = '';
let tunnelStatusFilter = 'all';

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupModals();
  setupForms();
  setupFilters();

  const authOk = await checkAuth();
  if (!authOk) {
    window.location.replace('/login');
    return;
  }

  await loadInitialData();
  initWebSocket();

  // Run countdown ticker every second
  setInterval(updateCountdowns, 1000);
  // Auto refresh stats & tokens every 15s
  setInterval(() => {
    loadStats();
    if (activeTab === 'tokens') loadTokens();
  }, 15000);
});

// Authentication check
async function checkAuth() {
  try {
    const res = await fetchWithAuth('/api/auth/me');
    const data = await res.json();
    if (data.authenticated && data.csrfToken) {
      setCsrfToken(data.csrfToken);
      const userEl = document.getElementById('current-username');
      if (userEl) userEl.textContent = data.user.username;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Navigation between views
function setupNavigation() {
  const links = document.querySelectorAll('[data-tab]');
  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Mobile menu toggle & drawer overlay
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  const closeSidebar = () => {
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
  };

  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.contains('mobile-open');
      if (isOpen) {
        closeSidebar();
      } else {
        sidebar.classList.add('mobile-open');
        if (overlay) overlay.classList.add('active');
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetchWithAuth('/api/auth/logout', { method: 'POST' });
      clearAuth();
      window.location.replace('/login');
    });
  }

  // Activity Refresh Button
  const refreshBtn = document.getElementById('btn-refresh-activity');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await loadActivity();
      showToast('Activity stream updated', 'info');
    });
  }
}

function switchTab(tabId) {
  activeTab = tabId;

  // Update page header title
  const topTitle = document.getElementById('top-title');
  if (topTitle) {
    switch (tabId) {
      case 'dashboard': topTitle.textContent = 'Tunnel Overview'; break;
      case 'create': topTitle.textContent = 'Create Tunnel'; break;
      case 'tunnels': topTitle.textContent = 'Active Tunnels'; break;
      case 'tokens': topTitle.textContent = 'Access Tokens'; break;
      case 'activity': topTitle.textContent = 'Traffic Inspector'; break;
      case 'docs': topTitle.textContent = 'Documentation'; break;
      default: topTitle.textContent = 'R-Tunnel Cloud';
    }
  }

  // Update active links across sidebar and bottom navigation
  document.querySelectorAll('[data-tab]').forEach((el) => {
    if (el.getAttribute('data-tab') === tabId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Show target view
  document.querySelectorAll('.tab-view').forEach((view) => {
    if (view.id === `view-${tabId}`) {
      view.style.display = 'block';
    } else {
      view.style.display = 'none';
    }
  });

  // Close mobile sidebar if open
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('active');

  if (tabId === 'activity') {
    loadActivity();
  } else if (tabId === 'tokens') {
    loadTokens();
  } else if (tabId === 'tunnels') {
    renderTunnels();
  }
}

// Search and Filter controls
function setupFilters() {
  const searchInput = document.getElementById('tunnel-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      tunnelSearchQuery = e.target.value.toLowerCase().trim();
      renderTunnels();
    });
  }

  const statusFilter = document.getElementById('tunnel-status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      tunnelStatusFilter = e.target.value;
      renderTunnels();
    });
  }
}

// Initial Data Fetch
async function loadInitialData() {
  await Promise.all([loadStats(), loadTunnels(), loadActivity(), loadTokens()]);
}

async function loadStats() {
  try {
    const res = await fetchWithAuth('/api/stats');
    if (res.ok) {
      systemStats = await res.json();
      renderStats();
    }
  } catch {}
}

async function loadTunnels() {
  try {
    const res = await fetchWithAuth('/api/tunnels');
    if (res.ok) {
      const data = await res.json();
      tunnels = data.tunnels || [];
      renderTunnels();
    }
  } catch {}
}

async function loadTokens() {
  try {
    const res = await fetchWithAuth('/api/tokens');
    if (res.ok) {
      const data = await res.json();
      clientTokens = data.tokens || [];
      renderTokens();
    }
  } catch {}
}

async function loadActivity() {
  try {
    const res = await fetchWithAuth('/api/activity?limit=60');
    if (res.ok) {
      const data = await res.json();
      activityLogs = data.activity || [];
      renderActivity(activityLogs);
    }
  } catch {}
}

// Render Stats Cards & Technical Telemetry
function renderStats() {
  if (!systemStats) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setVal('stat-active-tunnels', systemStats.activeTunnels);
  setVal('stat-total-requests', systemStats.totalRequests.toLocaleString());
  setVal('stat-bandwidth', formatBytes(systemStats.totalBytesIn + systemStats.totalBytesOut));
  setVal('stat-connected-clients', systemStats.connectedClients);

  // Technical Telemetry Strip
  setVal('stat-avg-latency', `${systemStats.avgLatencyMs || 0} ms`);
  setVal('stat-uptime', formatDuration(systemStats.uptimeSeconds || 0));
  setVal('stat-memory', `${systemStats.memoryUsageMb || 0} MB`);
  setVal('stat-max-body', `${systemStats.maxBodySizeMb || 10} MB`);

  const quotaEl = document.getElementById('stat-quota-text');
  if (quotaEl) {
    quotaEl.textContent = `Quota: ${systemStats.activeTunnels} / ${systemStats.maxActiveTunnels || 5} concurrent`;
  }
}

// Render Tunnels Grid (supports search and filter)
function renderTunnels() {
  const containerPrimary = document.getElementById('tunnels-container');
  const containerSecondary = document.getElementById('tunnels-container-secondary');
  const countBadge = document.getElementById('active-tunnels-count');

  const now = Date.now();
  let filtered = tunnels.slice();

  // Search filter
  if (tunnelSearchQuery) {
    filtered = filtered.filter(
      (t) =>
        t.id.toLowerCase().includes(tunnelSearchQuery) ||
        (t.label && t.label.toLowerCase().includes(tunnelSearchQuery)) ||
        String(t.localPort).includes(tunnelSearchQuery)
    );
  }

  // Status dropdown filter
  if (tunnelStatusFilter !== 'all') {
    filtered = filtered.filter((t) => {
      if (tunnelStatusFilter === 'expired') {
        return t.status === 'expired' || t.expiresAt <= now;
      }
      return t.status === tunnelStatusFilter && t.expiresAt > now;
    });
  }

  const activeTunnels = tunnels.filter((t) => t.status !== 'expired' && t.expiresAt > now);
  if (countBadge) countBadge.textContent = activeTunnels.length;

  const html = filtered.length === 0
    ? `
      <div style="grid-column: 1 / -1; background: var(--bg-surface); border: 1px dashed var(--border-muted); border-radius: var(--radius-md); padding: 48px 24px; text-align: center;">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-dim); margin-bottom: 12px;">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <h3 style="color: var(--text-main); font-size: 15px; margin-bottom: 4px;">No Tunnels Found</h3>
        <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 16px;">
          ${tunnelSearchQuery ? 'No active tunnels match your filter criteria.' : 'Create a temporary tunnel to expose your Android Termux local server.'}
        </p>
        <button class="btn btn-primary btn-sm" onclick="window.openCreateModal()">Create New Tunnel</button>
      </div>
    `
    : filtered
        .map((t) => {
          const remainingSec = Math.max(0, Math.floor((t.expiresAt - now) / 1000));
          const remainingStr = formatDuration(remainingSec);
          const isExpiring = remainingSec <= 300 && remainingSec > 0;
          const isExpired = t.status === 'expired' || remainingSec === 0;

          let statusClass = `badge-${t.status}`;
          let statusText = t.status.toUpperCase();

          if (isExpired) {
            statusClass = 'badge-expired';
            statusText = 'EXPIRED';
          } else if (isExpiring) {
            statusClass = 'badge-expiring';
            statusText = 'EXPIRING';
          }

          return `
          <div class="tunnel-card" id="tunnel-card-${t.id}">
            <div class="tunnel-card-top">
              <div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                  <span class="tunnel-id-badge">${escapeHtml(t.id)}</span>
                  <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <h4 style="font-size: 14px; font-weight: 700; color: var(--text-main); letter-spacing: -0.2px;">
                  ${escapeHtml(t.label || 'Tunnel Endpoint')}
                </h4>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="window.copyText('${t.publicUrl}')" title="Copy Public URL">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>

            <div class="tunnel-url-box">
              <a href="${t.publicUrl}" target="_blank" rel="noopener noreferrer" class="tunnel-url-link">
                ${escapeHtml(t.publicUrl)}
              </a>
            </div>

            <div class="tunnel-details">
              <div class="detail-item">
                <span class="detail-key">Target Port</span>
                <span class="detail-val">127.0.0.1:${t.localPort}</span>
              </div>
              <div class="detail-item">
                <span class="detail-key">Expires In</span>
                <span class="detail-val" id="countdown-${t.id}" style="${isExpiring ? 'color: #f97316;' : ''}">
                  ${isExpired ? '00:00:00' : remainingStr}
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-key">Requests</span>
                <span class="detail-val">${t.requestCount.toLocaleString()}</span>
              </div>
              <div class="detail-item">
                <span class="detail-key">Payload Vol.</span>
                <span class="detail-val">${formatBytes(t.bytesIn + t.bytesOut)}</span>
              </div>
            </div>

            <div class="tunnel-card-actions">
              <a href="${t.publicUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="flex: 1;">
                Open URL
              </a>
              ${
                !isExpired
                  ? `
                <button class="btn btn-secondary btn-sm" onclick="window.openExtendModal('${t.id}')">
                  Extend
                </button>
                <button class="btn btn-danger btn-sm" onclick="window.stopTunnel('${t.id}')">
                  Stop
                </button>
              `
                  : `
                <span style="font-size: 11px; color: var(--text-dim); padding: 4px 8px;">Terminated</span>
              `
              }
            </div>
          </div>
        `;
        })
        .join('');

  if (containerPrimary) containerPrimary.innerHTML = html;
  if (containerSecondary) containerSecondary.innerHTML = html;
}

// Render Tokens Table
function renderTokens() {
  const tbody = document.getElementById('tokens-tbody');
  if (!tbody) return;

  const now = Date.now();
  if (clientTokens.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 32px;">No active client tokens generated yet. Click "+ Generate Token" to issue one.</td></tr>`;
    return;
  }

  tbody.innerHTML = clientTokens
    .map((tk) => {
      const remainingSec = Math.max(0, Math.floor((tk.expiresAt - now) / 1000));
      const remainingStr = formatDuration(remainingSec);
      const isExpired = remainingSec === 0;

      return `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 12px; color: var(--accent-cyan);">
          ${escapeHtml(tk.token.substring(0, 10))}••••${escapeHtml(tk.token.substring(tk.token.length - 6))}
          <button class="btn btn-secondary btn-sm" style="padding: 2px 6px; margin-left: 6px; font-size: 10px;" onclick="window.copyText('${tk.token}', 'Token copied!')">
            Copy
          </button>
        </td>
        <td style="font-size: 12px; font-weight: 600; color: var(--text-main);">${escapeHtml(tk.label || 'Default')}</td>
        <td style="font-size: 12px; color: var(--text-muted);">${formatRelativeTime(tk.createdAt)}</td>
        <td style="font-family: var(--font-mono); font-size: 12px; color: ${isExpired ? 'var(--status-expired)' : 'var(--text-main)'};">
          ${isExpired ? 'Expired' : remainingStr}
        </td>
        <td style="text-align: right;">
          <button class="btn btn-danger btn-sm" onclick="window.revokeToken('${tk.token}')" style="padding: 3px 8px; font-size: 11px;">
            Revoke
          </button>
        </td>
      </tr>
    `;
    })
    .join('');
}

// Render Activity Log
function renderActivity(entries) {
  const tbody = document.getElementById('activity-tbody');
  if (!tbody) return;

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 32px;">No recent request traffic recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries
    .map((e) => {
      const timeStr = new Date(e.timestamp).toLocaleTimeString();
      let statusColorClass = 'status-2xx';
      if (e.statusCode >= 300 && e.statusCode < 400) statusColorClass = 'status-3xx';
      if (e.statusCode >= 400 && e.statusCode < 500) statusColorClass = 'status-4xx';
      if (e.statusCode >= 500) statusColorClass = 'status-5xx';

      return `
      <tr>
        <td style="font-family: var(--font-mono); color: var(--text-muted); font-size: 12px;">${timeStr}</td>
        <td><span class="tunnel-id-badge">${escapeHtml(e.tunnelId)}</span></td>
        <td><span class="method-tag method-${escapeHtml(e.method)}">${escapeHtml(e.method)}</span></td>
        <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-main); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(e.path)}
        </td>
        <td><span class="status-code ${statusColorClass}">${e.statusCode}</span></td>
        <td style="font-family: var(--font-mono); color: var(--text-muted); font-size: 12px;">${e.latencyMs}ms</td>
        <td style="font-family: var(--font-mono); color: var(--text-muted); font-size: 12px;">${formatBytes(e.responseSizeBytes)}</td>
      </tr>
    `;
    })
    .join('');
}

// Live Countdown Ticker
function updateCountdowns() {
  const now = Date.now();
  let hasExpired = false;

  tunnels.forEach((t) => {
    if (t.status === 'expired') return;
    const remainingSec = Math.max(0, Math.floor((t.expiresAt - now) / 1000));
    const countdownEl = document.getElementById(`countdown-${t.id}`);
    if (countdownEl) {
      countdownEl.textContent = formatDuration(remainingSec);
      if (remainingSec <= 300 && remainingSec > 0) {
        countdownEl.style.color = '#f97316';
      }
    }
    if (remainingSec === 0) {
      t.status = 'expired';
      hasExpired = true;
    }
  });

  if (hasExpired) {
    renderTunnels();
    loadStats();
  }
}

// Real-Time Dashboard WebSocket
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    const indicator = document.getElementById('system-status');
    if (indicator) {
      indicator.innerHTML = '<span class="status-dot"></span><span>SYSTEM ONLINE</span>';
      indicator.style.color = 'var(--status-connected)';
    }
  };

  ws.onmessage = (event) => {
    try {
      const { event: evtType, data } = JSON.parse(event.data);
      switch (evtType) {
        case 'tunnel_created': {
          tunnels.unshift(data);
          renderTunnels();
          loadStats();
          break;
        }
        case 'tunnel_updated': {
          const idx = tunnels.findIndex((t) => t.id === data.id);
          if (idx !== -1) {
            tunnels[idx] = data;
          } else {
            tunnels.unshift(data);
          }
          renderTunnels();
          loadStats();
          break;
        }
        case 'tunnel_expired': {
          const t = tunnels.find((item) => item.id === data.tunnelId);
          if (t) t.status = 'expired';
          renderTunnels();
          loadStats();
          break;
        }
        case 'activity_logged': {
          activityLogs.unshift(data);
          if (activityLogs.length > 60) activityLogs.pop();
          if (activeTab === 'activity') {
            renderActivity(activityLogs);
          }
          loadStats();
          break;
        }
      }
    } catch {}
  };

  ws.onclose = () => {
    const indicator = document.getElementById('system-status');
    if (indicator) {
      indicator.innerHTML = '<span class="status-dot" style="background: #f59e0b;"></span><span>RECONNECTING...</span>';
      indicator.style.color = '#f59e0b';
    }
    setTimeout(initWebSocket, 3000);
  };
}

// Modal handling
function setupModals() {
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('open');
      }
    });
  });

  document.querySelectorAll('.modal-close-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-backdrop').classList.remove('open');
    });
  });

  // Global Escape key listener to close modals immediately
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach((m) => m.classList.remove('open'));
    }
  });
}

function setupForms() {
  // Duration selector in Create Tunnel modal
  let selectedDuration = 3600; // 1 hour default
  const durationBtns = document.querySelectorAll('#modal-create-tunnel .duration-btn');
  durationBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      durationBtns.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedDuration = parseInt(btn.getAttribute('data-seconds'), 10);
    });
  });

  // Dedicated In-Page Create Tunnel Form
  let pageSelectedDuration = 3600;
  const pageDurationBtns = document.querySelectorAll('#page-duration-selector .duration-btn');
  pageDurationBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      pageDurationBtns.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      pageSelectedDuration = parseInt(btn.getAttribute('data-seconds'), 10);
    });
  });

  // Port preset buttons
  document.querySelectorAll('.page-port-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const port = btn.getAttribute('data-port');
      const portInput = document.getElementById('page-input-local-port');
      if (portInput) {
        portInput.value = port;
        portInput.focus();
      }
    });
  });

  // Page Create Tunnel Form Submit
  const pageCreateForm = document.getElementById('page-create-tunnel-form');
  if (pageCreateForm) {
    pageCreateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const port = parseInt(document.getElementById('page-input-local-port').value, 10);
      const label = document.getElementById('page-input-tunnel-label').value;

      const submitBtn = document.getElementById('btn-page-create-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Generating Tunnel...';

      try {
        const res = await fetchWithAuth('/api/tunnels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            port,
            duration: pageSelectedDuration,
            label,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Failed to create tunnel', 'error');
          return;
        }

        // Show result box
        const idleHint = document.getElementById('page-tunnel-idle-hint');
        const outputBox = document.getElementById('page-tunnel-output-box');
        const pubUrlEl = document.getElementById('page-res-public-url');
        const cliCmdEl = document.getElementById('page-res-cli-cmd');

        if (idleHint) idleHint.style.display = 'none';
        if (outputBox) outputBox.style.display = 'block';
        if (pubUrlEl) {
          pubUrlEl.href = data.tunnel.publicUrl;
          pubUrlEl.textContent = data.tunnel.publicUrl;
        }
        if (cliCmdEl) {
          cliCmdEl.textContent = data.cliCommand;
        }

        // Setup copy button
        const copyBtn = document.getElementById('btn-copy-page-cmd');
        if (copyBtn) {
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(data.cliCommand);
            showToast('CLI command copied to clipboard!', 'success');
          };
        }

        showToast('Tunnel created successfully!', 'success');
        await loadTunnels();
        await loadStats();
      } catch (err) {
        showToast('Network error creating tunnel', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Create Tunnel & Generate Command';
      }
    });
  }

  // Create Tunnel Modal Form Submit
  const createForm = document.getElementById('create-tunnel-form');
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const port = parseInt(document.getElementById('input-local-port').value, 10);
      const label = document.getElementById('input-tunnel-label').value;

      const submitBtn = document.getElementById('btn-submit-create');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';

      try {
        const res = await fetchWithAuth('/api/tunnels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            port,
            duration: selectedDuration,
            label,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Failed to create tunnel', 'error');
          return;
        }

        document.getElementById('modal-create-tunnel').classList.remove('open');
        showCommandModal(data.tunnel, data.cliCommand);
        await loadTunnels();
        await loadStats();
      } catch (err) {
        showToast('Network error creating tunnel', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Tunnel';
      }
    });
  }

  // Extend Tunnel Form Submit
  const extendForm = document.getElementById('extend-tunnel-form');
  if (extendForm) {
    extendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentExtendTunnelId) return;

      const seconds = parseInt(document.getElementById('extend-duration-select').value, 10);
      const submitBtn = document.getElementById('btn-submit-extend');
      submitBtn.disabled = true;

      try {
        const res = await fetchWithAuth(`/api/tunnels/${currentExtendTunnelId}/extend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds }),
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Failed to extend tunnel', 'error');
          return;
        }

        showToast('Tunnel duration extended successfully!', 'success');
        document.getElementById('modal-extend-tunnel').classList.remove('open');
        await loadTunnels();
      } catch {
        showToast('Network error extending tunnel', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // Generate Token Form Submit
  const tokenForm = document.getElementById('generate-token-form');
  if (tokenForm) {
    tokenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const label = document.getElementById('input-token-label').value.trim();
      const durationSeconds = parseInt(document.getElementById('select-token-duration').value, 10);

      const submitBtn = document.getElementById('btn-submit-token');
      submitBtn.disabled = true;

      try {
        const res = await fetchWithAuth('/api/tokens/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label, durationSeconds }),
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Failed to generate token', 'error');
          return;
        }

        showToast('Client token created successfully!', 'success');
        document.getElementById('modal-generate-token').classList.remove('open');
        await loadTokens();
      } catch {
        showToast('Network error generating token', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }
}

function showCommandModal(tunnel, cliCommand) {
  const modal = document.getElementById('modal-command-ready');
  if (!modal) return;

  document.getElementById('cmd-public-url').textContent = tunnel.publicUrl;
  document.getElementById('cmd-public-url').href = tunnel.publicUrl;
  document.getElementById('cmd-local-target').textContent = `127.0.0.1:${tunnel.localPort}`;
  document.getElementById('cmd-duration').textContent = formatDuration(tunnel.durationSeconds);
  document.getElementById('cmd-code-text').textContent = cliCommand;

  modal.classList.add('open');
}

// Global actions exposed to window
window.switchTab = switchTab;

window.openCreateModal = () => {
  switchTab('create');
};

window.openTokenModal = () => {
  document.getElementById('modal-generate-token').classList.add('open');
};

window.openExtendModal = (tunnelId) => {
  currentExtendTunnelId = tunnelId;
  const tunnel = tunnels.find((t) => t.id === tunnelId);
  if (tunnel) {
    document.getElementById('extend-tunnel-name').textContent = `${tunnel.label || 'Tunnel'} (${tunnel.id})`;
  }
  document.getElementById('modal-extend-tunnel').classList.add('open');
};

window.stopTunnel = async (tunnelId) => {
  if (!confirm(`Are you sure you want to stop tunnel ${tunnelId}? This will terminate all active connections.`)) {
    return;
  }
  try {
    const res = await fetchWithAuth(`/api/tunnels/${tunnelId}/stop`, { method: 'POST' });
    if (res.ok) {
      showToast(`Tunnel ${tunnelId} terminated`, 'info');
      await loadTunnels();
      await loadStats();
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to stop tunnel', 'error');
    }
  } catch {
    showToast('Failed to stop tunnel', 'error');
  }
};

window.revokeToken = async (token) => {
  if (!confirm('Are you sure you want to revoke this client token? Devices using it will be disconnected.')) {
    return;
  }
  try {
    const res = await fetchWithAuth(`/api/tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Token revoked successfully', 'info');
      await loadTokens();
    } else {
      showToast('Failed to revoke token', 'error');
    }
  } catch {
    showToast('Network error revoking token', 'error');
  }
};

window.copyText = (text, message = 'Copied to clipboard!') => {
  copyToClipboard(text, message);
};

window.copyCommandCode = () => {
  const code = document.getElementById('cmd-code-text').textContent;
  copyToClipboard(code, 'Termux command copied to clipboard!');
};

window.exportActivityCSV = () => {
  if (activityLogs.length === 0) {
    showToast('No activity logs available to export', 'info');
    return;
  }

  const headers = ['Timestamp', 'TunnelId', 'Method', 'Path', 'StatusCode', 'LatencyMs', 'ResponseSizeBytes'];
  const rows = activityLogs.map((item) => [
    new Date(item.timestamp).toISOString(),
    item.tunnelId,
    item.method,
    `"${item.path.replace(/"/g, '""')}"`,
    item.statusCode,
    item.latencyMs,
    item.responseSizeBytes,
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `r-tunnel-traffic-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('Activity CSV exported', 'success');
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
