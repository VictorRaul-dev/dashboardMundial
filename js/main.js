/* ═══════════════════════════════════════════════════════
   main.js — Controlador principal de la aplicación
═══════════════════════════════════════════════════════ */

'use strict';

/* ─── APP STATE ──────────────────────────────────────── */
const AppState = {
  darkMode: false,
  sidebarCollapsed: false,
  activeSection: 'overview',
  currentCutIdx: -1,
  tableFilter: 'all',
  tableSearch: '',
  tableSortCol: 'ranking',
  tableSortAsc: true,
  tablePage: 1,
  tablePageSize: 25,
  evoSelectedNames: [],
  compPlayer1: null,
  compPlayer2: null,
  filterTop: 100,
  filterPeru: false,
  filterExacto: false,
  quickChartView: 'ranking',
};

/* ─── TABLE STATE ─────────────────────────────────────── */
let _tableData = []; // datos actuales de la tabla (filtrados+ordenados)

/* ─── INITIALIZATION ──────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  _initLoadingSequence();
});

function _initLoadingSequence() {
  const overlay = document.getElementById('loadingOverlay');
  const loadBar = document.getElementById('loadingBar');
  const loadMsg = document.getElementById('loadingMessage');

  _setupEventListeners();
  _applyStoredTheme();

  const fileId = DataStore.getDriveFileId();

  if (!fileId) {
    // No Drive ID configured → show admin panel to set one
    if (overlay) { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 500); }
    _showAdminPanel(true);
    return;
  }

  // Auto-load from Google Sheets (export as xlsx)
  const driveUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
  if (loadBar) loadBar.style.width = '20%';
  if (loadMsg) loadMsg.textContent = 'Cargando datos del torneo…';

  DataStore.loadFromUrl(driveUrl)
    .then(() => {
      if (loadBar) loadBar.style.width = '100%';
      if (loadMsg) loadMsg.textContent = '¡Listo!';
      setTimeout(() => {
        if (overlay) { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 500); }
        _initDashboard();
      }, 400);
    })
    .catch(err => {
      console.error('Error cargando desde Drive:', err);
      if (loadMsg) loadMsg.textContent = 'Error al cargar datos. Intenta de nuevo.';
      if (loadBar) { loadBar.style.background = '#DC2626'; loadBar.style.width = '100%'; }
      setTimeout(() => {
        if (overlay) { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 500); }
        _showAdminPanel(false, 'No se pudo cargar el archivo desde Google Drive. Verifica que el enlace sea público y el File ID sea correcto.');
      }, 1500);
    });
}

/* ─── EVENT LISTENERS ─────────────────────────────────── */
function _setupEventListeners() {

  /* File upload */
  const fileInput = document.getElementById('fileInput');
  const dropzone  = document.getElementById('dropzone');

  fileInput?.addEventListener('change', e => {
    if (e.target.files[0]) _handleFileUpload(e.target.files[0]);
  });

  // Drag & drop
  dropzone?.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone?.addEventListener('drop', e => {
    e.preventDefault(); dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) _handleFileUpload(file);
  });

  /* Sidebar navigation */
  document.querySelectorAll('.sidebar-item[data-section]').forEach(item => {
    item.addEventListener('click', () => _navigateTo(item.dataset.section));
  });

  /* Sidebar toggle */
  const sidebarToggle = document.getElementById('sidebarToggle');
  sidebarToggle?.addEventListener('click', _toggleSidebar);

  /* Dark mode toggles */
  [document.getElementById('darkModeToggle'), document.getElementById('darkModeToggleHeader')].forEach(btn => {
    btn?.addEventListener('click', _toggleDarkMode);
  });

  /* Admin panel keyboard shortcut: Ctrl+Shift+A */
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') { e.preventDefault(); _showAdminPanel(false); }
  });

  /* Global search */
  const globalSearch = document.getElementById('globalSearch');
  globalSearch?.addEventListener('input', Utils.debounce(_handleGlobalSearch, 250));
  globalSearch?.addEventListener('focus', _handleGlobalSearch);
  document.addEventListener('click', e => {
    if (!e.target.closest('#globalSearchWrap')) _closeGsSuggestions();
  });

  /* Filter panel toggle */
  document.getElementById('filterToggle')?.addEventListener('click', () => {
    const panel = document.getElementById('filterPanel');
    panel?.classList.toggle('d-none');
  });

  document.getElementById('clearFilters')?.addEventListener('click', _clearFilters);
  document.getElementById('filterCut')?.addEventListener('change', _applyGlobalFilter);
  document.getElementById('filterPeru')?.addEventListener('change', _applyGlobalFilter);
  document.getElementById('filterExacto')?.addEventListener('change', _applyGlobalFilter);

  document.querySelectorAll('.top-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.top-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.filterTop = parseInt(btn.dataset.top, 10);
      _applyGlobalFilter();
    });
  });

  /* Timeline navigation */
  document.getElementById('timelinePrev')?.addEventListener('click', () => _shiftTimeline(-1));
  document.getElementById('timelineNext')?.addEventListener('click', () => _shiftTimeline(1));

  /* Quick chart toggle */
  document.querySelectorAll('[data-quick-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-quick-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.quickChartView = btn.dataset.quickView;
      ChartManager.renderQuickChart(AppState.quickChartView);
    });
  });

  /* Variation cut selects */
  ['variationCutSelectOv','variationCutSelectEvo'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e => {
      const idx = e.target.value !== '' ? parseInt(e.target.value, 10) : AppState.currentCutIdx;
      ChartManager.renderVariationChart(id === 'variationCutSelectOv' ? 'variationChartOv' : 'variationChartEvo', idx);
    });
  });

  /* Ranking table search & sort */
  const rankingSearch = document.getElementById('rankingSearch');
  rankingSearch?.addEventListener('input', Utils.debounce(e => {
    AppState.tableSearch = e.target.value;
    AppState.tablePage = 1;
    _renderRankingTable();
  }, 250));

  /* Ranking cut select */
  document.getElementById('rankingCutSelect')?.addEventListener('change', e => {
    const idx = e.target.value !== '' ? parseInt(e.target.value, 10) : AppState.currentCutIdx;
    DataStore.setCurrentCutIdx(idx);
    AppState.currentCutIdx = idx;
    AppState.tablePage = 1;
    _renderRankingTable();
  });

  /* Table filter pills */
  document.querySelectorAll('[data-tfilter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tfilter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.tableFilter = btn.dataset.tfilter;
      AppState.tablePage = 1;
      _renderRankingTable();
    });
  });

  /* Table column sort */
  document.querySelectorAll('.ranking-table thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (AppState.tableSortCol === col) {
        AppState.tableSortAsc = !AppState.tableSortAsc;
      } else {
        AppState.tableSortCol = col;
        AppState.tableSortAsc = col === 'ranking';
      }
      document.querySelectorAll('.ranking-table thead th').forEach(h => {
        h.classList.remove('sort-asc','sort-desc');
      });
      th.classList.add(AppState.tableSortAsc ? 'sort-asc' : 'sort-desc');
      AppState.tablePage = 1;
      _renderRankingTable();
    });
  });

  /* Pagination */
  document.getElementById('prevPage')?.addEventListener('click', () => { AppState.tablePage--; _renderRankingTable(); });
  document.getElementById('nextPage')?.addEventListener('click', () => { AppState.tablePage++; _renderRankingTable(); });
  document.getElementById('pageSizeSelect')?.addEventListener('change', e => {
    AppState.tablePageSize = parseInt(e.target.value, 10);
    AppState.tablePage = 1;
    _renderRankingTable();
  });

  /* Evolution participant selector */
  const evoSearch = document.getElementById('evoSearch');
  evoSearch?.addEventListener('input', Utils.debounce(_handleEvoSearch, 250));
  evoSearch?.addEventListener('focus', _handleEvoSearch);
  document.addEventListener('click', e => {
    if (!e.target.closest('.evo-search-wrap')) _closeEvoDropdown();
  });

  document.getElementById('addTop3EvoBtn')?.addEventListener('click', () => {
    if (!DataStore.isLoaded()) return;
    DataStore.getTopN(3).forEach(r => _addEvoParticipant(r.nombre));
  });
  document.getElementById('addPeruEvoBtn')?.addEventListener('click', () => {
    if (!DataStore.isLoaded()) return;
    DataStore.getTopN(100).filter(r => r.isPeru).slice(0, 5).forEach(r => _addEvoParticipant(r.nombre));
  });
  document.getElementById('clearEvoBtn')?.addEventListener('click', () => {
    AppState.evoSelectedNames = [];
    _renderEvoTags();
    _renderEvoCharts();
  });

  /* Comparator */
  _setupComparatorSearch('comp1Input','comp1Dropdown', 1);
  _setupComparatorSearch('comp2Input','comp2Dropdown', 2);
  document.querySelectorAll('.comp-clear').forEach(btn => {
    btn.addEventListener('click', () => _clearCompPlayer(parseInt(btn.dataset.player)));
  });

  /* Race chart controls */
  document.getElementById('racePlayBtn')?.addEventListener('click', ChartManager.playRace);
  document.getElementById('racePauseBtn')?.addEventListener('click', ChartManager.pauseRace);
  document.getElementById('raceResetBtn')?.addEventListener('click', ChartManager.resetRace);
  const raceSpeed = document.getElementById('raceSpeed');
  raceSpeed?.addEventListener('input', () => {
    const ms = parseInt(raceSpeed.value, 10);
    ChartManager.setRaceSpeed(ms);
    const lbl = document.getElementById('raceSpeedLbl');
    if (lbl) lbl.textContent = (ms / 1000).toFixed(1) + 's';
  });

  /* Heatmap controls */
  document.getElementById('heatmapTopN')?.addEventListener('change', () => _renderHeatmap());
  document.getElementById('heatmapPeruOnly')?.addEventListener('change', () => _renderHeatmap());

  /* Analysis cut select */
  document.getElementById('analysisCutSelect')?.addEventListener('change', e => {
    const idx = e.target.value !== '' ? parseInt(e.target.value, 10) : AppState.currentCutIdx;
    ChartManager.renderScatterChart(idx);
    ChartManager.renderDistChart(idx);
    _renderStatsCards(idx);
  });

  /* Export buttons */
  document.getElementById('exportCSV')?.addEventListener('click', _exportCSV);
  document.getElementById('exportExcel')?.addEventListener('click', _exportExcelBtn);
  document.getElementById('exportPNG')?.addEventListener('click', () => Utils.exportPNG('#section-' + AppState.activeSection));
  document.getElementById('exportPDF')?.addEventListener('click', () => Utils.exportPDF());
}

