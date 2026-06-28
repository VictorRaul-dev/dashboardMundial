/* ═══════════════════════════════════════════════════════
   charts.js — Gestión de todas las visualizaciones
═══════════════════════════════════════════════════════ */

'use strict';

const ChartManager = (() => {

  const _instances = {};
  const FONT = "'Inter', system-ui, sans-serif";

  function _isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
  function _textColor()  { return _isDark() ? '#8DA0B8' : '#4A5B74'; }
  function _gridColor()  { return _isDark() ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'; }
  function _labelColor() { return _isDark() ? '#E8EDF5' : '#0B1F3A'; }

  function _destroy(key) {
    if (_instances[key]) { _instances[key].destroy(); delete _instances[key]; }
  }

  function _baseOpts(extra = {}) {
    return {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600, easing: 'easeInOutQuart' },
      plugins: {
        legend: { labels: { font: { family: FONT, size: 12 }, color: _textColor(), boxWidth: 12, padding: 16 } },
        tooltip: {
          backgroundColor: _isDark() ? '#0F192A' : '#FFFFFF',
          titleColor: _labelColor(), bodyColor: _textColor(),
          borderColor: _isDark() ? '#1E2D42' : '#DDE3EC', borderWidth: 1,
          padding: 12,
          titleFont: { family: FONT, size: 13, weight: '600' },
          bodyFont: { family: FONT, size: 12 }, cornerRadius: 8,
        }
      },
      scales: {
        x: { ticks: { font: { family: FONT, size: 11 }, color: _textColor() }, grid: { color: _gridColor() } },
        y: { ticks: { font: { family: FONT, size: 11 }, color: _textColor() }, grid: { color: _gridColor() } },
      },
      ...extra
    };
  }

  function renderSparkline(canvasId, data, color = '#2979D9', type = 'line', inverted = false) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || !data.length) return;
    _destroy(canvasId);
    _instances[canvasId] = new Chart(canvas, {
      type,
      data: {
        labels: data.map((_, i) => i),
        datasets: [{ data, borderColor: color, backgroundColor: type === 'line' ? Utils.hexToRgba(color, .15) : Utils.hexToRgba(color, .6), borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false, reverse: inverted } },
      }
    });
  }

  function renderQuickChart(view = 'ranking') {
    const canvas = document.getElementById('quickChart');
    if (!canvas || !DataStore.isLoaded()) return;
    _destroy('quickChart');
    const top10Names = DataStore.getTopN(10).map(r => r.nombre);
    const cuts = DataStore.getCuts();
    const labels = cuts.map(c => DataStore.getCutLabel(c));
    const datasets = top10Names.slice(0, 8).map((name, i) => {
      const history = DataStore.getHistory(name);
      const data = cuts.map(c => { const row = history.find(r => r.cutKey === c); return row ? (view === 'ranking' ? row.ranking : row.puntaje) : null; });
      return { label: ((DataStore.getFlag(name) ? DataStore.getFlag(name) + ' ' : '')) + Utils.truncate(name, 18), data, borderColor: Utils.paletteColor(i), backgroundColor: Utils.paletteColor(i, .08), borderWidth: 2, pointRadius: data.length > 20 ? 0 : 3, pointHoverRadius: 5, tension: 0.3, fill: false, spanGaps: true };
    });
    const opts = _baseOpts();
    if (view === 'ranking') { opts.scales.y.reverse = true; opts.scales.y.title = { display: true, text: 'Posición', font: { family: FONT, size: 11 }, color: _textColor() }; }
    else { opts.scales.y.title = { display: true, text: 'Puntaje', font: { family: FONT, size: 11 }, color: _textColor() }; }
    opts.scales.x.ticks = { ...opts.scales.x.ticks, maxRotation: 30, maxTicksLimit: 10 };
    opts.plugins.tooltip.callbacks = { title: ctx => ctx[0]?.label || '', label: ctx => { const lbl = ctx.dataset.label || ''; const val = ctx.parsed.y; return view === 'ranking' ? ` ${lbl}: #${val}` : ` ${lbl}: ${Utils.formatNumber(val)} pts`; } };
    opts.plugins.zoom = { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } };
    _instances['quickChart'] = new Chart(canvas, { type: 'line', data: { labels, datasets }, options: opts });
  }

  function renderQuickDonut() {
    const canvas = document.getElementById('quickDonut');
    if (!canvas || !DataStore.isLoaded()) return;
    _destroy('quickDonut');
    const top5 = DataStore.getTopN(5);
    const labels = top5.map(r => ((DataStore.getFlag(r.nombre) ? DataStore.getFlag(r.nombre) + ' ' : '')) + Utils.truncate(r.nombre, 16));
    const data = top5.map(r => r.puntaje);
    const colors = top5.map((_, i) => Utils.paletteColor(i));
    _instances['quickDonut'] = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: _isDark() ? '#131F30' : '#fff', borderWidth: 3, hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', animation: { duration: 800 }, plugins: { legend: { position: 'bottom', labels: { font: { family: FONT, size: 11 }, color: _textColor(), boxWidth: 10, padding: 10 } }, tooltip: { backgroundColor: _isDark() ? '#0F192A' : '#FFFFFF', titleColor: _labelColor(), bodyColor: _textColor(), borderColor: _isDark() ? '#1E2D42' : '#DDE3EC', borderWidth: 1, callbacks: { label: ctx => ` ${ctx.label}: ${Utils.formatNumber(ctx.parsed)} pts` } } } }
    });
  }

  function renderVariationChart(canvasId, cutIdx = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !DataStore.isLoaded()) return;
    _destroy(canvasId);
    const idx = cutIdx !== null ? cutIdx : DataStore.getCurrentCutIdx();
    const variations = DataStore.getVariations(idx);
    if (!variations.length) return;
    const rises = variations.filter(v => v.delta > 0).sort((a,b) => b.delta - a.delta).slice(0, 10);
    const falls = variations.filter(v => v.delta < 0).sort((a,b) => a.delta - b.delta).slice(0, 10);
    const combined = [...rises, ...falls].sort((a,b) => (b.delta || 0) - (a.delta || 0));
    const labels = combined.map(r => ((DataStore.getFlag(r.nombre) ? DataStore.getFlag(r.nombre) + ' ' : '')) + Utils.truncate(r.nombre, 18));
    const data   = combined.map(r => r.delta || 0);
    const colors = data.map(v => v > 0 ? Utils.hexToRgba('#16A34A', .8) : Utils.hexToRgba('#DC2626', .8));
    const borderColors = data.map(v => v > 0 ? '#16A34A' : '#DC2626');
    const opts = _baseOpts();
    opts.indexAxis = 'y';
    opts.scales.x.title = { display: true, text: 'Posiciones ganadas / perdidas', font: { family: FONT, size: 11 }, color: _textColor() };
    opts.plugins.legend = { display: false };
    opts.plugins.tooltip.callbacks = { label: ctx => { const v = ctx.parsed.x; return v > 0 ? ` ▲ Subió ${v} posiciones` : ` ▼ Bajó ${Math.abs(v)} posiciones`; } };
    _instances[canvasId] = new Chart(canvas, { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: borderColors, borderWidth: 1, borderRadius: 4 }] }, options: opts });
  }

  function renderRankingEvoChart(selectedNames) {
    const canvas = document.getElementById('rankingEvoChart');
    if (!canvas || !DataStore.isLoaded() || !selectedNames.length) { _destroy('rankingEvoChart'); return; }
    _destroy('rankingEvoChart');
    const cuts = DataStore.getCuts();
    const labels = cuts.map(c => DataStore.getCutLabel(c));
    const datasets = selectedNames.map((name, i) => {
      const history = DataStore.getHistory(name);
      const data = cuts.map(c => { const row = history.find(r => r.cutKey === c); return row ? row.ranking : null; });
      return { label: ((DataStore.getFlag(name) ? DataStore.getFlag(name) + ' ' : '')) + name, data, spanGaps: true, borderColor: Utils.paletteColor(i), backgroundColor: Utils.paletteColor(i, .1), borderWidth: 2.5, pointRadius: data.length > 30 ? 0 : 4, pointHoverRadius: 6, tension: 0.3, fill: false };
    });
    const opts = _baseOpts();
    opts.scales.y.reverse = true; opts.scales.y.min = 1;
    opts.scales.y.title = { display: true, text: 'Posición (eje invertido)', font: { family: FONT, size: 11 }, color: _textColor() };
    opts.scales.x.ticks = { ...opts.scales.x.ticks, maxRotation: 35, maxTicksLimit: 12 };
    opts.plugins.tooltip.callbacks = { label: ctx => ` ${ctx.dataset.label}: #${ctx.parsed.y}` };
    opts.plugins.zoom = { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } };
    _instances['rankingEvoChart'] = new Chart(canvas, { type: 'line', data: { labels, datasets }, options: opts });
  }

  function renderScoreEvoChart(selectedNames) {
    const canvas = document.getElementById('scoreEvoChart');
    if (!canvas || !DataStore.isLoaded() || !selectedNames.length) { _destroy('scoreEvoChart'); return; }
    _destroy('scoreEvoChart');
    const cuts = DataStore.getCuts();
    const labels = cuts.map(c => DataStore.getCutLabel(c));
    const datasets = selectedNames.map((name, i) => {
      const history = DataStore.getHistory(name);
      const data = cuts.map(c => { const row = history.find(r => r.cutKey === c); return row ? row.puntaje : null; });
      return { label: ((DataStore.getFlag(name) ? DataStore.getFlag(name) + ' ' : '')) + name, data, spanGaps: true, borderColor: Utils.paletteColor(i), backgroundColor: Utils.paletteColor(i, .1), borderWidth: 2.5, pointRadius: data.length > 30 ? 0 : 4, pointHoverRadius: 6, tension: 0.3, fill: false };
    });
    const opts = _baseOpts();
    opts.scales.y.title = { display: true, text: 'Puntaje', font: { family: FONT, size: 11 }, color: _textColor() };
    opts.scales.x.ticks = { ...opts.scales.x.ticks, maxRotation: 35, maxTicksLimit: 12 };
    opts.plugins.tooltip.callbacks = { label: ctx => ` ${ctx.dataset.label}: ${Utils.formatNumber(ctx.parsed.y)} pts` };
    opts.plugins.zoom = { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } };
    _instances['scoreEvoChart'] = new Chart(canvas, { type: 'line', data: { labels, datasets }, options: opts });
  }

  function renderCompRankChart(name1, name2) {
    const canvas = document.getElementById('compRankChart');
    if (!canvas) return;
    _destroy('compRankChart');
    const cuts = DataStore.getCuts();
    const labels = cuts.map(c => DataStore.getCutLabel(c));
    const mkDataset = (name, color) => {
      const h = DataStore.getHistory(name);
      return { label: ((DataStore.getFlag(name) ? DataStore.getFlag(name) + ' ' : '')) + name, data: cuts.map(c => { const r = h.find(x => x.cutKey === c); return r ? r.ranking : null; }), borderColor: color, backgroundColor: Utils.hexToRgba(color, .1), borderWidth: 2.5, tension: 0.3, fill: false, spanGaps: true, pointRadius: 4, pointHoverRadius: 6 };
    };
    const opts = _baseOpts();
    opts.scales.y.reverse = true; opts.scales.y.min = 1;
    opts.scales.x.ticks = { ...opts.scales.x.ticks, maxRotation: 35, maxTicksLimit: 10 };
    opts.plugins.tooltip.callbacks = { label: ctx => ` ${ctx.dataset.label}: #${ctx.parsed.y}` };
    _instances['compRankChart'] = new Chart(canvas, { type: 'line', data: { labels, datasets: [mkDataset(name1, '#2979D9'), mkDataset(name2, '#DC2626')] }, options: opts });
  }

  function renderCompRadarChart(s1, s2) {
    const canvas = document.getElementById('compRadarChart');
    if (!canvas || !s1 || !s2) return;
    _destroy('compRadarChart');
    const cuts = DataStore.getCuts().length;
    const dims = [
      { label: 'Mejor ranking',  v1: 101 - s1.bestRank,       v2: 101 - s2.bestRank },
      { label: 'Constancia',     v1: 100 - s1.sdRank,         v2: 100 - s2.sdRank },
      { label: 'Crecimiento',    v1: 50 + s1.totalDelta,      v2: 50 + s2.totalDelta },
      { label: 'Exactos',        v1: s1.exact * 20,           v2: s2.exact * 20 },
      { label: 'Veces Top 10',   v1: (s1.timesTop10/cuts)*100, v2: (s2.timesTop10/cuts)*100 },
    ];
    const d1 = dims.map(d => Math.min(100, Math.max(0, d.v1)));
    const d2 = dims.map(d => Math.min(100, Math.max(0, d.v2)));
    _instances['compRadarChart'] = new Chart(canvas, {
      type: 'radar',
      data: { labels: dims.map(d => d.label), datasets: [
        { label: Utils.truncate(s1.nombre, 16), data: d1, borderColor: '#2979D9', backgroundColor: 'rgba(41,121,217,.15)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#2979D9' },
        { label: Utils.truncate(s2.nombre, 16), data: d2, borderColor: '#DC2626', backgroundColor: 'rgba(220,38,38,.12)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#DC2626' },
      ]},
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 700 }, plugins: { legend: { labels: { font: { family: FONT, size: 12 }, color: _textColor() } }, tooltip: { backgroundColor: _isDark() ? '#0F192A' : '#fff', titleColor: _labelColor(), bodyColor: _textColor(), borderColor: _isDark() ? '#1E2D42' : '#DDE3EC', borderWidth: 1 } }, scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: _gridColor() }, pointLabels: { font: { family: FONT, size: 11 }, color: _textColor() } } } }
    });
  }

  function renderScatterChart(cutIdx = null) {
    const canvas = document.getElementById('scatterChart');
    if (!canvas || !DataStore.isLoaded()) return;
    _destroy('scatterChart');
    const points = DataStore.getScatterData(cutIdx);
    const flagPts = points.filter(p => p.flag);
    const regularPts = points.filter(p => !p.flag);
    const mkDataset = (data, label, color, radius = 5) => ({ label, data: data.map(p => ({ x: p.x, y: p.y, nombre: p.nombre, exacto: p.exacto })), backgroundColor: Utils.hexToRgba(color, .6), borderColor: color, borderWidth: 1, pointRadius: radius, pointHoverRadius: radius + 3 });
    const opts = _baseOpts();
    opts.scales.y.reverse = true;
    opts.scales.y.title = { display: true, text: 'Ranking', font: { family: FONT, size: 11 }, color: _textColor() };
    opts.scales.x.title = { display: true, text: 'Puntaje', font: { family: FONT, size: 11 }, color: _textColor() };
    opts.plugins.tooltip.callbacks = { label: ctx => { const d = ctx.raw; return [` ${d.nombre}`, ` Ranking: #${d.y}`, ` Puntaje: ${Utils.formatNumber(d.x)}`, ` Exactos: ${d.exacto}`]; } };
    const datasets = [mkDataset(regularPts, 'Participantes', '#2979D9', 5)];
    if (peruPts.length) datasets.push(mkDataset(peruPts, '🇵🇪 Perú', '#E74C3C', 7));
    _instances['scatterChart'] = new Chart(canvas, { type: 'scatter', data: { datasets }, options: opts });
  }

  function renderDistChart(cutIdx = null) {
    const canvas = document.getElementById('distChart');
    if (!canvas || !DataStore.isLoaded()) return;
    _destroy('distChart');
    const data = DataStore.getCutData(cutIdx);
    const scores = data.map(r => r.puntaje);
    const { labels, counts } = Utils.histogram(scores, 12);
    const opts = _baseOpts();
    opts.scales.x.title = { display: true, text: 'Puntaje', font: { family: FONT, size: 11 }, color: _textColor() };
    opts.scales.y.title = { display: true, text: 'Participantes', font: { family: FONT, size: 11 }, color: _textColor() };
    opts.plugins.legend = { display: false };
    opts.plugins.tooltip.callbacks = { label: ctx => ` ${ctx.parsed.y} participantes` };
    _instances['distChart'] = new Chart(canvas, { type: 'bar', data: { labels, datasets: [{ data: counts, backgroundColor: Utils.paletteColor(0, .7), borderColor: Utils.paletteColor(0), borderWidth: 1, borderRadius: 4 }] }, options: opts });
  }

  function renderExactBarChart() {
    const canvas = document.getElementById('exactBarChart');
    if (!canvas || !DataStore.isLoaded()) return;
    _destroy('exactBarChart');
    const m = DataStore.getMetrics();
    if (!m) return;
    const top20 = m.exactSorted.slice(0, 20);
    const labels = top20.map(x => ((x.flag ? x.flag + ' ' : '')) + Utils.truncate(x.nombre, 18));
    const data   = top20.map(x => x.exacto);
    const colors = top20.map(x => x.isPeru ? Utils.hexToRgba('#E74C3C', .8) : Utils.hexToRgba('#D4AF37', .8));
    const opts = _baseOpts();
    opts.indexAxis = 'y'; opts.plugins.legend = { display: false };
    opts.scales.x.title = { display: true, text: 'Marcadores exactos', font: { family: FONT, size: 11 }, color: _textColor() };
    _instances['exactBarChart'] = new Chart(canvas, { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: top20.map(x => x.isPeru ? '#E74C3C' : '#D4AF37'), borderWidth: 1, borderRadius: 4 }] }, options: opts });
  }

  function renderExactPieChart() {
    const canvas = document.getElementById('exactPieChart');
    if (!canvas || !DataStore.isLoaded()) return;
    _destroy('exactPieChart');
    const m = DataStore.getMetrics();
    if (!m) return;
    const top8 = m.exactSorted.slice(0, 8);
    const others = m.exactSorted.slice(8).reduce((s, x) => s + x.exacto, 0);
    const labels = top8.map(x => Utils.truncate(x.nombre, 14));
    const data   = top8.map(x => x.exacto);
    if (others > 0) { labels.push('Otros'); data.push(others); }
    const colors = data.map((_, i) => Utils.paletteColor(i));
    _instances['exactPieChart'] = new Chart(canvas, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: _isDark() ? '#131F30' : '#fff', borderWidth: 2, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '55%', animation: { duration: 800 }, plugins: { legend: { position: 'right', labels: { font: { family: FONT, size: 11 }, color: _textColor(), boxWidth: 10, padding: 8 } }, tooltip: { backgroundColor: _isDark() ? '#0F192A' : '#fff', titleColor: _labelColor(), bodyColor: _textColor(), borderColor: _isDark() ? '#1E2D42' : '#DDE3EC', borderWidth: 1, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } } } } });
  }

  let _raceState = { timer: null, cutIdx: 0, playing: false, speed: 1200, chartInstance: null };

  function _getRaceColors(names) {
    return names.reduce((map, name, i) => { map[name] = Utils.paletteColor(i); return map; }, {});
  }

  function initRaceChart() {
    const canvas = document.getElementById('raceChart');
    if (!canvas || !DataStore.isLoaded()) return;
    _destroy('raceChart');
    _raceState.cutIdx = 0; _raceState.playing = false;
    const cuts = DataStore.getCuts();
    const firstData = (DataStore.getBycut()[cuts[0]] || []).slice(0, 20);
    const names = firstData.map(r => r.nombre);
    const colorMap = _getRaceColors(names);
    _raceState.colorMap = colorMap;
    const config = {
      type: 'bar',
      data: { labels: firstData.map(r => ((DataStore.getFlag(r.nombre) ? DataStore.getFlag(r.nombre) + ' ' : '')) + Utils.truncate(r.nombre, 22)), datasets: [{ data: firstData.map(r => r.puntaje), backgroundColor: firstData.map(r => Utils.hexToRgba(colorMap[r.nombre] || Utils.paletteColor(0), .8)), borderColor: firstData.map(r => colorMap[r.nombre] || Utils.paletteColor(0)), borderWidth: 2, borderRadius: 6 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: Math.min(_raceState.speed * .7, 800), easing: 'easeInOutQuart' }, plugins: { legend: { display: false }, tooltip: { backgroundColor: _isDark() ? '#0F192A' : '#fff', titleColor: _labelColor(), bodyColor: _textColor(), borderColor: _isDark() ? '#1E2D42' : '#DDE3EC', borderWidth: 1, callbacks: { label: ctx => ` Puntaje: ${Utils.formatNumber(ctx.parsed.x)}` } } }, scales: { x: { beginAtZero: true, ticks: { font: { family: FONT, size: 11 }, color: _textColor() }, grid: { color: _gridColor() } }, y: { ticks: { font: { family: FONT, size: 12, weight: '500' }, color: _labelColor() }, grid: { display: false } } } }
    };
    _raceState.chartInstance = new Chart(canvas, config);
    _instances['raceChart'] = _raceState.chartInstance;
    _updateRaceFrame(0);
  }

  function _updateRaceFrame(idx) {
    if (!_raceState.chartInstance) return;
    const cuts = DataStore.getCuts();
    if (idx >= cuts.length) { stopRace(); return; }
    _raceState.cutIdx = idx;
    const cut = cuts[idx];
    const bycut = DataStore.getBycut();
    const top20 = (bycut[cut] || []).slice(0, 20).sort((a, b) => b.puntaje - a.puntaje);
    const chart = _raceState.chartInstance;
    const cm = _raceState.colorMap || {};
    chart.data.labels = top20.map(r => ((DataStore.getFlag(r.nombre) ? DataStore.getFlag(r.nombre) + ' ' : '')) + Utils.truncate(r.nombre, 22));
    chart.data.datasets[0].data = top20.map(r => r.puntaje);
    chart.data.datasets[0].backgroundColor = top20.map(r => Utils.hexToRgba(cm[r.nombre] || Utils.paletteColor(0), .8));
    chart.data.datasets[0].borderColor = top20.map(r => cm[r.nombre] || Utils.paletteColor(0));
    chart.update('active');
    const total = cuts.length;
    const bar = document.getElementById('raceMiniBar');
    if (bar) bar.style.width = (((idx + 1) / total) * 100) + '%';
    const badge = document.getElementById('raceCutBadge');
    if (badge) badge.textContent = 'Corte: ' + DataStore.getCutLabel(cut);
    const prog = document.getElementById('raceProgText');
    if (prog) prog.textContent = `${idx + 1} / ${total}`;
  }

  function playRace() {
    if (_raceState.playing) return;
    _raceState.playing = true;
    const cuts = DataStore.getCuts();
    if (_raceState.cutIdx >= cuts.length - 1) _raceState.cutIdx = 0;
    const step = () => {
      if (!_raceState.playing) return;
      _updateRaceFrame(_raceState.cutIdx);
      _raceState.cutIdx++;
      if (_raceState.cutIdx < cuts.length) { _raceState.timer = setTimeout(step, _raceState.speed); }
      else { _raceState.playing = false; _updateRaceButtons(); }
    };
    _raceState.timer = setTimeout(step, 100);
    _updateRaceButtons();
  }

  function pauseRace() { _raceState.playing = false; clearTimeout(_raceState.timer); _updateRaceButtons(); }
  function resetRace() { pauseRace(); _raceState.cutIdx = 0; _updateRaceFrame(0); _updateRaceButtons(); }
  function stopRace() { pauseRace(); }
  function setRaceSpeed(ms) {
    _raceState.speed = ms;
    if (_raceState.chartInstance) { _raceState.chartInstance.options.animation.duration = Math.min(ms * .7, 800); _raceState.chartInstance.update('none'); }
  }

  function _updateRaceButtons() {
    const play  = document.getElementById('racePlayBtn');
    const pause = document.getElementById('racePauseBtn');
    if (play)  { play.disabled  = _raceState.playing; play.classList.toggle('race-play', !_raceState.playing); }
    if (pause) { pause.disabled = !_raceState.playing; }
  }

  function renderHeatmap(topN = 20, peruOnly = false) {
    const container = document.getElementById('heatmapContainer');
    const canvas = document.getElementById('heatmapCanvas');
    if (!canvas || !DataStore.isLoaded()) return;
    const { names, cuts, matrix } = DataStore.getHeatmapData(topN, peruOnly);
    if (!names.length || !cuts.length) return;
    const cellW = 48, cellH = 28, labelW = 180, headerH = 60, pad = 8;
    const W = labelW + cuts.length * cellW + pad * 2;
    const H = headerH + names.length * cellH + pad;
    canvas.width = W; canvas.height = H;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    const dark = _isDark();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = dark ? '#131F30' : '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    const font = `12px ${FONT}`;
    ctx.fillStyle = dark ? '#8DA0B8' : '#4A5B74';
    ctx.font = '10px ' + FONT; ctx.textAlign = 'center';
    cuts.forEach((cut, j) => {
      const x = labelW + j * cellW + cellW / 2 + pad;
      const label = new Date(cut).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit' });
      ctx.save(); ctx.translate(x, headerH - 8); ctx.rotate(-Math.PI / 4);
      ctx.fillText(label, 0, 0); ctx.restore();
    });
    names.forEach((name, i) => {
      const y = headerH + i * cellH;
      ctx.fillStyle = dark ? (i % 2 === 0 ? '#131F30' : '#0F192A') : (i % 2 === 0 ? '#fff' : '#f8fafc');
      ctx.fillRect(0, y, W, cellH);
      ctx.fillStyle = dark ? '#E8EDF5' : '#0B1F3A';
      ctx.font = font; ctx.textAlign = 'left';
      ctx.fillText(((DataStore.getFlag(name) ? DataStore.getFlag(name) + ' ' : '')) + Utils.truncate(name, 22), pad, y + cellH / 2 + 4);
      matrix[i].forEach((rank, j) => {
        if (rank === null) return;
        const x = labelW + j * cellW + 2 + pad;
        const w = cellW - 4, h = cellH - 4;
        ctx.fillStyle = Utils.heatColor(rank, 1, topN, 0.85);
        _roundRect(ctx, x, y + 2, w, h, 4); ctx.fill();
        ctx.fillStyle = rank <= topN / 3 ? '#fff' : (rank <= topN * 2 / 3 ? '#1a1a1a' : '#fff');
        ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(String(rank), x + w / 2, y + cellH / 2 + 4);
      });
    });
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)';
    ctx.lineWidth = 1;
    names.forEach((_, i) => { const y = headerH + i * cellH; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); });
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function updateTheme() {
    Object.keys(_instances).forEach(key => {
      const chart = _instances[key];
      if (!chart) return;
      const opts = chart.options;
      if (opts.plugins?.legend?.labels) opts.plugins.legend.labels.color = _textColor();
      if (opts.plugins?.tooltip) { opts.plugins.tooltip.backgroundColor = _isDark() ? '#0F192A' : '#fff'; opts.plugins.tooltip.titleColor = _labelColor(); opts.plugins.tooltip.bodyColor = _textColor(); opts.plugins.tooltip.borderColor = _isDark() ? '#1E2D42' : '#DDE3EC'; }
      ['x','y','r'].forEach(axis => {
        if (opts.scales?.[axis]) {
          if (opts.scales[axis].ticks) opts.scales[axis].ticks.color = _textColor();
          if (opts.scales[axis].grid)  opts.scales[axis].grid.color  = _gridColor();
          if (opts.scales[axis].pointLabels) opts.scales[axis].pointLabels.color = _textColor();
        }
      });
      chart.update('none');
    });
    renderHeatmap(parseInt(document.getElementById('heatmapTopN')?.value || '20'), document.getElementById('heatmapPeruOnly')?.checked || false);
  }

  function renderRankingBarChart(cutIdx = null, topN = 20) {
    const canvas = document.getElementById('rankingBarChart');
    if (!canvas || !DataStore.isLoaded()) return;
    _destroy('rankingBarChart');
    const data = DataStore.getCutData(cutIdx).slice(0, topN);
    if (!data.length) return;
    const labels = data.map(r => (r.flag ? r.flag + ' ' : '') + Utils.truncate(r.nombre, 20));
    const scores = data.map(r => r.puntaje);
    const colors = data.map(r => r.flag ? Utils.hexToRgba('#D4AF37', .85) : Utils.hexToRgba('#2979D9', .75));
    const opts = _baseOpts();
    opts.indexAxis = 'y';
    opts.scales.x.title = { display: true, text: 'Puntaje', font: { family: FONT, size: 11 }, color: _textColor() };
    opts.plugins.legend = { display: false };
    opts.plugins.tooltip.callbacks = { label: ctx => ` ${Utils.formatNumber(ctx.parsed.x)} pts` };
    _instances['rankingBarChart'] = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ data: scores, backgroundColor: colors, borderColor: colors.map(c => c.replace(', .75)', ', 1)').replace(', .85)', ', 1)')), borderWidth: 1, borderRadius: 4 }] },
      options: opts,
    });
  }

  function renderCompScoreEvoChart(name1, name2) {
    const canvas = document.getElementById('compScoreEvoChart');
    if (!canvas || !DataStore.isLoaded() || !name1 || !name2) { _destroy('compScoreEvoChart'); return; }
    _destroy('compScoreEvoChart');
    const cuts = DataStore.getCuts();
    const labels = cuts.map(c => DataStore.getCutLabel(c));
    const mkDataset = (name, color) => {
      const history = DataStore.getHistory(name);
      const flag = DataStore.getFlag(name);
      const data = cuts.map(c => { const r = history.find(x => x.cutKey === c); return r ? r.puntaje : null; });
      return { label: (flag ? flag + ' ' : '') + Utils.truncate(name, 22), data, spanGaps: true, borderColor: color, backgroundColor: Utils.hexToRgba(color, .12), borderWidth: 2.5, pointRadius: cuts.length > 30 ? 0 : 4, pointHoverRadius: 6, tension: 0.3, fill: true };
    };
    const opts = _baseOpts();
    opts.scales.y.title = { display: true, text: 'Puntaje', font: { family: FONT, size: 11 }, color: _textColor() };
    opts.scales.x.ticks = { ...opts.scales.x.ticks, maxRotation: 35, maxTicksLimit: 12 };
    opts.plugins.tooltip.callbacks = { label: ctx => ` ${ctx.dataset.label}: ${Utils.formatNumber(ctx.parsed.y)} pts` };
    opts.plugins.zoom = { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } };
    _instances['compScoreEvoChart'] = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [mkDataset(name1, '#2979D9'), mkDataset(name2, '#E74C3C')] },
      options: opts,
    });
  }

  function destroyAll() { Object.keys(_instances).forEach(k => { if (_instances[k]) { _instances[k].destroy(); delete _instances[k]; } }); }

  return {
    renderSparkline, renderQuickChart, renderQuickDonut, renderVariationChart,
    renderRankingEvoChart, renderScoreEvoChart, renderCompRankChart, renderCompRadarChart,
    renderRankingBarChart, renderCompScoreEvoChart,
    renderScatterChart, renderDistChart, renderExactBarChart, renderExactPieChart,
    initRaceChart, playRace, pauseRace, resetRace, stopRace, setRaceSpeed,
    renderHeatmap, updateTheme, destroyAll,
    getInstance: key => _instances[key],
    getRaceState: () => _raceState,
  };

})();
