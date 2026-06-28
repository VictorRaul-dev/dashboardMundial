/* ═══════════════════════════════════════════════════════
   utils.js — Funciones utilitarias reutilizables
═══════════════════════════════════════════════════════ */

'use strict';

const Utils = (() => {

  /* ─── FORMATEO ──────────────────────────────────────────── */

  function formatDate(value, format = 'short') {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return String(value);
    if (format === 'short')  return d.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'2-digit' });
    if (format === 'medium') return d.toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' });
    if (format === 'long')   return d.toLocaleDateString('es-PE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
    if (format === 'time')   return d.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
    if (format === 'datetime') return d.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'2-digit' }) + ' ' + d.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
    return d.toLocaleDateString('es-PE');
  }

  function formatNumber(n, decimals = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-PE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function formatPct(n, decimals = 1) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toFixed(decimals) + '%';
  }

  /* ─── ESTADÍSTICAS ────────────────────────────────────────── */

  function mean(arr) {
    if (!arr || !arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function median(arr) {
    if (!arr || !arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function stddev(arr) {
    if (!arr || arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length);
  }

  function percentile(arr, p) {
    if (!arr || !arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const idx = (p / 100) * (s.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
  }

  function minMax(arr) {
    if (!arr || !arr.length) return { min: 0, max: 0 };
    return { min: Math.min(...arr), max: Math.max(...arr) };
  }

  function histogram(arr, bins = 10) {
    if (!arr || !arr.length) return { labels: [], counts: [] };
    const { min, max } = minMax(arr);
    const range = max - min || 1;
    const step = range / bins;
    const labels = [], counts = [];
    for (let i = 0; i < bins; i++) {
      const lo = min + i * step;
      const hi = lo + step;
      labels.push(`${Math.round(lo)}–${Math.round(hi)}`);
      counts.push(arr.filter(v => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length);
    }
    return { labels, counts };
  }

  /* ─── INDICADORES DE VARIACIÓN ─────────────────────────────── */

  function varBadge(delta) {
    if (delta === null || delta === undefined) return '<span class="var-badge var-same">—</span>';
    if (delta > 0) return `<span class="var-badge var-up"><i class="fas fa-caret-up"></i>+${delta}</span>`;
    if (delta < 0) return `<span class="var-badge var-down"><i class="fas fa-caret-down"></i>${delta}</span>`;
    return '<span class="var-badge var-same"><i class="fas fa-minus"></i></span>';
  }

  function varClass(delta) {
    if (delta > 0) return 'var-up';
    if (delta < 0) return 'var-down';
    return 'var-same';
  }

  /* ─── COLORES ──────────────────────────────────────────────── */

  const PALETTE = [
    '#2979D9','#D4AF37','#E74C3C','#2ECC71','#9B59B6',
    '#F39C12','#1ABC9C','#E91E63','#00BCD4','#FF5722',
    '#607D8B','#795548','#4CAF50','#FF9800','#673AB7',
    '#03A9F4','#CDDC39','#8BC34A','#FFC107','#009688',
  ];

  function paletteColor(idx, alpha = 1) {
    const hex = PALETTE[idx % PALETTE.length];
    if (alpha === 1) return hex;
    return hexToRgba(hex, alpha);
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function heatColor(value, min, max, alpha = 0.8) {
    if (max === min) return `rgba(41,121,217,${alpha})`;
    const t = (value - min) / (max - min);
    const r = t < 0.5 ? Math.round(t * 2 * 238) : 238;
    const g = t < 0.5 ? 180 : Math.round(180 * (1 - (t - 0.5) * 2));
    const b = 40;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /* ─── DOM HELPERS ──────────────────────────────────────────── */

  function animateCounter(el, target, duration = 800) {
    if (!el) return;
    const start = parseFloat(el.textContent.replace(/[^0-9.-]/g, '')) || 0;
    const diff = target - start;
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = formatNumber(Math.round(start + diff * ease));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function toast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const icons = { info:'fa-circle-info', success:'fa-circle-check', warning:'fa-triangle-exclamation', danger:'fa-circle-xmark' };
    const colors = { info:'var(--c-info)', success:'var(--c-success)', warning:'var(--c-warning)', danger:'var(--c-danger)' };
    const id = `toast-${Date.now()}`;
    const el = document.createElement('div');
    el.id = id;
    el.className = 'toast toast-custom show';
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <div class="toast-body d-flex align-items-center gap-2 py-3 px-3">
        <i class="fas ${icons[type] || icons.info}" style="color:${colors[type] || colors.info};font-size:16px;flex-shrink:0"></i>
        <span style="font-size:13px">${message}</span>
        <button type="button" class="btn-close ms-auto" onclick="document.getElementById('${id}').remove()" style="font-size:10px"></button>
      </div>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  function skeletonRow(cols) {
    const cells = Array(cols).fill('<td><div class="skeleton-cell" style="height:14px;border-radius:4px;background:var(--c-gray-200);"></div></td>').join('');
    return `<tr>${cells}</tr>`;
  }

  /* ─── EXPORTACIÓN ──────────────────────────────────────────── */

  function exportCSV(data, filename = 'export.csv') {
    if (!data || !data.length) { toast('No hay datos para exportar', 'warning'); return; }
    const headers = Object.keys(data[0]);
    const rows = [headers.join(',')];
    data.forEach(row => {
      rows.push(headers.map(h => {
        const v = row[h] ?? '';
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
      }).join(','));
    });
    downloadText(rows.join('\n'), filename, 'text/csv');
    toast('CSV exportado correctamente', 'success');
  }

  function exportExcel(data, filename = 'export.xlsx', sheetName = 'Datos') {
    if (!data || !data.length) { toast('No hay datos para exportar', 'warning'); return; }
    try {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, filename);
      toast('Excel exportado correctamente', 'success');
    } catch (e) {
      console.error('Error exportando Excel:', e);
      toast('Error al exportar Excel', 'danger');
    }
  }

  async function exportPNG(selector, filename = 'dashboard.png') {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) { toast('Elemento no encontrado', 'warning'); return; }
    try {
      toast('Generando imagen…', 'info', 1500);
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#131F30' : '#F0F4F8' });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename;
      a.click();
      toast('PNG descargado', 'success');
    } catch (e) {
      console.error('Error exportando PNG:', e);
      toast('Error al exportar imagen', 'danger');
    }
  }

  async function exportPDF(title = 'CenGOL — Dashboard Mundial 2026') {
    try {
      toast('Generando PDF…', 'info', 2000);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const sections = document.querySelectorAll('.content-section.active .chart-card');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text(title, 148, 15, { align: 'center' });
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Generado el ${new Date().toLocaleDateString('es-PE')}`, 148, 22, { align: 'center' });
      let y = 30;
      const pw = pdf.internal.pageSize.getWidth() - 20;
      for (const el of sections) {
        if (y > 170) { pdf.addPage(); y = 15; }
        const canvas = await html2canvas(el, { scale: 1.5 });
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const ratio = canvas.width / canvas.height;
        const h = Math.min(pw / ratio, 90);
        pdf.addImage(imgData, 'JPEG', 10, y, pw, h);
        y += h + 8;
      }
      pdf.save('dashboard_mundial2026.pdf');
      toast('PDF descargado', 'success');
    } catch (e) {
      console.error('Error exportando PDF:', e);
      toast('Error al generar PDF', 'danger');
    }
  }

  function downloadText(text, filename, mimeType = 'text/plain') {
    const blob = new Blob(['﻿' + text], { type: mimeType + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ─── PERFORMANCE ──────────────────────────────────────────── */

  function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  function throttle(fn, limit) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= limit) { last = now; fn(...args); }
    };
  }

  /* ─── MISC ─────────────────────────────────────────────────── */

  function parseExcelDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return d;
    }
    const d = new Date(val);
    return isNaN(d) ? null : d;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  function truncate(str, n = 22) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  return {
    formatDate, formatNumber, formatPct,
    mean, median, stddev, percentile, minMax, histogram,
    varBadge, varClass,
    paletteColor, hexToRgba, heatColor,
    animateCounter, toast, skeletonRow,
    exportCSV, exportExcel, exportPNG, exportPDF,
    debounce, throttle,
    parseExcelDate, uid, truncate,
    PALETTE,
  };

})();