/* ─── ADMIN PANEL ─────────────────────────────────────── */
function _showAdminPanel(firstTime = false, errorMsg = '') {
  const existing = document.getElementById('adminModal');
  if (existing) existing.remove();

  const currentId = DataStore.getDriveFileId();
  const modal = document.createElement('div');
  modal.id = 'adminModal';
  modal.innerHTML = `
    <div class="admin-backdrop"></div>
    <div class="admin-modal">
      <div class="admin-modal-header">
        <i class="fas fa-shield-halved me-2"></i>Panel de administración
        ${!firstTime ? '<button class="admin-close" id="adminClose"><i class="fas fa-xmark"></i></button>' : ''}
      </div>
      <div class="admin-modal-body">
        ${errorMsg ? `<div class="admin-error"><i class="fas fa-triangle-exclamation me-2"></i>${errorMsg}</div>` : ''}
        ${firstTime ? '<p class="admin-intro">Configura el origen de datos para que el dashboard cargue automáticamente.</p>' : ''}

        <div class="admin-section">
          <label class="admin-label"><i class="fab fa-google-drive me-2 text-warning"></i>Google Drive — File ID</label>
          <p class="admin-hint">De la URL de Google Sheets copia el ID: docs.google.com/spreadsheets/d/<strong>[ESTE ID]</strong>/edit. El archivo debe estar compartido como "Cualquiera con el enlace puede ver".</p>
          <div class="admin-input-row">
            <input type="text" id="adminDriveId" class="admin-input" placeholder="1BxiM...ZsGV" value="${currentId}">
            <button class="admin-btn-primary" id="adminTestDrive"><i class="fas fa-bolt me-1"></i>Cargar</button>
          </div>
          <div id="adminDriveStatus" class="admin-status"></div>
        </div>

        <div class="admin-divider"><span>o bien</span></div>

        <div class="admin-section">
          <label class="admin-label"><i class="fas fa-file-excel me-2 text-success"></i>Subir archivo Excel directamente</label>
          <div class="admin-dropzone" id="adminDropzone">
            <i class="fas fa-cloud-upload-alt fa-2x mb-2"></i>
            <p>Arrastra el .xlsx aquí o <label for="adminFileInput" class="admin-link">selecciona archivo</label></p>
            <input type="file" id="adminFileInput" accept=".xlsx,.xls" hidden>
          </div>
          <div id="adminFileStatus" class="admin-status"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Backdrop close (only if not first time)
  if (!firstTime) {
    modal.querySelector('.admin-backdrop')?.addEventListener('click', () => modal.remove());
    document.getElementById('adminClose')?.addEventListener('click', () => modal.remove());
  }

  // Drive load
  document.getElementById('adminTestDrive')?.addEventListener('click', async () => {
    const id = document.getElementById('adminDriveId')?.value.trim();
    if (!id) return;
    const status = document.getElementById('adminDriveStatus');
    if (status) status.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Cargando…';

    // Update the config variable in memory
    try {
      const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
      await DataStore.loadFromUrl(url);
      if (status) status.innerHTML = `<span class="admin-ok"><i class="fas fa-check me-1"></i>${DataStore.getParticipants().length} participantes, ${DataStore.getCuts().length} cortes cargados.</span>`;
      setTimeout(() => { modal.remove(); _initDashboard(); }, 800);
    } catch (err) {
      if (status) status.innerHTML = `<span class="admin-err"><i class="fas fa-xmark me-1"></i>Error: ${err.message}. Verifica que el archivo sea público.</span>`;
    }
  });

  // File upload
  const adminDropzone  = document.getElementById('adminDropzone');
  const adminFileInput = document.getElementById('adminFileInput');

  adminFileInput?.addEventListener('change', e => {
    if (e.target.files[0]) _handleAdminFileUpload(e.target.files[0], modal);
  });
  adminDropzone?.addEventListener('dragover', e => { e.preventDefault(); adminDropzone.classList.add('drag-over'); });
  adminDropzone?.addEventListener('dragleave', () => adminDropzone.classList.remove('drag-over'));
  adminDropzone?.addEventListener('drop', e => {
    e.preventDefault(); adminDropzone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) _handleAdminFileUpload(e.dataTransfer.files[0], modal);
  });
}

async function _handleAdminFileUpload(file, modal) {
  const status = document.getElementById('adminFileStatus');
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    if (status) status.innerHTML = '<span class="admin-err">Formato no válido. Usa .xlsx o .xls</span>';
    return;
  }
  if (status) status.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Procesando…';
  try {
    await DataStore.loadFile(file);
    if (status) status.innerHTML = `<span class="admin-ok"><i class="fas fa-check me-1"></i>${DataStore.getParticipants().length} participantes, ${DataStore.getCuts().length} cortes.</span>`;
    setTimeout(() => { modal?.remove(); _initDashboard(); }, 800);
  } catch (err) {
    if (status) status.innerHTML = `<span class="admin-err">Error al leer el archivo.</span>`;
  }
}

/* ─── DASHBOARD INIT ──────────────────────────────────── */
function _initDashboard() {
  if (!DataStore.isLoaded()) return;

  AppState.currentCutIdx = DataStore.getCurrentCutIdx();

  _updateHeaderStats();
  _populateCutSelects();
  _buildTimeline();
  _updateKPICards();
  _renderRankingTable();
  _renderOverviewCharts();
  _renderAnalysisSection();
  _renderExactScores();
  _renderTrendsSection();

  // Enable race chart controls
  ['racePlayBtn','racePauseBtn','raceResetBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });

  // Show timeline
  const tl = document.getElementById('timelineBar');
  if (tl) tl.classList.remove('d-none');

  _navigateTo(AppState.activeSection);
}

/* ─── HEADER STATS ────────────────────────────────────── */
function _updateHeaderStats() {
  const cuts = DataStore.getCuts();
  const participants = DataStore.getParticipants();

  _setEl('hkParticipantes', participants.length);
  _setEl('hkCortes', cuts.length);

  const lastCut = cuts[cuts.length - 1];
  const lastDate = lastCut ? new Date(lastCut) : null;
  _setEl('hkFecha', lastDate ? Utils.formatDate(lastDate, 'datetime') : '—');

  // Also update filter cut select header info
  const sub = document.getElementById('headerSubtitle');
  if (sub && lastDate) sub.textContent = `Último corte: ${Utils.formatDate(lastDate, 'medium')}`;
}

/* ─── POPULATE CUT SELECTS ────────────────────────────── */
function _populateCutSelects() {
  const cuts = DataStore.getCuts();
  const opts = cuts.map((c, i) => `<option value="${i}">${DataStore.getCutLabel(c)}</option>`).join('');
  const optsFull = `<option value="">Último corte</option>` + opts;

  ['rankingCutSelect','analysisCutSelect',
   'variationCutSelectOv','variationCutSelectEvo',
   'filterCut'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = optsFull;
      if (id === 'rankingCutSelect') el.value = String(AppState.currentCutIdx);
    }
  });
}

/* ─── TIMELINE ────────────────────────────────────────── */
function _buildTimeline() {
  const track = document.getElementById('timelineTrack');
  if (!track) return;

  const cuts = DataStore.getCuts();
  track.innerHTML = cuts.map((cut, i) => {
    const d = new Date(cut);
    const label = Utils.formatDate(d, 'short');
    return `<div class="tl-dot${i === AppState.currentCutIdx ? ' active' : ''}" data-idx="${i}" title="${DataStore.getCutLabel(cut)}">
      <div class="tl-dot-circle"></div>
      <span class="tl-dot-label">${label}</span>
    </div>`;
  }).join('');

  track.querySelectorAll('.tl-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.dataset.idx, 10);
      _selectCut(idx);
    });
  });

  _updateTimelineLabel();
}

function _selectCut(idx) {
  const cuts = DataStore.getCuts();
  idx = Math.max(0, Math.min(idx, cuts.length - 1));
  AppState.currentCutIdx = idx;
  DataStore.setCurrentCutIdx(idx);

  // Update timeline dots
  document.querySelectorAll('.tl-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  _updateTimelineLabel();

  // Update ranking cut select
  const sel = document.getElementById('rankingCutSelect');
  if (sel) sel.value = String(idx);

  // Re-render active section
  _refreshCurrentSection();
}

function _updateTimelineLabel() {
  const lbl = document.getElementById('timelineCurrentLabel');
  if (lbl) lbl.textContent = DataStore.getCutLabelByIdx(AppState.currentCutIdx);
}

function _shiftTimeline(delta) {
  _selectCut(AppState.currentCutIdx + delta);
}

/* ─── KPI CARDS ──────────────────────────────────────── */
function _updateKPICards() {
  const m = DataStore.getMetrics();
  if (!m) return;

  // Top 3
  if (m.top3[0]) {
    const n = m.top3[0];
    _setEl('kpiLeader', _nameWithFlag(n.nombre));
    _setEl('kpiLeaderScore', `${Utils.formatNumber(n.puntaje)} pts`);
    ChartManager.renderSparkline('sparkLeader', DataStore.getHistory(n.nombre).map(r => r.ranking), '#D4AF37', 'line', true);
  }
  if (m.top3[1]) {
    const n = m.top3[1];
    _setEl('kpiSecond', _nameWithFlag(n.nombre));
    _setEl('kpiSecondScore', `${Utils.formatNumber(n.puntaje)} pts`);
    ChartManager.renderSparkline('sparkSecond', DataStore.getHistory(n.nombre).map(r => r.ranking), '#9BA8B5', 'line', true);
  }
  if (m.top3[2]) {
    const n = m.top3[2];
    _setEl('kpiThird', _nameWithFlag(n.nombre));
    _setEl('kpiThirdScore', `${Utils.formatNumber(n.puntaje)} pts`);
    ChartManager.renderSparkline('sparkThird', DataStore.getHistory(n.nombre).map(r => r.ranking), '#CD7F32', 'line', true);
  }

  // Average score
  Utils.animateCounter(document.getElementById('kpiAvg'), Math.round(m.stats.mean));
  _setEl('kpiAvgSub', `Mediana: ${Utils.formatNumber(Math.round(m.stats.median))} pts`);

  // Rise / Fall
  if (m.rises[0]) {
    _setEl('kpiRise', _nameWithFlag(m.rises[0].nombre));
    _setEl('kpiRiseSub', `▲ +${m.rises[0].delta} posiciones`);
  }
  if (m.falls[0]) {
    _setEl('kpiFall', _nameWithFlag(m.falls[0].nombre));
    _setEl('kpiFallSub', `▼ ${m.falls[0].delta} posiciones`);
  }

  // Consistent
  if (m.consistency[0]) {
    _setEl('kpiConsistent', _nameWithFlag(m.consistency[0].nombre));
    _setEl('kpiConsistentSub', `σ = ${m.consistency[0].sd.toFixed(2)}`);
  }

  // Exact scores
  Utils.animateCounter(document.getElementById('kpiExact'), m.totalExact);
  if (m.exactSorted[0]) {
    _setEl('kpiExactSub', `Más: ${_nameWithFlag(m.exactSorted[0].nombre)} (${m.exactSorted[0].exacto})`);
  }
}

/* ─── OVERVIEW CHARTS ────────────────────────────────── */
function _renderOverviewCharts() {
  ChartManager.renderQuickChart(AppState.quickChartView);
  ChartManager.renderQuickDonut();
  ChartManager.renderVariationChart('variationChartOv', AppState.currentCutIdx);
}

/* ─── RANKING TABLE ──────────────────────────────────── */
function _renderRankingTable() {
  if (!DataStore.isLoaded()) return;

  const cutIdx = AppState.currentCutIdx;
  let data = DataStore.getCutData(cutIdx);

  // Apply filter
  const f = AppState.tableFilter;
  if (f === 'peru')   data = data.filter(r => r.isPeru);
  if (f === 'top10')  data = data.filter(r => r.ranking <= 10);
  if (f === 'top20')  data = data.filter(r => r.ranking <= 20);
  if (f === 'top50')  data = data.filter(r => r.ranking <= 50);
  if (f === 'exacto') data = data.filter(r => r.exacto > 0);

  // Apply global top filter
  data = data.filter(r => r.ranking <= AppState.filterTop);
  if (AppState.filterPeru)   data = data.filter(r => r.isPeru);
  if (AppState.filterExacto) data = data.filter(r => r.exacto > 0);

  // Search
  if (AppState.tableSearch) {
    const q = AppState.tableSearch.toLowerCase();
    data = data.filter(r => r.nombre.toLowerCase().includes(q));
  }

  // Sort
  const col = AppState.tableSortCol;
  const asc = AppState.tableSortAsc;
  data.sort((a, b) => {
    let va = col === 'exacto' ? a.exacto : col === 'puntaje' ? a.puntaje : a.ranking;
    let vb = col === 'exacto' ? b.exacto : col === 'puntaje' ? b.puntaje : b.ranking;
    return asc ? va - vb : vb - va;
  });

  _tableData = data;

  // Pagination
  const total = data.length;
  const pageSize = AppState.tablePageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  AppState.tablePage = Math.min(AppState.tablePage, totalPages);

  const from = (AppState.tablePage - 1) * pageSize;
  const to   = Math.min(from + pageSize, total);
  const pageData = data.slice(from, to);

  _setEl('pgFrom', from + 1 || 0);
  _setEl('pgTo', to);
  _setEl('pgTotal', total);
  _setEl('tableCount', `${total} participante${total !== 1 ? 's' : ''}`);

  // Render rows
  const tbody = document.getElementById('rankingTableBody');
  if (!tbody) return;

  if (!pageData.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-table-msg"><i class="fas fa-search fa-2x d-block mb-2"></i>Sin resultados</td></tr>`;
    _renderPagination(totalPages);
    return;
  }

  tbody.innerHTML = pageData.map(r => {
    const rankClass = r.ranking === 1 ? 'row-top1' : r.ranking === 2 ? 'row-top2' : r.ranking === 3 ? 'row-top3' : r.isPeru ? 'row-peru' : '';
    const badgeClass = r.ranking === 1 ? 'gold' : r.ranking === 2 ? 'silver' : r.ranking === 3 ? 'bronze' : '';
    const exactHtml = r.exacto > 0 ? `<span class="exact-badge"><i class="fas fa-bullseye me-1"></i>${r.exacto}</span>` : '<span class="text-muted">—</span>';

    // Sparkline placeholder (will be filled after render)
    const sparkId = `spark-${Utils.uid()}`;

    return `<tr class="${rankClass}">
      <td><span class="rank-badge ${badgeClass}">${r.ranking}</span></td>
      <td>
        <span class="participant-name">
          ${r.isPeru ? '<span class="peru-flag">🇵🇪</span>' : ''}${_escHtml(r.nombre)}
        </span>
      </td>
      <td><strong>${Utils.formatNumber(r.puntaje)}</strong></td>
      <td>${exactHtml}</td>
      <td>${Utils.varBadge(r.delta)}</td>
      <td class="sparkline-cell"><canvas id="${sparkId}" width="80" height="28"></canvas></td>
    </tr>`;
  }).join('');

  // Render sparklines for each row
  pageData.forEach((r, i) => {
    const history = DataStore.getHistory(r.nombre).map(row => row.ranking);
    const sparkId = tbody.querySelectorAll('td.sparkline-cell canvas')[i]?.id;
    if (sparkId && history.length > 1) {
      ChartManager.renderSparkline(sparkId, history, '#2979D9', 'line', true);
    }
  });

  _renderPagination(totalPages);
  _updatePagButtons(totalPages);
}

