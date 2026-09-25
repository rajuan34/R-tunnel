import {
  setCsrfToken,
  fetchWithAuth,
  showToast,
  copyToClipboard,
  formatBytes,
  formatDuration,
  formatRelativeTime,
} from './common.js';

let tunnels = [];
let systemStats = null;
let activeTab = 'dashboard';
let ws = null;
let currentExtendTunnelId = null;

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupModals();
  setupForms();

  const authOk = await checkAuth();
  if (!authOk) {
    window.location.replace('/login');
    return;
  }

  await loadInitialData();
  initWebSocket();

  // Run countdown ticker every second
  setInterval(updateCountdowns, 1000);
});

// Authentication check
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
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

  // Mobile menu toggle
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.querySelector('.sidebar');
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetchWithAuth('/api/auth/logout', { method: 'POST' });
      window.location.replace('/login');
    });
  }
}

function switchTab(tabId) {
  activeTab = tabId;

  // Update active links
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
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');

  if (tabId === 'activity') {
    loadActivity();
  }
}

// Initial Data Fetch
async function loadInitialData() {
  await Promise.all([loadStats(), loadTunnels(), loadActivity()]);
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

async function loadActivity() {
  try {
    const res = await fetchWithAuth('/api/activity?limit=50');
    if (res.ok) {
      const data = await res.json();
      renderActivity(data.activity || []);
    }
  } catch {}
}

// Render Stats Cards
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
}

// Render Tunnels Grid
function renderTunnels() {
  const container = document.getElementById('tunnels-container');
  const countBadge = document.getElementById('active-tunnels-count');
  if (!container) return;

  const activeTunnels = tunnels.filter((t) => t.status !== 'expired' && t.expiresAt > Date.now());
  if (countBadge) countBadge.textContent = activeTunnels.length;

  if (activeTunnels.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; background: var(--bg-surface); border: 1px dashed var(--border-muted); border-radius: var(--radius-md); padding: 48px; text-align: center;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-dim); margin-bottom: 12px;">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <h3 style="color: var(--text-main); font-size: 16px; margin-bottom: 6px;">No Active Tunnels</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 18px;">Click "Create Tunnel" to expose a local port via Android Termux.</p>
        <button class="btn btn-primary btn-sm" onclick="window.openCreateModal()">Create Tunnel</button>
      </div>
    `;
    return;
  }

  container.innerHTML = activeTunnels
    .map((t) => {
      const remainingSec = Math.max(0, Math.floor((t.expiresAt - Date.now()) / 1000));
      const remainingStr = formatDuration(remainingSec);
      const isExpiring = remainingSec <= 300;
      const statusClass = isExpiring ? 'badge-expiring' : `badge-${t.status}`;
      const statusText = isExpiring ? 'EXPIRING' : t.status.toUpperCase();

      return `
      <div class="tunnel-card" id="tunnel-card-${t.id}">
        <div class="tunnel-card-top">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span class="tunnel-id-badge">${t.id}</span>
              <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            <h4 style="font-size: 14px; font-weight: 600; color: var(--text-main);">${escapeHtml(t.label || 'Tunnel')}</h4>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.copyText('${t.publicUrl}')" title="Copy Public URL">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
            <span class="detail-key">Local Target</span>
            <span class="detail-val">127.0.0.1:${t.localPort}</span>
          </div>
          <div class="detail-item">
            <span class="detail-key">Expires In</span>
            <span class="detail-val" id="countdown-${t.id}" style="${isExpiring ? 'color: #f97316;' : ''}">${remainingStr}</span>
          </div>
          <div class="detail-item">
            <span class="detail-key">Requests</span>
            <span class="detail-val">${t.requestCount.toLocaleString()}</span>
          </div>
          <div class="detail-item">
            <span class="detail-key">Traffic</span>
            <span class="detail-val">${formatBytes(t.bytesIn + t.bytesOut)}</span>
          </div>
        </div>

        <div class="tunnel-card-actions">
          <a href="${t.publicUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="flex: 1;">
            Open URL
          </a>
          <button class="btn btn-secondary btn-sm" onclick="window.openExtendModal('${t.id}')">
            Extend
          </button>
          <button class="btn btn-danger btn-sm" onclick="window.stopTunnel('${t.id}')">
            Stop
          </button>
        </div>
      </div>
    `;
    })
    .join('');
}

// Render Activity Log
function renderActivity(entries) {
  const tbody = document.getElementById('activity-tbody');
  if (!tbody) return;

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 32px;">No recent request activity recorded.</td></tr>`;
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
      if (remainingSec <= 300) {
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
          // Prepend to activity log if visible
          const tbody = document.getElementById('activity-tbody');
          if (tbody) {
            loadActivity();
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
    // Auto reconnect
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
}

function setupForms() {
  // Duration selector in Create Tunnel modal
  let selectedDuration = 3600; // 1 hour default
  const durationBtns = document.querySelectorAll('.duration-btn');
  durationBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      durationBtns.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedDuration = parseInt(btn.getAttribute('data-seconds'), 10);
    });
  });

  // Create Tunnel Form Submit
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

        // Close create modal
        document.getElementById('modal-create-tunnel').classList.remove('open');

        // Open command generator modal with generated Termux command
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

// Global actions exposed to window for inline onclick attributes
window.openCreateModal = () => {
  document.getElementById('modal-create-tunnel').classList.add('open');
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
  if (!confirm(`Are you sure you want to stop tunnel ${tunnelId}? This will immediately terminate the connection.`)) {
    return;
  }
  try {
    const res = await fetchWithAuth(`/api/tunnels/${tunnelId}/stop`, { method: 'POST' });
    if (res.ok) {
      showToast(`Tunnel ${tunnelId} stopped`, 'info');
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

window.copyText = (text) => {
  copyToClipboard(text, 'URL copied to clipboard!');
};

window.copyCommandCode = () => {
  const code = document.getElementById('cmd-code-text').textContent;
  copyToClipboard(code, 'Termux command copied to clipboard!');
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
