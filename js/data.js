/* ═══════════════════════════════════════════════════════
   data.js — Carga, parseo y procesamiento de datos
═══════════════════════════════════════════════════════ */

'use strict';

/* ─── CONFIGURACIÓN GLOBAL ─────────────────────────────────────
   Modifica estos arrays con los nombres de los participantes
   peruanos para que aparezca la bandera 🇵🇪 automáticamente.
───────────────────────────────────────────────────────── */
const participantesPeru = [" Percy Gomez"," Victor Raul Cercado Lopez"," Karina Otárola"
  // Ejemplo: "Juan Pérez", "María García"
  // Agrega aquí los nombres exactamente como aparecen en el Excel
];

/* ─── CONFIGURACIÓN GOOGLE DRIVE ────────────────────────────
   Pega aquí el ID del archivo Excel en Google Drive.
   Para obtenerlo: abre el archivo en Drive → "Compartir" →
   "Cualquier persona con el enlace puede ver" → copia el ID
   de la URL: drive.google.com/file/d/[ESTE_ES_EL_ID]/view

   El archivo debe estar compartido como "Cualquiera con el enlace".
───────────────────────────────────────────────────────── */
const DRIVE_FILE_ID = 'https://docs.google.com/spreadsheets/d/1hr_Z6yBWGFdqNp-SWY7JirR2UG16ots5/edit?usp=sharing&ouid=110467925148696366295&rtpof=true&sd=true'; // ← Pega aquí el File ID de Google Drive

/* ─── CONFIGURACIÓN DE COLUMNAS ──────────────────────────────
   Mapeado de columnas del Excel. Ajusta si los encabezados
   del archivo tienen nombres ligeramente distintos.
───────────────────────────────────────────────────────── */
const COLUMN_MAP = {
  fecha:    ['fecha de actualización', 'fecha actualización', 'fecha actualizacion', 'fecha actualzacion', 'fecha', 'date'],
  ranking:  ['ranking', 'rank', 'posicion', 'posición', 'pos'],
  nombre:   ['nombre', 'name', 'participante', 'jugador'],
  puntaje:  ['puntaje', 'puntos', 'pts', 'score', 'points'],
  exacto:   ['flag m.exacto', 'flag m exacto', 'exacto', 'marcador exacto', 'mexacto'],
};