function _renderPagination(totalPages) {
  const wrap = document.getElementById('pageNums');
  if (!wrap) return;

  const current = AppState.tablePage;
  const pages = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - current) <= 1) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  wrap.innerHTML = pages.map(p =>
    p === '…'
      ? `<span class="page-num" style="border:none;cursor:default">…</span>`
      : `<button class="page-num${p === current ? ' active' : ''}" data-page="${p}">${p}</button>`
  ).join('');

  wrap.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.tablePage = parseInt(btn.dataset.page, 10);
      _renderRankingTable();
    });
  });
}

function _updatePagButtons(totalPages) {
  const prev = document.getElementById('prevPage');
  const next = document.getElementById('nextPage');
  if (prev) prev.disabled = AppState.tablePage <= 1;
  if (next) next.disabled = AppState.tablePage >= totalPages;
}

/* ─── EVOLUTION SECTION ──────────────────────────────── */
function _handleEvoSearch() {
  const input = document.getElementById('evoSearch');
  const dropdown = document.getElementById('evoSearchDropdown');
  if (!input || !dropdown || !DataStore.isLoaded()) return;

  const query = input.value.trim();
  const results = DataStore.searchParticipants(query, 10)
    .filter(n => !AppState.evoSelectedNames.includes(n));

  if (!results.length) { dropdown.classList.remove('open'); return; }

  dropdown.innerHTML = results.map(name => {
    const cutData = DataStore.getCutData();
    const row = cutData.find(r => r.nombre === name);
    const rank = row ? `#${row.ranking}` : '';
    return `<div class="evo-result-item" data-name="${_escAttr(name)}">
      ${name.includes ? (DataStore.isPeru(name) ? '🇵🇪 ' : '') : ''}${_escHtml(name)}
      <span class="ms-auto text-muted small">${rank}</span>
    </div>`;
  }).join('');

  dropdown.querySelectorAll('.evo-result-item').forEach(item => {
    item.addEventListener('click', () => {
      _addEvoParticipant(item.dataset.name);
      input.value = '';
      dropdown.classList.remove('open');
    });
  });

  dropdown.classList.add('open');
}

