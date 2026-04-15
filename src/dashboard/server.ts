import express from 'express';
import path from 'path';
import { initWebSocketServer } from '../events/broadcaster';
import open from 'open';

const WS_PORT = 4002;

export async function startDashboard(port: number): Promise<void> {
  const app = express();

  // Serve static dashboard files
  const publicDir = path.join(__dirname, '../../dashboard/dist');
  app.use(express.static(publicDir));

  // Fallback: serve inline dashboard if no build exists
  app.get('*', (_req, res) => {
    res.send(getInlineDashboard(WS_PORT));
  });

  // Start WebSocket server for real-time events
  initWebSocketServer(WS_PORT);

  return new Promise((resolve) => {
    app.listen(port, async () => {
      await open(`http://localhost:${port}`);
      resolve();
    });
  });
}

function getInlineDashboard(wsPort: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Agent DevTools</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d1117; color: #e0e0e0; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; }

    /* ── Header ── */
    header { background: #161b22; padding: 10px 20px; border-bottom: 1px solid #30363d; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 14px; color: #e94560; letter-spacing: 1.5px; }
    #status { font-size: 11px; color: #888; }
    #status.connected { color: #3fb950; }
    .tabs { display: flex; gap: 4px; margin-left: auto; }
    .tab-btn { background: none; border: 1px solid #30363d; color: #888; border-radius: 4px; padding: 4px 16px; cursor: pointer; font-family: inherit; font-size: 11px; transition: all 0.15s; }
    .tab-btn.active { background: #0d2044; border-color: #58a6ff; color: #58a6ff; }
    .tab-btn:hover:not(.active) { border-color: #aaa; color: #ccc; }

    /* ── Events view (original) ── */
    #events-view { display: flex; height: calc(100vh - 45px); }
    #timeline { width: 320px; border-right: 1px solid #30363d; overflow-y: auto; flex-shrink: 0; }
    #detail { flex: 1; overflow-y: auto; padding: 16px; }
    .event-item { padding: 10px 14px; border-bottom: 1px solid #21262d; cursor: pointer; transition: background 0.1s; }
    .event-item:hover, .event-item.active { background: #0d2044; }
    .epath { color: #58a6ff; }
    .etime { color: #888; font-size: 11px; }
    .estatus { font-size: 11px; }
    .estatus.ok { color: #3fb950; }
    .estatus.err { color: #e94560; }
    .tool-badge { display: inline-block; background: #e94560; color: #fff; border-radius: 3px; padding: 1px 5px; font-size: 10px; margin: 2px 2px 0 0; }
    .tokens { color: #ffd54f; }
    pre { background: #161b22; border: 1px solid #30363d; border-radius: 4px; padding: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; font-size: 12px; }
    h3 { color: #58a6ff; margin: 16px 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }

    /* ── Flow view ── */
    #flow-view { display: none; height: calc(100vh - 45px); overflow-y: auto; padding: 28px 40px; }

    .flow-step { display: flex; gap: 16px; }
    .flow-spine { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 16px; }
    .flow-dot { width: 14px; height: 14px; border-radius: 50%; background: #e94560; box-shadow: 0 0 8px #e9456066; flex-shrink: 0; z-index: 1; }
    .flow-dot.done { background: #3fb950; box-shadow: 0 0 8px #3fb95066; }
    .flow-line { width: 2px; background: #30363d; flex: 1; min-height: 16px; margin: 4px 0; }
    .flow-content { flex: 1; padding-bottom: 24px; }

    .flow-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .flow-time  { color: #888; font-size: 11px; }
    .flow-model { color: #58a6ff; font-size: 11px; }
    .flow-tokens { color: #ffd54f; font-size: 11px; }
    .flow-stop  { font-size: 10px; border-radius: 10px; padding: 2px 8px; border: 1px solid #30363d; color: #888; }
    .flow-stop.tool_use { border-color: #e94560; color: #e94560; }
    .flow-stop.end_turn  { border-color: #3fb950; color: #3fb950; }

    /* Tool cards */
    .tool-cards { display: flex; flex-wrap: wrap; gap: 8px; }
    .tool-card {
      background: #161b22; border: 1px solid #30363d; border-left-width: 3px;
      border-radius: 6px; padding: 10px 14px; cursor: pointer;
      transition: transform 0.12s, box-shadow 0.12s;
      min-width: 140px; max-width: 260px; user-select: none;
    }
    .tool-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.45); }
    .tool-card.selected { box-shadow: 0 4px 16px rgba(0,0,0,.5); opacity: 0.9; }
    .tool-card.web   { border-left-color: #58a6ff; }
    .tool-card.bash  { border-left-color: #3fb950; }
    .tool-card.file  { border-left-color: #ffd54f; }
    .tool-card.music { border-left-color: #e040fb; }
    .tool-card.other { border-left-color: #e94560; }
    .tc-icon  { font-size: 22px; line-height: 1; margin-bottom: 6px; }
    .tc-name  { font-size: 11px; font-weight: 700; color: #e0e0e0; }
    .tc-input { font-size: 10px; color: #888; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }

    /* Result panels */
    .result-panel { display: none; margin-top: 8px; border-radius: 6px; border: 1px solid #30363d; overflow: hidden; }
    .result-panel.visible { display: block; }

    /* Browser panel */
    .browser-chrome { background: #21262d; padding: 6px 10px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #30363d; }
    .bdot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .bdot.r { background: #ff5f56; } .bdot.y { background: #ffbd2e; } .bdot.g { background: #27c93f; }
    .burl { flex: 1; background: #161b22; border-radius: 3px; padding: 2px 8px; font-size: 10px; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .browser-body { background: #0d1117; padding: 10px 12px; overflow-y: auto; max-height: 200px; white-space: pre-wrap; color: #ccc; line-height: 1.5; font-size: 11px; }

    /* Terminal panel */
    .terminal-chrome { background: #1a1a1a; padding: 6px 10px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #333; }
    .terminal-title  { color: #888; font-size: 10px; margin-left: 4px; }
    .terminal-body   { background: #0d0d0d; padding: 10px 12px; overflow-y: auto; max-height: 200px; white-space: pre-wrap; color: #3fb950; font-family: 'SF Mono', monospace; line-height: 1.4; font-size: 11px; }

    /* Generic result */
    .plain-body { background: #161b22; padding: 10px 12px; overflow-y: auto; max-height: 200px; white-space: pre-wrap; color: #ccc; line-height: 1.5; font-size: 11px; }

    #empty-flow { color: #555; text-align: center; margin-top: 80px; line-height: 2.2; font-size: 14px; }
  </style>
</head>
<body>
  <header>
    <h1>Agent DevTools</h1>
    <span id="status">connecting...</span>
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('events', this)">Events</button>
      <button class="tab-btn"        onclick="switchTab('flow',   this)">Flow</button>
    </div>
  </header>

  <!-- Events view (original list + detail) -->
  <div id="events-view">
    <div id="timeline">
      <div id="empty-list" style="padding:20px;color:#555">No events yet.<br/>Start your agent.</div>
    </div>
    <div id="detail">
      <p style="color:#555;margin-top:60px;text-align:center">Select an event to inspect it.</p>
    </div>
  </div>

  <!-- Flow view (visual diagram) -->
  <div id="flow-view">
    <div id="flow-container">
      <div id="empty-flow">No events yet.<br/>Start your agent to see the flow.</div>
    </div>
  </div>

  <script>
    var events    = [];
    var selectedId = null;
    var openToolId = null;

    var ws = new WebSocket('ws://localhost:${wsPort}');
    var statusEl = document.getElementById('status');

    ws.onopen  = function() { statusEl.textContent = '● connected';    statusEl.className = 'connected'; };
    ws.onclose = function() { statusEl.textContent = '○ disconnected'; statusEl.className = '';          };

    ws.onmessage = function(msg) {
      var data = JSON.parse(msg.data);
      if      (data.type === 'history') events = data.events;
      else if (data.type === 'event')   events.push(data.event);
      renderTimeline();
      renderFlow();
    };

    /* ── Tab switching ── */
    function switchTab(tab, btn) {
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('events-view').style.display = tab === 'events' ? 'flex'  : 'none';
      document.getElementById('flow-view'  ).style.display = tab === 'flow'   ? 'block' : 'none';
    }

    /* ── Tool helpers ── */
    function toolType(name) {
      var n = name.toLowerCase();
      if (n.indexOf('search') !== -1 || n.indexOf('web') !== -1 || n.indexOf('browse') !== -1 || n.indexOf('fetch') !== -1 || n.indexOf('http') !== -1) return 'web';
      if (n.indexOf('bash') !== -1 || n.indexOf('shell') !== -1 || n.indexOf('run') !== -1 || n.indexOf('exec') !== -1 || n.indexOf('command') !== -1) return 'bash';
      if (n.indexOf('file') !== -1 || n.indexOf('read') !== -1 || n.indexOf('write') !== -1 || n.indexOf('list') !== -1) return 'file';
      if (n.indexOf('song') !== -1 || n.indexOf('music') !== -1 || n.indexOf('audio') !== -1 || n.indexOf('itunes') !== -1) return 'music';
      return 'other';
    }

    function toolIcon(name) {
      var t = toolType(name);
      if (t === 'web')   return '🌐';
      if (t === 'bash')  return '💻';
      if (t === 'file')  return '📄';
      if (t === 'music') return '🎵';
      return '🔧';
    }

    function shortInput(input) {
      var vals = Object.values(input || {});
      if (vals.length > 0 && typeof vals[0] === 'string') {
        var v = vals[0];
        return v.length > 48 ? v.slice(0, 48) + '…' : v;
      }
      var s = JSON.stringify(input || {});
      return s.length > 48 ? s.slice(0, 48) + '…' : s;
    }

    /* Extract tool_result blocks from the NEXT event's request messages */
    function getToolResults(eventIdx) {
      if (eventIdx >= events.length - 1) return {};
      var nextEvt = events[eventIdx + 1];
      var results = {};
      var msgs = (nextEvt.request && nextEvt.request.messages) || [];
      for (var i = 0; i < msgs.length; i++) {
        var msg = msgs[i];
        if (msg.role === 'user' && Array.isArray(msg.content)) {
          for (var j = 0; j < msg.content.length; j++) {
            var block = msg.content[j];
            if (block.type === 'tool_result') {
              var c = block.content;
              results[block.tool_use_id] =
                typeof c === 'string'   ? c
                : Array.isArray(c)     ? c.map(function(x) { return x.text || JSON.stringify(x); }).join('\\n')
                : JSON.stringify(c, null, 2);
            }
          }
        }
      }
      return results;
    }

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* ── Events view ── */
    function renderTimeline() {
      var tl    = document.getElementById('timeline');
      var empty = document.getElementById('empty-list');
      if (events.length > 0 && empty) empty.remove();

      tl.innerHTML = events.slice().reverse().map(function(e) {
        var t    = new Date(e.timestamp).toLocaleTimeString();
        var ok   = e.statusCode < 400;
        var u    = e.response.usage;
        var tok  = u ? (u.input_tokens + u.output_tokens) : null;
        var badges = e.toolCalls.map(function(tc) {
          return '<span class="tool-badge">' + esc(tc.name) + '</span>';
        }).join('');
        var cls  = 'event-item' + (e.id === selectedId ? ' active' : '');
        return '<div class="' + cls + '" onclick="selectEvent(\\''+e.id+'\\')">'+
          '<div style="display:flex;justify-content:space-between">'+
            '<span class="epath">' + esc(e.path) + '</span>'+
            '<span class="estatus ' + (ok?'ok':'err') + '">' + e.statusCode + '</span>'+
          '</div>'+
          '<div class="etime">' + t + (tok ? ' &nbsp;·&nbsp; <span class="tokens">'+tok+' tokens</span>' : '') + '</div>'+
          '<div style="margin-top:4px">' + badges + '</div>'+
        '</div>';
      }).join('');
    }

    function selectEvent(id) {
      selectedId = id;
      renderTimeline();
      var e = events.find(function(ev) { return ev.id === id; });
      if (!e) return;
      var u = e.response.usage;
      document.getElementById('detail').innerHTML =
        '<h3>Request</h3><pre>' + esc(JSON.stringify(e.request, null, 2)) + '</pre>' +
        '<h3>Response</h3><pre>' + esc(JSON.stringify(e.response, null, 2)) + '</pre>' +
        (e.toolCalls.length ? '<h3>Tool Calls</h3><pre>' + esc(JSON.stringify(e.toolCalls, null, 2)) + '</pre>' : '') +
        (u ? '<h3>Token Usage</h3><pre>Input:  ' + u.input_tokens + '\\nOutput: ' + u.output_tokens + '\\nTotal:  ' + (u.input_tokens + u.output_tokens) + '</pre>' : '');
    }

    /* ── Flow view ── */
    function renderFlow() {
      var container = document.getElementById('flow-container');
      if (events.length === 0) {
        container.innerHTML = '<div id="empty-flow">No events yet.<br/>Start your agent to see the flow.</div>';
        return;
      }

      container.innerHTML = events.map(function(e, idx) {
        var t       = new Date(e.timestamp).toLocaleTimeString();
        var stop    = e.response.stopReason || 'unknown';
        var isLast  = idx === events.length - 1;
        var isEnd   = stop === 'end_turn';
        var u       = e.response.usage;
        var total   = u ? (u.input_tokens + u.output_tokens) : null;
        var results = getToolResults(idx);

        /* Tool cards */
        var cards = e.toolCalls.map(function(tc) {
          var type = toolType(tc.name);
          var icon = toolIcon(tc.name);
          var inp  = esc(shortInput(tc.input));
          var sel  = openToolId === tc.id ? ' selected' : '';
          return '<div class="tool-card ' + type + sel + '" id="card-'+tc.id+'" onclick="toggleResult(\\''+tc.id+'\\')">'+
            '<div class="tc-icon">'  + icon            + '</div>'+
            '<div class="tc-name">'  + esc(tc.name)   + '</div>'+
            '<div class="tc-input">' + inp             + '</div>'+
          '</div>';
        }).join('');

        /* Result panels */
        var panels = e.toolCalls.map(function(tc) {
          var type   = toolType(tc.name);
          var result = results[tc.id];
          var show   = openToolId === tc.id;
          var cls    = 'result-panel' + (show ? ' visible' : '');
          var inner  = '';

          if (type === 'web') {
            var urlLabel = esc(JSON.stringify(tc.input).slice(0, 64));
            inner =
              '<div class="browser-chrome">'+
                '<span class="bdot r"></span><span class="bdot y"></span><span class="bdot g"></span>'+
                '<span class="burl">🌐 &nbsp;' + urlLabel + '</span>'+
              '</div>'+
              '<div class="browser-body">' +
                (result ? esc(result) : '<span style="color:#555">Waiting for result…</span>') +
              '</div>';
          } else if (type === 'bash') {
            inner =
              '<div class="terminal-chrome">'+
                '<span class="bdot r"></span><span class="bdot y"></span><span class="bdot g"></span>'+
                '<span class="terminal-title">bash — ' + esc(tc.name) + '</span>'+
              '</div>'+
              '<div class="terminal-body">' +
                (result ? esc(result) : '<span style="color:#555">Waiting for result…</span>') +
              '</div>';
          } else {
            inner = '<div class="plain-body">' +
              (result ? esc(result) : '<span style="color:#555">Waiting for result…</span>') +
            '</div>';
          }

          return '<div class="' + cls + '" id="result-'+tc.id+'">' + inner + '</div>';
        }).join('');

        return '<div class="flow-step">'+
          /* spine */
          '<div class="flow-spine">'+
            '<div class="flow-dot' + (isEnd ? ' done' : '') + '"></div>'+
            (!isLast ? '<div class="flow-line"></div>' : '')+
          '</div>'+
          /* content */
          '<div class="flow-content">'+
            '<div class="flow-meta">'+
              '<span class="flow-time">'  + t  + '</span>'+
              (e.request.model ? '<span class="flow-model">'   + esc(e.request.model) + '</span>' : '')+
              (total           ? '<span class="flow-tokens">⬡ '+ total + ' tok</span>'             : '')+
              '<span class="flow-stop ' + stop + '">' + stop + '</span>'+
            '</div>'+
            (e.toolCalls.length ? '<div class="tool-cards">' + cards + '</div>' + panels : '')+
          '</div>'+
        '</div>';
      }).join('');
    }

    function toggleResult(toolId) {
      openToolId = openToolId === toolId ? null : toolId;
      renderFlow();
    }
  </script>
</body>
</html>`;
}