const DataStore = (() => {

  let _raw        = [];
  let _cuts       = [];
  let _cutDates   = [];
  let _participants = [];
  let _bycut      = {};
  let _byname     = {};
  let _metrics    = null;
  let _currentCutIdx = -1;

  function loadFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          _updateProgress(20, 'Leyendo archivo…');
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          _updateProgress(40, 'Parseando hoja…');
          const sheetName = wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
          _updateProgress(60, `Procesando ${rawRows.length} filas…`);
          _parseRows(rawRows);
          _updateProgress(80, 'Calculando métricas…');
          _buildIndexes();
          _computeMetrics();
          _updateProgress(100, 'Listo');
          resolve({ cuts: _cuts, participants: _participants, rowCount: _raw.length });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function _detectHeaders(rawRow) {
    const keys = Object.keys(rawRow).map(k => k.trim());
    const map = {};
    for (const [field, candidates] of Object.entries(COLUMN_MAP)) {
      for (const key of keys) {
        if (candidates.includes(key.toLowerCase())) {
          map[field] = key;
          break;
        }
      }
    }
    return map;
  }

  function _parseRows(rawRows) {
    if (!rawRows.length) return;
    const headers = _detectHeaders(rawRows[0]);
    _raw = rawRows.map(row => {
      const fechaRaw = headers.fecha ? row[headers.fecha] : null;
      let fecha = null;
      if (fechaRaw instanceof Date) {
        fecha = isNaN(fechaRaw) ? null : fechaRaw;
      } else if (typeof fechaRaw === 'number' && fechaRaw > 1000) {
        fecha = Utils.parseExcelDate(fechaRaw);
      } else if (fechaRaw) {
        fecha = Utils.parseExcelDate(fechaRaw) || new Date(fechaRaw);
      }
      const nombre = String(headers.nombre ? (row[headers.nombre] || '') : '').trim();
      const ranking = parseInt(headers.ranking ? row[headers.ranking] : 0, 10) || 0;
      const puntaje = parseFloat(String(headers.puntaje ? row[headers.puntaje] : 0).replace(',', '.')) || 0;
      const exacto  = parseInt(headers.exacto  ? row[headers.exacto]  : 0, 10) || 0;
      const cutKey = fecha ? _toCutKey(fecha) : 'sin-fecha';
      return { fecha, cutKey, ranking, nombre, puntaje, exacto, isPeru: _isPeru(nombre) };
    }).filter(r => r.nombre && r.ranking > 0);
  }

  function _toCutKey(d) {
    if (!d || isNaN(d)) return 'sin-fecha';
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const h = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${y}-${m}-${dd}T${h}:${mi}`;
  }

  function _isPeru(nombre) {
    if (!nombre) return false;
    return participantesPeru.some(p => p.trim().toLowerCase() === nombre.toLowerCase());
  }

  function _buildIndexes() {
    _bycut = {}; _byname = {};
    const cutSet = new Set();
    _raw.forEach(row => {
      cutSet.add(row.cutKey);
      if (!_bycut[row.cutKey]) _bycut[row.cutKey] = [];
      _bycut[row.cutKey].push(row);
      if (!_byname[row.nombre]) _byname[row.nombre] = [];
      _byname[row.nombre].push(row);
    });
    _cuts = Array.from(cutSet).filter(k => k !== 'sin-fecha').sort();
    _cutDates = _cuts.map(k => new Date(k));
    _participants = Object.keys(_byname).sort();
    _currentCutIdx = _cuts.length - 1;
    _cuts.forEach(cut => { _bycut[cut].sort((a, b) => a.ranking - b.ranking); });
    _participants.forEach(name => {
      _byname[name].sort((a, b) => _cuts.indexOf(a.cutKey) - _cuts.indexOf(b.cutKey));
    });
  }

  function _computeMetrics() { _metrics = null; _metrics = _buildMetrics(); }

  function _buildMetrics() {
    if (!_cuts.length) return null;
    const lastCut = _cuts[_cuts.length - 1];
    const lastData = _bycut[lastCut] || [];
    const prevCut = _cuts.length > 1 ? _cuts[_cuts.length - 2] : null;
    const top3 = lastData.slice(0, 3);
    const variations = _computeVariations(lastCut, prevCut);
    const rises  = variations.filter(v => v.delta > 0).sort((a,b) => b.delta - a.delta);
    const falls  = variations.filter(v => v.delta < 0).sort((a,b) => a.delta - b.delta);
    const consistency = _participants.map(name => {
      const ranks = _byname[name].map(r => r.ranking);
      return { nombre: name, sd: Utils.stddev(ranks), isPeru: _isPeru(name) };
    }).filter(x => x.sd > 0).sort((a,b) => a.sd - b.sd);
    const scores = lastData.map(r => r.puntaje);
    const stats = {
      mean: Utils.mean(scores), median: Utils.median(scores),
      stddev: Utils.stddev(scores), min: Math.min(...scores), max: Math.max(...scores),
      p25: Utils.percentile(scores, 25), p75: Utils.percentile(scores, 75),
    };
    const exactByName = {};
    _participants.forEach(name => {
      const rows = _byname[name];
      exactByName[name] = rows.length ? Math.max(...rows.map(r => r.exacto)) : 0;
    });
    const exactSorted = Object.entries(exactByName)
      .map(([nombre, exacto]) => ({ nombre, exacto, isPeru: _isPeru(nombre) }))
      .filter(x => x.exacto > 0).sort((a,b) => b.exacto - a.exacto);
    const totalExact = exactSorted.reduce((s, x) => s + x.exacto, 0);
    const timesLeader = {}, timesTop10 = {}, timesTop50 = {}, timesTop100 = {};
    _cuts.forEach(cut => {
      (_bycut[cut] || []).forEach(row => {
        const n = row.nombre;
        if (row.ranking === 1)  timesLeader[n]  = (timesLeader[n]  || 0) + 1;
        if (row.ranking <= 10)  timesTop10[n]   = (timesTop10[n]   || 0) + 1;
        if (row.ranking <= 50)  timesTop50[n]   = (timesTop50[n]   || 0) + 1;
        if (row.ranking <= 100) timesTop100[n]  = (timesTop100[n]  || 0) + 1;
      });
    });
    const sortDict = d => Object.entries(d)
      .map(([nombre, count]) => ({ nombre, count, isPeru: _isPeru(nombre) }))
      .sort((a,b) => b.count - a.count);
    const growth = _participants.map(name => {
      const h = _byname[name];
      if (h.length < 2) return null;
      return { nombre: name, growth: h[0].ranking - h[h.length-1].ranking, isPeru: _isPeru(name) };
    }).filter(Boolean).sort((a,b) => b.growth - a.growth);
    return {
      lastCut, prevCut, top3, variations, rises, falls,
      consistency, stats, exactByName, exactSorted, totalExact,
      timesLeader: sortDict(timesLeader), timesTop10: sortDict(timesTop10),
      timesTop50: sortDict(timesTop50), timesTop100: sortDict(timesTop100), growth,
    };
  }

  function _computeVariations(cutKey, prevCutKey) {
    const curr = _bycut[cutKey] || [];
    const prev = {};
    if (prevCutKey) { (_bycut[prevCutKey] || []).forEach(r => { prev[r.nombre] = r.ranking; }); }
    return curr.map(r => {
      const prevRank = prev[r.nombre];
      const delta = prevRank != null ? prevRank - r.ranking : null;
      return { ...r, prevRank, delta };
    });
  }

  function getCutData(cutIdx = null) {
    const idx = cutIdx !== null ? cutIdx : _currentCutIdx;
    if (idx < 0 || idx >= _cuts.length) return [];
    const cut = _cuts[idx];
    const prevCut = idx > 0 ? _cuts[idx - 1] : null;
    return _computeVariations(cut, prevCut);
  }

  function getHistory(nombre) { return _byname[nombre] || []; }

  function getMultiHistory(nombres) {
    return nombres.reduce((acc, n) => { acc[n] = getHistory(n); return acc; }, {});
  }

  function getParticipantStats(nombre) {
    const h = getHistory(nombre);
    if (!h.length) return null;
    const ranks = h.map(r => r.ranking);
    const scores = h.map(r => r.puntaje);
    const { min: bestRank } = Utils.minMax(ranks);
    const { max: worstRank } = Utils.minMax(ranks);
    const m = _metrics || {};
    const exact = m.exactByName ? (m.exactByName[nombre] || 0) : 0;
    const rises = h.reduce((s, r, i) => i === 0 ? s : s + (h[i-1].ranking > r.ranking ? 1 : 0), 0);
    const falls = h.reduce((s, r, i) => i === 0 ? s : s + (h[i-1].ranking < r.ranking ? 1 : 0), 0);
    const timesLeader = h.filter(r => r.ranking === 1).length;
    const timesTop10  = h.filter(r => r.ranking <= 10).length;
    const totalDelta  = h.length > 1 ? h[0].ranking - h[h.length-1].ranking : 0;
    return {
      nombre, h, ranks, scores, bestRank, worstRank, exact,
      rises, falls, timesLeader, timesTop10,
      sdRank: Utils.stddev(ranks), totalDelta,
      currentRank: h[h.length-1].ranking, currentScore: h[h.length-1].puntaje,
      maxScore: Math.max(...scores),
    };
  }

  function searchParticipants(query, limit = 15) {
    if (!query) return _participants.slice(0, limit);
    const q = query.toLowerCase();
    return _participants.filter(n => n.toLowerCase().includes(q)).slice(0, limit);
  }

  function getTopN(n, cutIdx = null) { return getCutData(cutIdx).slice(0, n); }

  function getVariations(cutIdx = null) {
    const idx = cutIdx !== null ? cutIdx : _currentCutIdx;
    if (idx <= 0 || idx >= _cuts.length) return [];
    return _computeVariations(_cuts[idx], _cuts[idx-1]);
  }

  function getHeatmapData(topN = 20, peruOnly = false) {
    let names = getTopN(topN).map(r => r.nombre);
    if (peruOnly) names = names.filter(_isPeru);
    const matrix = names.map(name => {
      return _cuts.map(cut => {
        const row = (_bycut[cut] || []).find(r => r.nombre === name);
        return row ? row.ranking : null;
      });
    });
    return { names, cuts: _cuts, matrix };
  }

  function getScatterData(cutIdx = null) {
    return getCutData(cutIdx).map(r => ({ x: r.puntaje, y: r.ranking, nombre: r.nombre, isPeru: r.isPeru, exacto: r.exacto }));
  }

  function _updateProgress(pct, msg) {
    const bar    = document.getElementById('loadingBar') || document.getElementById('uploadBar');
    const status = document.getElementById('loadingMessage') || document.getElementById('uploadStatus');
    if (bar) bar.style.width = pct + '%';
    if (status) status.textContent = msg;
  }

  function getDriveFileId() { return DRIVE_FILE_ID; }

  function loadFromUrl(url) {
    return new Promise((resolve, reject) => {
      _updateProgress(10, 'Conectando con Google Drive…');
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          _updateProgress(40, 'Descargando archivo…');
          return res.arrayBuffer();
        })
        .then(buffer => {
          _updateProgress(60, 'Parseando hoja…');
          const data = new Uint8Array(buffer);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
          _updateProgress(75, `Procesando ${rawRows.length} filas…`);
          _parseRows(rawRows);
          _updateProgress(88, 'Calculando métricas…');
          _buildIndexes();
          _computeMetrics();
          _updateProgress(100, 'Listo');
          resolve({ cuts: _cuts, participants: _participants, rowCount: _raw.length });
        })
        .catch(reject);
    });
  }

  return {
    loadFile, loadFromUrl, getDriveFileId,
    getCutData, getHistory, getMultiHistory,
    getParticipantStats, searchParticipants, getTopN,
    getVariations, getHeatmapData, getScatterData,
    getMetrics() { return _metrics; },
    getCuts() { return _cuts; },
    getCutDates() { return _cutDates; },
    getParticipants() { return _participants; },
    getCurrentCutIdx() { return _currentCutIdx; },
    setCurrentCutIdx(idx) { _currentCutIdx = Math.max(0, Math.min(idx, _cuts.length - 1)); },
    getBycut() { return _bycut; },
    getByname() { return _byname; },
    isPeru: _isPeru,
    getCutLabel(cutKey) {
      if (!cutKey) return '—';
      const d = new Date(cutKey);
      return isNaN(d) ? cutKey : Utils.formatDate(d, 'datetime');
    },
    getCutLabelByIdx(idx) {
      const cut = _cuts[idx];
      return cut ? this.getCutLabel(cut) : '—';
    },
    isLoaded() { return _cuts.length > 0; },
    reset() {
      _raw = []; _cuts = []; _cutDates = []; _participants = [];
      _bycut = {}; _byname = {}; _metrics = null; _currentCutIdx = -1;
    },
  };

})();