function _closeEvoDropdown() {
  const dropdown = document.getElementById('evoSearchDropdown');
  if (dropdown) dropdown.classList.remove('open');
}

function _addEvoParticipant(name) {
  if (AppState.evoSelectedNames.includes(name)) return;
  if (AppState.evoSelectedNames.length >= 10) {
    Utils.toast('Máximo 10 participantes a la vez', 'warning');
    return;
  }
  AppState.evoSelectedNames.push(name);
  _renderEvoTags();
  _renderEvoCharts();
}

function _removeEvoParticipant(name) {
  AppState.evoSelectedNames = AppState.evoSelectedNames.filter(n => n !== name);
  _renderEvoTags();
  _renderEvoCharts();
}

function _renderEvoTags() {
  const wrap = document.getElementById('evoSelectedTags');
  if (!wrap) return;

  wrap.innerHTML = AppState.evoSelectedNames.map((name, i) => {
    const color = Utils.paletteColor(i);
    return `<span class="evo-tag" style="background:${color}">
      ${DataStore.isPeru(name) ? '🇵🇪 ' : ''}${_escHtml(Utils.truncate(name, 20))}
      <button class="evo-tag-remove" data-name="${_escAttr(name)}"><i class="fas fa-xmark"></i></button>
    </span>`;
  }).join('');

  wrap.querySelectorAll('.evo-tag-remove').forEach(btn => {
    btn.addEventListener('click', () => _removeEvoParticipant(btn.dataset.name));
  });
}

