/* 主页设备组件。当前 wearables.js 仅提供演示数据，界面始终明示这一点。 */
(function (global) {
  'use strict';
  var W = global.XinxuWearables;
  var list = global.document.getElementById('devicePlatforms');
  var summary = global.document.getElementById('deviceSummary');
  var layer = global.document.getElementById('deviceLayer');
  var opener = global.document.getElementById('openDevices');
  var closer = global.document.getElementById('closeDevices');
  if (!W || !list || !summary || !layer || !opener || !closer) return;

  function open() {
    render();
    layer.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    closer.focus();
  }
  function close() {
    layer.hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    opener.focus();
  }
  opener.setAttribute('aria-haspopup', 'dialog');
  opener.setAttribute('aria-controls', 'deviceLayer');
  opener.setAttribute('aria-expanded', 'false');
  opener.onclick = open;
  closer.onclick = close;
  layer.onclick = function (event) { if (event.target === layer) close(); };
  global.document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !layer.hidden) close();
  });

  function make(tag, cls, text) {
    var node = global.document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    list.textContent = '';
    W.PLATFORMS.forEach(function (platform) {
      var on = W.isConnected(platform.key);
      var row = make('div', 'device-platform');
      var info = make('div', 'info');
      info.appendChild(make('b', null, platform.name));
      info.appendChild(make('small', null, on ? '已载入演示数据，尚未连接真实设备' : '真实设备接口尚未接入'));
      row.appendChild(info);

      var action = make('button', null, on ? '更新示例' : '查看示例');
      action.type = 'button';
      action.onclick = function () {
        action.disabled = true;
        (on ? W.sync(platform.key) : W.connect(platform.key)).then(function () { render(); });
      };
      row.appendChild(action);
      if (on) {
        var remove = make('button', null, '清除示例');
        remove.type = 'button';
        remove.onclick = function () { W.disconnect(platform.key); render(); };
        row.appendChild(remove);
      }
      list.appendChild(row);
    });

    summary.textContent = '';
    var rows = W.days(7);
    if (!rows.length) {
      summary.appendChild(make('p', 'device-note', '还没有设备数据。点右上角的设备图标，可以选择设备并查看演示数据。'));
      return;
    }
    var latest = rows[rows.length - 1];
    summary.appendChild(make('p', 'device-note', '以下是 ' + latest.date + ' 的演示数字，不是手表实测值。'));
    var grid = make('div', 'device-metrics');
    ['sleepMin', 'sleepScore', 'stressAvg', 'rhr', 'hrv', 'steps'].forEach(function (key) {
      if (latest[key] == null) return;
      var metric = W.metricByKey(key);
      var cell = make('div', 'device-metric');
      cell.appendChild(make('span', null, metric.name));
      cell.appendChild(make('b', null, W.fmt(key, latest[key])));
      cell.appendChild(make('span', null, metric.hint));
      grid.appendChild(cell);
    });
    summary.appendChild(grid);
  }

  render();
  global.XinxuDevicePanel = { render: render, open: open, close: close };
})(window);

