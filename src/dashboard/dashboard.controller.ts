import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller()
export class DashboardController {
  @Get('/dashboard')
  serveDashboard(@Res() res: Response) {
    res.type('html').send(DASHBOARD_HTML);
  }
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KCP - Control Plane Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e1e4e8; min-height: 100vh; }
  .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 20px; font-weight: 600; }
  .header h1 span { color: #58a6ff; }
  .header .meta { font-size: 13px; color: #8b949e; }
  .header .meta .live { color: #3fb950; }
  .container { max-width: 1400px; margin: 0 auto; padding: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
  .card h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #8b949e; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .card h2 .icon { font-size: 16px; }
  .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #21262d; }
  .stat-row:last-child { border-bottom: none; }
  .stat-label { color: #8b949e; font-size: 13px; }
  .stat-value { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stat-value.green { color: #3fb950; }
  .stat-value.yellow { color: #d29922; }
  .stat-value.red { color: #f85149; }
  .stat-value.blue { color: #58a6ff; }
  .big-number { font-size: 36px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .big-number-row { display: flex; gap: 32px; margin-bottom: 12px; }
  .big-stat { text-align: center; }
  .big-stat .label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .node-card { background: #1c2128; border: 1px solid #30363d; border-radius: 6px; padding: 14px; margin-bottom: 10px; }
  .node-card:last-child { margin-bottom: 0; }
  .node-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .node-name { font-weight: 600; font-size: 14px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .badge.online { background: #0d3117; color: #3fb950; }
  .badge.offline { background: #3d1f1f; color: #f85149; }
  .badge.draining { background: #3d2e00; color: #d29922; }
  .badge.maintenance { background: #1f2937; color: #8b949e; }
  .progress-bar { height: 6px; background: #21262d; border-radius: 3px; overflow: hidden; margin-top: 4px; }
  .progress-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
  .progress-fill.low { background: #3fb950; }
  .progress-fill.mid { background: #d29922; }
  .progress-fill.high { background: #f85149; }
  .node-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
  .node-metric-label { color: #8b949e; }
  .node-metric-value { text-align: right; font-variant-numeric: tabular-nums; }
  .job-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .job-table th { text-align: left; color: #8b949e; font-weight: 500; padding: 8px 6px; border-bottom: 1px solid #30363d; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  .job-table td { padding: 8px 6px; border-bottom: 1px solid #21262d; font-variant-numeric: tabular-nums; }
  .job-table tr:last-child td { border-bottom: none; }
  .platform-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; }
  .platform-badge.web { background: #1f3a5f; color: #58a6ff; }
  .platform-badge.ios { background: #1f3d2f; color: #3fb950; }
  .platform-badge.android { background: #3d2e00; color: #d29922; }
  .wide { grid-column: 1 / -1; }
  .empty { color: #484f58; font-style: italic; text-align: center; padding: 24px; }
  .refresh-indicator { display: inline-block; width: 8px; height: 8px; background: #3fb950; border-radius: 50%; margin-right: 6px; animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .error-banner { background: #3d1f1f; border: 1px solid #f85149; color: #f85149; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; display: none; }
</style>
</head>
<body>
<div class="header">
  <h1><span>KCP</span> Control Plane Dashboard</h1>
  <div class="meta"><span class="refresh-indicator"></span><span class="live">LIVE</span> &middot; Auto-refresh 5s &middot; <span id="last-update">--</span></div>
</div>
<div class="container">
  <div id="error-banner" class="error-banner"></div>

  <div class="grid">
    <!-- Cluster Overview -->
    <div class="card">
      <h2><span class="icon">&#9684;</span> Cluster Overview</h2>
      <div class="big-number-row">
        <div class="big-stat"><div class="big-number green" id="c-online">-</div><div class="label">Online</div></div>
        <div class="big-stat"><div class="big-number yellow" id="c-draining">-</div><div class="label">Draining</div></div>
        <div class="big-stat"><div class="big-number red" id="c-offline">-</div><div class="label">Offline</div></div>
      </div>
      <div class="stat-row"><span class="stat-label">Total Nodes</span><span class="stat-value" id="c-total">-</span></div>
      <div class="stat-row"><span class="stat-label">CPU Cores</span><span class="stat-value" id="c-cpu">-</span></div>
      <div class="stat-row"><span class="stat-label">Memory</span><span class="stat-value" id="c-mem">-</span></div>
      <div class="stat-row"><span class="stat-label">Avg CPU Usage</span><span class="stat-value" id="c-cpu-usage">-</span></div>
      <div class="stat-row"><span class="stat-label">Avg Memory Usage</span><span class="stat-value" id="c-mem-usage">-</span></div>
    </div>

    <!-- Job Stats -->
    <div class="card">
      <h2><span class="icon">&#9881;</span> Job Queue</h2>
      <div class="big-number-row">
        <div class="big-stat"><div class="big-number blue" id="j-pending">-</div><div class="label">Pending</div></div>
        <div class="big-stat"><div class="big-number yellow" id="j-assigned">-</div><div class="label">Assigned</div></div>
        <div class="big-stat"><div class="big-number green" id="j-running">-</div><div class="label">Running</div></div>
      </div>
      <div class="stat-row"><span class="stat-label">Completed</span><span class="stat-value green" id="j-completed">-</span></div>
      <div class="stat-row"><span class="stat-label">Failed</span><span class="stat-value red" id="j-failed">-</span></div>
      <div class="stat-row"><span class="stat-label">Cancelled</span><span class="stat-value" id="j-cancelled">-</span></div>
      <div class="stat-row"><span class="stat-label">Active Leases</span><span class="stat-value blue" id="j-leases">-</span></div>
    </div>

    <!-- Capacity by Platform -->
    <div class="card">
      <h2><span class="icon">&#9636;</span> Platform Capacity</h2>
      <div id="capacity-container"><div class="empty">Loading...</div></div>
    </div>
  </div>

  <!-- Metrics -->
  <div class="grid">
    <div class="card">
      <h2><span class="icon">&#9888;</span> Reliability Metrics</h2>
      <div class="stat-row"><span class="stat-label">Recent Jobs Sampled</span><span class="stat-value" id="m-sample">-</span></div>
      <div class="stat-row"><span class="stat-label">Fail Rate</span><span class="stat-value" id="m-fail">-</span></div>
      <div class="stat-row"><span class="stat-label">Infra Fail Rate</span><span class="stat-value" id="m-infra">-</span></div>
    </div>
  </div>

  <!-- Nodes -->
  <div class="grid">
    <div class="card wide">
      <h2><span class="icon">&#9673;</span> Nodes</h2>
      <div id="nodes-container"><div class="empty">Loading...</div></div>
    </div>
  </div>

  <!-- Pending Jobs -->
  <div class="grid">
    <div class="card wide">
      <h2><span class="icon">&#9776;</span> Pending Jobs</h2>
      <div id="pending-container"><div class="empty">Loading...</div></div>
    </div>
  </div>
</div>

<script>
const API = '/api';

function progressClass(pct) {
  if (pct < 60) return 'low';
  if (pct < 85) return 'mid';
  return 'high';
}

function timeAgo(dateStr) {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return Math.round(diff / 1000) + 's ago';
  if (diff < 3600000) return Math.round(diff / 60000) + 'm ago';
  return Math.round(diff / 3600000) + 'h ago';
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderCapacity(slots, devices) {
  const container = document.getElementById('capacity-container');
  const platforms = new Set([...Object.keys(slots || {}), ...Object.keys(devices || {})]);
  if (!platforms.size) { container.innerHTML = '<div class="empty">No platforms registered</div>'; return; }

  let html = '';
  for (const p of platforms) {
    const s = slots?.[p] || {};
    const d = devices?.[p] || {};
    html += '<div style="margin-bottom:12px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
    html += '<span class="platform-badge ' + p + '">' + p.toUpperCase() + '</span>';
    html += '<span style="font-size:12px;color:#8b949e">Slots: ' + (s.available || 0) + '/' + (s.total || 0) + ' &middot; Devices: ' + (d.available || 0) + '/' + (d.total || 0) + '</span>';
    html += '</div>';
    const slotPct = s.total ? ((s.total - (s.available || 0)) / s.total * 100) : 0;
    html += '<div class="progress-bar"><div class="progress-fill ' + progressClass(slotPct) + '" style="width:' + slotPct + '%"></div></div>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function renderNodes(nodes) {
  const container = document.getElementById('nodes-container');
  if (!nodes?.length) { container.innerHTML = '<div class="empty">No nodes registered</div>'; return; }

  let html = '';
  for (const n of nodes) {
    const status = n.status || 'offline';
    html += '<div class="node-card">';
    html += '<div class="node-header">';
    html += '<span class="node-name">' + (n.name || n.id) + '</span>';
    html += '<span class="badge ' + status + '">' + status + '</span>';
    html += '</div>';
    html += '<div class="node-metrics">';
    html += '<span class="node-metric-label">CPU</span><span class="node-metric-value">' + (n.cpuUsagePercent || 0).toFixed(1) + '% (' + (n.cpuCores || 0) + ' cores)</span>';
    html += '<span class="node-metric-label">Memory</span><span class="node-metric-value">' + (n.memoryUsagePercent || 0).toFixed(1) + '% (' + (n.memoryMb || 0) + ' MB)</span>';
    html += '<span class="node-metric-label">Platforms</span><span class="node-metric-value">' + (n.platforms || []).join(', ') + '</span>';
    html += '<span class="node-metric-label">Last Heartbeat</span><span class="node-metric-value">' + timeAgo(n.lastHeartbeatAt) + '</span>';
    html += '<span class="node-metric-label">Host</span><span class="node-metric-value">' + (n.host || '-') + ':' + (n.port || '-') + '</span>';
    html += '<span class="node-metric-label">Agent</span><span class="node-metric-value">' + (n.metadata?.agentVersion || '-') + '</span>';
    html += '</div>';
    // CPU bar
    html += '<div style="margin-top:8px;font-size:11px;color:#8b949e">CPU</div>';
    html += '<div class="progress-bar"><div class="progress-fill ' + progressClass(n.cpuUsagePercent || 0) + '" style="width:' + (n.cpuUsagePercent || 0) + '%"></div></div>';
    html += '<div style="margin-top:4px;font-size:11px;color:#8b949e">Memory</div>';
    html += '<div class="progress-bar"><div class="progress-fill ' + progressClass(n.memoryUsagePercent || 0) + '" style="width:' + (n.memoryUsagePercent || 0) + '%"></div></div>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function renderPendingJobs(jobs) {
  const container = document.getElementById('pending-container');
  if (!jobs?.length) { container.innerHTML = '<div class="empty">No pending jobs</div>'; return; }

  let html = '<table class="job-table"><thead><tr><th>ID</th><th>Platform</th><th>Priority</th><th>Attempt</th><th>Created</th></tr></thead><tbody>';
  for (const j of jobs.slice(0, 20)) {
    html += '<tr>';
    html += '<td style="font-family:monospace;font-size:12px">' + (j.id?.substring(0, 8) || '-') + '</td>';
    html += '<td><span class="platform-badge ' + (j.platform || '') + '">' + (j.platform || '-').toUpperCase() + '</span></td>';
    html += '<td>' + (j.priority ?? 0) + '</td>';
    html += '<td>' + (j.attempt || 1) + '/' + (j.maxAttempts || 3) + '</td>';
    html += '<td>' + timeAgo(j.createdAt) + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  if (jobs.length > 20) html += '<div style="text-align:center;color:#8b949e;font-size:12px;padding:8px">+ ' + (jobs.length - 20) + ' more</div>';
  container.innerHTML = html;
}

async function fetchData() {
  const errBanner = document.getElementById('error-banner');
  try {
    const [poolRes, nodesRes, pendingRes] = await Promise.all([
      fetch(API + '/resources/pool'),
      fetch(API + '/nodes'),
      fetch(API + '/jobs/pending'),
    ]);

    const pool = await poolRes.json();
    const nodes = await nodesRes.json();
    const pending = await pendingRes.json();

    // Cluster
    const c = pool.cluster || {};
    setText('c-online', c.onlineNodes ?? 0);
    setText('c-draining', c.drainingNodes ?? 0);
    setText('c-offline', c.offlineNodes ?? 0);
    setText('c-total', c.totalNodes ?? 0);
    setText('c-cpu', c.totalCpuCores ?? 0);
    setText('c-mem', c.totalMemoryMb ? Math.round(c.totalMemoryMb / 1024 * 10) / 10 + ' GB' : '0');
    setText('c-cpu-usage', (c.avgCpuUsagePercent ?? 0) + '%');
    setText('c-mem-usage', (c.avgMemoryUsagePercent ?? 0) + '%');

    // Jobs
    const j = pool.jobs || {};
    setText('j-pending', j.pending ?? 0);
    setText('j-assigned', j.assigned ?? 0);
    setText('j-running', j.running ?? 0);
    setText('j-completed', j.completed ?? 0);
    setText('j-failed', j.failed ?? 0);
    setText('j-cancelled', j.cancelled ?? 0);
    setText('j-leases', pool.activeLeases ?? 0);

    // Metrics
    const m = pool.metrics || {};
    setText('m-sample', m.recentJobCount ?? 0);
    const failEl = document.getElementById('m-fail');
    const infraEl = document.getElementById('m-infra');
    if (failEl) { failEl.textContent = (m.recentFailRate ?? 0) + '%'; failEl.className = 'stat-value ' + (m.recentFailRate > 10 ? 'red' : m.recentFailRate > 5 ? 'yellow' : 'green'); }
    if (infraEl) { infraEl.textContent = (m.recentInfraFailRate ?? 0) + '%'; infraEl.className = 'stat-value ' + (m.recentInfraFailRate > 5 ? 'red' : m.recentInfraFailRate > 2 ? 'yellow' : 'green'); }

    // Capacity
    renderCapacity(pool.slots, pool.devices);

    // Nodes
    renderNodes(nodes);

    // Pending jobs
    renderPendingJobs(pending);

    setText('last-update', new Date().toLocaleTimeString());
    errBanner.style.display = 'none';
  } catch (e) {
    errBanner.textContent = 'Failed to fetch data: ' + e.message;
    errBanner.style.display = 'block';
  }
}

fetchData();
setInterval(fetchData, 5000);
</script>
</body>
</html>`;