function _renderEvoCharts() {
  ChartManager.renderRankingEvoChart(AppState.evoSelectedNames);
  ChartManager.renderScoreEvoChart(AppState.evoSelectedNames);
  ChartManager.renderVariationChart('variationChartEvo', AppState.currentCutIdx);
}

/* ─── COMPARATOR ─────────────────────────────────────── */
function _setupComparatorSearch(inputId, dropdownId, player) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  input.addEventListener('input', Utils.debounce(() => {
    if (!DataStore.isLoaded()) return;
    const q = input.value.trim();
    const results = DataStore.searchParticipants(q, 10);

    if (!results.length) { dropdown.classList.remove('open'); return; }

    dropdown.innerHTML = results.map(name =>
      `<div class="comp-dropdown-item" data-name="${_escAttr(name)}">
        ${DataStore.isPeru(name) ? '🇵🇪 ' : ''}${_escHtml(name)}
      </div>`
    ).join('');

    dropdown.querySelectorAll('.comp-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        _selectCompPlayer(player, item.dataset.name);
        input.value = '';
        dropdown.classList.remove('open');
      });
    });

    dropdown.classList.add('open');
  }, 200));

  document.addEventListener('click', e => {
    if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${dropdownId}`)) {
      dropdown.classList.remove('open');
    }
  });
}

function _selectCompPlayer(player, name) {
  if (player === 1) {
    AppState.compPlayer1 = name;
    _setEl('comp1Name', (DataStore.isPeru(name) ? '🇵🇪 ' : '') + name);
    document.getElementById('comp1Card')?.classList.remove('d-none');
  } else {
    AppState.compPlayer2 = name;
    _setEl('comp2Name', (DataStore.isPeru(name) ? '🇵🇪 ' : '') + name);
    document.getElementById('comp2Card')?.classList.remove('d-none');
  }
  _tryRenderComparator();
}

function _clearCompPlayer(player) {
  if (player === 1) {
    AppState.compPlayer1 = null;
    document.getElementById('comp1Card')?.classList.add('d-none');
  } else {
    AppState.compPlayer2 = null;
    document.getElementById('comp2Card')?.classList.add('d-none');
  }
  _tryRenderComparator();
}

function _tryRenderComparator() {
  const results  = document.getElementById('compResults');
  const empty    = document.getElementById('compEmpty');
  if (!AppState.compPlayer1 || !AppState.compPlayer2) {
    results?.classList.add('d-none');
    empty?.classList.remove('d-none');
    return;
  }
  results?.classList.remove('d-none');
  empty?.classList.add('d-none');

  const s1 = DataStore.getParticipantStats(AppState.compPlayer1);
  const s2 = DataStore.getParticipantStats(AppState.compPlayer2);
  if (!s1 || !s2) return;

  _setEl('compH1', (DataStore.isPeru(s1.nombre) ? '🇵🇪 ' : '') + s1.nombre);
  _setEl('compH2', (DataStore.isPeru(s2.nombre) ? '🇵🇪 ' : '') + s2.nombre);

  const rows = [
    { label: 'Ranking actual',     v1: `#${s1.currentRank}`,        v2: `#${s2.currentRank}`,        better: s1.currentRank < s2.currentRank ? 1 : 2 },
    { label: 'Puntaje actual',     v1: Utils.formatNumber(s1.currentScore), v2: Utils.formatNumber(s2.currentScore), better: s1.currentScore > s2.currentScore ? 1 : 2 },
    { label: 'Mejor ranking',      v1: `#${s1.bestRank}`,            v2: `#${s2.bestRank}`,            better: s1.bestRank < s2.bestRank ? 1 : 2 },
    { label: 'Peor ranking',       v1: `#${s1.worstRank}`,           v2: `#${s2.worstRank}`,           better: s1.worstRank > s2.worstRank ? 2 : 1 },
    { label: 'Marcadores exactos', v1: s1.exact,                     v2: s2.exact,                     better: s1.exact > s2.exact ? 1 : 2 },
    { label: 'Ascensos',           v1: s1.rises,                     v2: s2.rises,                     better: s1.rises > s2.rises ? 1 : 2 },
    { label: 'Descensos',          v1: s1.falls,                     v2: s2.falls,                     better: s1.falls < s2.falls ? 1 : 2 },
    { label: 'Veces líder',        v1: s1.timesLeader,               v2: s2.timesLeader,               better: s1.timesLeader > s2.timesLeader ? 1 : 2 },
    { label: 'Veces Top 10',       v1: s1.timesTop10,                v2: s2.timesTop10,                better: s1.timesTop10 > s2.timesTop10 ? 1 : 2 },
    { label: 'Crecimiento total',  v1: s1.totalDelta > 0 ? `▲${s1.totalDelta}` : `▼${Math.abs(s1.totalDelta)}`, v2: s2.totalDelta > 0 ? `▲${s2.totalDelta}` : `▼${Math.abs(s2.totalDelta)}`, better: s1.totalDelta > s2.totalDelta ? 1 : 2 },
    { label: 'Constancia (σ)',     v1: s1.sdRank.toFixed(2),         v2: s2.sdRank.toFixed(2),         better: s1.sdRank < s2.sdRank ? 1 : 2 },
  ];

  const tbody = document.getElementById('compStatsBody');
  if (tbody) {
    tbody.innerHTML = rows.map(row =>
      `<tr class="${row.better === 1 ? 'stat-row-better-p1' : 'stat-row-better-p2'}">
        <td>${row.label}</td>
        <td class="${row.better === 1 ? 'fw-700 text-p1' : ''}">${row.v1}</td>
        <td class="${row.better === 2 ? 'fw-700 text-p2' : ''}">${row.v2}</td>
      </tr>`
    ).join('');
  }

  ChartManager.renderCompRankChart(s1.nombre, s2.nombre);
  ChartManager.renderCompRadarChart(s1, s2);
  _renderCompConclusion(s1, s2);
}

function _renderCompConclusion(s1, s2) {
  const el = document.getElementById('compConclusion');
  if (!el) return;

  let score1 = 0, score2 = 0;
  if (s1.currentRank < s2.currentRank) score1++; else score2++;
  if (s1.bestRank < s2.bestRank) score1++; else score2++;
  if (s1.exact > s2.exact) score1++; else score2++;
  if (s1.rises > s2.rises) score1++; else score2++;
  if (s1.timesTop10 > s2.timesTop10) score1++; else score2++;
  if (s1.sdRank < s2.sdRank) score1++; else score2++;
  if (s1.totalDelta > s2.totalDelta) score1++; else score2++;

  const winner = score1 > score2 ? s1 : s2;
  const pct = Math.round((Math.max(score1, score2) / 7) * 100);
  const wName = `<strong>${(DataStore.isPeru(winner.nombre) ? '🇵🇪 ' : '') + winner.nombre}</strong>`;
  const lName = winner === s1 ? s2.nombre : s1.nombre;

  el.innerHTML = `
    <p>🏆 Tras analizar <strong>7 dimensiones</strong> de rendimiento, ${wName} muestra un desempeño superior en <strong>${Math.max(score1,score2)} de 7 categorías</strong> (${pct}%).</p>
    <p>Destaca especialmente en:
      ${s1 === winner && s1.currentRank < s2.currentRank ? `<strong>mejor ranking actual (#${s1.currentRank})</strong>, ` : ''}
      ${s2 === winner && s2.currentRank < s1.currentRank ? `<strong>mejor ranking actual (#${s2.currentRank})</strong>, ` : ''}
      ${winner.exact > 0 ? `<strong>${winner.exact} marcadores exactos</strong>, ` : ''}
      ${winner.rises > winner.falls ? `<strong>${winner.rises} ascensos</strong>` : `<strong>constancia (σ=${winner.sdRank.toFixed(1)})</strong>`}.
    </p>
    <p class="mb-0 text-muted small">Nota: este análisis cubre todos los cortes registrados. ${lName} podría tener un mejor desempeño en cortes futuros.</p>`;
}

/* ─── ANALYSIS SECTION ────────────────────────────────── */
function _renderAnalysisSection() {
  ChartManager.renderScatterChart(AppState.currentCutIdx);
  ChartManager.renderDistChart(AppState.currentCutIdx);
  _renderStatsCards(AppState.currentCutIdx);
}

function _renderStatsCards(cutIdx = null) {
  const data = DataStore.getCutData(cutIdx);
  if (!data.length) return;

  const scores = data.map(r => r.puntaje);
  const stats = {
    Promedio:         Math.round(Utils.mean(scores)),
    Mediana:          Math.round(Utils.median(scores)),
    'Desv. estándar': Utils.stddev(scores).toFixed(1),
    Máximo:           Math.max(...scores),
    Mínimo:           Math.min(...scores),
    'Percentil 25':   Math.round(Utils.percentile(scores, 25)),
    'Percentil 75':   Math.round(Utils.percentile(scores, 75)),
    'Percentil 90':   Math.round(Utils.percentile(scores, 90)),
  };

  const row = document.getElementById('statsCardsRow');
  if (!row) return;

  row.innerHTML = Object.entries(stats).map(([label, val]) =>
    `<div class="col-md-3 col-sm-6">
      <div class="stat-mini-card">
        <div class="stat-mini-label">${label}</div>
        <div class="stat-mini-value">${Utils.formatNumber(val)}</div>
        <div class="stat-mini-sub">puntos</div>
      </div>
    </div>`
  ).join('');
}

/* ─── EXACT SCORES ────────────────────────────────────── */
function _renderExactScores() {
  ChartManager.renderExactBarChart();
  ChartManager.renderExactPieChart();

  const m = DataStore.getMetrics();
  if (!m) return;

  const tbody = document.getElementById('exactTableBody');
  if (!tbody) return;

  const lastData = DataStore.getCutData();
  tbody.innerHTML = m.exactSorted.slice(0, 50).map((x, i) => {
    const current = lastData.find(r => r.nombre === x.nombre);
    return `<tr>
      <td><span class="rank-badge">${i + 1}</span></td>
      <td>${x.isPeru ? '<span class="peru-flag">🇵🇪</span>' : ''}${_escHtml(x.nombre)}</td>
      <td><span class="exact-badge"><i class="fas fa-bullseye me-1"></i>${x.exacto}</span></td>
      <td>${current ? `#${current.ranking}` : '—'}</td>
      <td>${current ? Utils.formatNumber(current.puntaje) + ' pts' : '—'}</td>
    </tr>`;
  }).join('');
}

/* ─── TRENDS SECTION ─────────────────────────────────── */
function _renderTrendsSection() {
  const m = DataStore.getMetrics();
  if (!m) return;

  // Trend cards
  const trendCards = [
    { icon: 'fas fa-rocket text-success',     label: 'Mayor crecimiento',    name: m.growth[0]?.nombre,     sub: m.growth[0]?.growth > 0 ? `▲ ${m.growth[0].growth} posiciones` : '—' },
    { icon: 'fas fa-arrow-trend-down text-danger', label: 'Mayor caída total', name: m.growth.length > 1 ? m.growth[m.growth.length-1]?.nombre : '—', sub: m.growth.length > 1 && m.growth[m.growth.length-1]?.growth < 0 ? `▼ ${Math.abs(m.growth[m.growth.length-1].growth)} posiciones` : '—' },
    { icon: 'fas fa-equals text-info',        label: 'Más constante',        name: m.consistency[0]?.nombre, sub: `σ = ${m.consistency[0]?.sd.toFixed(2) || '—'}` },
    { icon: 'fas fa-chart-scatter text-warning', label: 'Más irregular',     name: m.consistency.length ? m.consistency[m.consistency.length-1]?.nombre : '—', sub: `σ = ${m.consistency.length ? m.consistency[m.consistency.length-1]?.sd.toFixed(2) : '—'}` },
    { icon: 'fas fa-crown text-gold',         label: 'Más veces líder',      name: m.timesLeader[0]?.nombre, sub: `${m.timesLeader[0]?.count || 0} veces en #1` },
    { icon: 'fas fa-medal text-primary',      label: 'Más veces Top 10',     name: m.timesTop10[0]?.nombre,  sub: `${m.timesTop10[0]?.count || 0} cortes en Top 10` },
  ];

  const row = document.getElementById('trendCardsRow');
  if (row) {
    row.innerHTML = trendCards.map(card =>
      `<div class="col-xl-2 col-lg-4 col-md-6">
        <div class="trend-card">
          <i class="${card.icon} trend-card-icon"></i>
          <div class="trend-card-label">${card.label}</div>
          <div class="trend-card-name">${card.name ? _nameWithFlag(card.name) : '—'}</div>
          <div class="trend-card-sub">${card.sub || ''}</div>
        </div>
      </div>`
    ).join('');
  }

  // Leaderboard lists
  _renderLeaderboard('listMostLeader',    m.timesLeader,   v => `${v} veces`);
  _renderLeaderboard('listMostTop10',     m.timesTop10,    v => `${v} cortes`);
  _renderLeaderboard('listMostGrowth',    m.growth.slice(0,10).map(x => ({ nombre: x.nombre, count: x.growth, isPeru: x.isPeru })), v => v > 0 ? `▲ ${v}` : `▼ ${Math.abs(v)}`);
  _renderLeaderboard('listMostConsistent', m.consistency.slice(0,10).map(x => ({ nombre: x.nombre, count: x.sd, isPeru: x.isPeru })), v => `σ = ${Number(v).toFixed(2)}`, true);
}

function _renderLeaderboard(elId, data, formatVal, lowerBetter = false) {
  const el = document.getElementById(elId);
  if (!el || !data) return;

  const top10 = data.slice(0, 10);
  const maxVal = top10.length ? Math.max(...top10.map(x => Number(x.count))) : 1;

  el.innerHTML = top10.map((item, i) => {
    const posClass = i === 0 ? 'p1' : i === 1 ? 'p2' : i === 2 ? 'p3' : '';
    const barPct = maxVal > 0 ? (Number(item.count) / maxVal) * 100 : 0;
    return `<div class="lb-item">
      <span class="lb-pos ${posClass}">${i + 1}</span>
      <span class="lb-name">${item.isPeru ? '🇵🇪 ' : ''}${_escHtml(Utils.truncate(item.nombre, 22))}</span>
      <div class="lb-bar-wrap"><div class="lb-bar" style="width:${barPct}%"></div></div>
      <span class="lb-value">${formatVal(item.count)}</span>
    </div>`;
  }).join('');
}

/* ─── HEATMAP ────────────────────────────────────────── */
function _renderHeatmap() {
  const topN = parseInt(document.getElementById('heatmapTopN')?.value || '20', 10);
  const peruOnly = document.getElementById('heatmapPeruOnly')?.checked || false;
  ChartManager.renderHeatmap(topN, peruOnly);
}

/* ─── NAVIGATION ─────────────────────────────────────── */
function _navigateTo(section) {
  AppState.activeSection = section;

  // Update sidebar
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  // Show/hide sections
  document.querySelectorAll('.content-section').forEach(s => {
    s.classList.toggle('active', s.id === `section-${section}`);
  });

  // Lazy-render section-specific content
  if (section === 'evolution') _renderEvoCharts();
  if (section === 'race')      { ChartManager.initRaceChart(); }
  if (section === 'heatmap')   _renderHeatmap();
  if (section === 'comparator' && AppState.compPlayer1 && AppState.compPlayer2) _tryRenderComparator();

  // Close sidebar on mobile
  if (window.innerWidth < 992) {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebarOverlay')?.classList.remove('visible');
  }
}

function _refreshCurrentSection() {
  const s = AppState.activeSection;
  if (s === 'overview')   { _renderOverviewCharts(); _updateKPICards(); }
  if (s === 'ranking')    _renderRankingTable();
  if (s === 'evolution')  _renderEvoCharts();
  if (s === 'analysis')   _renderAnalysisSection();
  if (s === 'heatmap')    _renderHeatmap();
}

/* ─── SIDEBAR ─────────────────────────────────────────── */
function _toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main    = document.getElementById('mainContent');

  if (window.innerWidth < 992) {
    sidebar?.classList.toggle('mobile-open');
    let overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebarOverlay';
      overlay.className = 'sidebar-overlay';
      overlay.addEventListener('click', () => {
        sidebar?.classList.remove('mobile-open');
        overlay.classList.remove('visible');
      });
      document.body.appendChild(overlay);
    }
    overlay.classList.toggle('visible', sidebar?.classList.contains('mobile-open') || false);
  } else {
    AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
    sidebar?.classList.toggle('collapsed', AppState.sidebarCollapsed);
    main?.classList.toggle('sidebar-collapsed', AppState.sidebarCollapsed);
  }
}

/* ─── DARK MODE ──────────────────────────────────────── */
function _applyStoredTheme() {
  const stored = localStorage.getItem('cengol-theme');
  if (stored === 'dark') _setDarkMode(true);
}

function _toggleDarkMode() {
  _setDarkMode(!AppState.darkMode);
}

function _setDarkMode(dark) {
  AppState.darkMode = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem('cengol-theme', dark ? 'dark' : 'light');

  const icon1 = document.getElementById('darkModeIcon');
  const icon2 = document.getElementById('darkModeIconHeader');
  const lbl   = document.getElementById('darkModeLabel');
  const cls = dark ? 'fa-sun' : 'fa-moon';
  if (icon1) { icon1.className = `fas ${cls}`; }
  if (icon2) { icon2.className = `fas ${cls}`; }
  if (lbl) lbl.textContent = dark ? 'Modo claro' : 'Modo oscuro';

  ChartManager.updateTheme();
}

/* ─── GLOBAL SEARCH ──────────────────────────────────── */
function _handleGlobalSearch() {
  const input = document.getElementById('globalSearch');
  const suggestions = document.getElementById('gsSuggestions');
  if (!input || !suggestions || !DataStore.isLoaded()) return;

  const q = input.value.trim();
  const results = DataStore.searchParticipants(q, 8);

  if (!results.length) { _closeGsSuggestions(); return; }

  const lastData = DataStore.getCutData();
  suggestions.innerHTML = results.map(name => {
    const row = lastData.find(r => r.nombre === name);
    return `<div class="gs-suggestion" data-name="${_escAttr(name)}">
      <span>${DataStore.isPeru(name) ? '🇵🇪 ' : ''}${_escHtml(name)}</span>
      ${row ? `<span class="gs-rank-badge ms-auto">#${row.ranking}</span>` : ''}
    </div>`;
  }).join('');

  suggestions.querySelectorAll('.gs-suggestion').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      _closeGsSuggestions();
      input.value = '';
      // Navigate to comparator and pre-select
      _navigateTo('comparator');
      _selectCompPlayer(1, name);
      Utils.toast(`Buscando: ${name}`, 'info', 2000);
    });
  });

  suggestions.classList.add('open');
}

function _closeGsSuggestions() {
  const s = document.getElementById('gsSuggestions');
  if (s) s.classList.remove('open');
}

/* ─── FILTERS ────────────────────────────────────────── */
function _applyGlobalFilter() {
  const cutEl = document.getElementById('filterCut');
  const peruEl = document.getElementById('filterPeru');
  const exactoEl = document.getElementById('filterExacto');

  if (cutEl && cutEl.value !== '') {
    AppState.currentCutIdx = parseInt(cutEl.value, 10);
    DataStore.setCurrentCutIdx(AppState.currentCutIdx);
  }
  AppState.filterPeru   = peruEl?.checked || false;
  AppState.filterExacto = exactoEl?.checked || false;

  let count = 0;
  if (AppState.filterPeru) count++;
  if (AppState.filterExacto) count++;
  if (AppState.filterTop < 100) count++;
  if (cutEl?.value !== '') count++;

  const badge = document.getElementById('filterBadge');
  if (badge) {
    badge.textContent = count;
    badge.classList.toggle('d-none', count === 0);
  }

  _refreshCurrentSection();
}

function _clearFilters() {
  AppState.filterPeru = false;
  AppState.filterExacto = false;
  AppState.filterTop = 100;
  const peruEl = document.getElementById('filterPeru');
  const exactoEl = document.getElementById('filterExacto');
  const cutEl = document.getElementById('filterCut');
  if (peruEl) peruEl.checked = false;
  if (exactoEl) exactoEl.checked = false;
  if (cutEl) cutEl.value = '';
  document.querySelectorAll('.top-btn').forEach(b => b.classList.toggle('active', b.dataset.top === '100'));
  const badge = document.getElementById('filterBadge');
  if (badge) badge.classList.add('d-none');
  _refreshCurrentSection();
}

/* ─── EXPORT HANDLERS ────────────────────────────────── */
function _exportCSV() {
  if (!DataStore.isLoaded()) { Utils.toast('Carga un archivo primero', 'warning'); return; }
  const data = DataStore.getCutData(AppState.currentCutIdx).map(r => ({
    Ranking: r.ranking,
    Nombre: r.nombre,
    Puntaje: r.puntaje,
    'Marcador Exacto': r.exacto,
    Variación: r.delta !== null ? r.delta : '—',
    'Es Perú': r.isPeru ? 'Sí' : 'No',
    Corte: DataStore.getCutLabelByIdx(AppState.currentCutIdx),
  }));
  Utils.exportCSV(data, `ranking_mundial2026_corte${AppState.currentCutIdx + 1}.csv`);
}

function _exportExcelBtn() {
  if (!DataStore.isLoaded()) { Utils.toast('Carga un archivo primero', 'warning'); return; }
  const data = DataStore.getCutData(AppState.currentCutIdx).map(r => ({
    Ranking: r.ranking,
    Nombre: r.nombre,
    Puntaje: r.puntaje,
    'Marcador Exacto': r.exacto,
    Variación: r.delta !== null ? r.delta : '',
    'Es Perú': r.isPeru ? 'Sí' : 'No',
    Corte: DataStore.getCutLabelByIdx(AppState.currentCutIdx),
  }));
  Utils.exportExcel(data, `ranking_mundial2026_corte${AppState.currentCutIdx + 1}.xlsx`, 'Ranking');
}

/* ─── HELPERS ─────────────────────────────────────────── */
function _setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function _nameWithFlag(nombre) {
  if (!nombre) return '—';
  return (DataStore.isPeru(nombre) ? '🇵🇪 ' : '') + _escHtml(nombre);
}

function _escHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}

function _escAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
