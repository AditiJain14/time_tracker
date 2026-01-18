// Habit Garden — extended with plant animations
// Data model unchanged.

const STORAGE_KEY = 'habit-tracker-data';

let state = { habits: [] };
let selectedHabitId = null;
let weeksChart = null;
let filters = { from: null, to: null, minHours: 0 };

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { state = JSON.parse(raw); } catch(e){ console.error('Corrupt storage, resetting', e); state = { habits: [] }; }
  } else state = { habits: [] };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() { return Math.random().toString(36).slice(2,9); }

function createHabit(name, goalHours) {
  const h = { id: uid(), name, goalHours: Number(goalHours) || 0, sessions: [], activeStart: null };
  state.habits.push(h);
  save();
  renderAll();
  return h;
}

function removeHabit(id) {
  if (!confirm('Delete this habit and all its sessions?')) return;
  state.habits = state.habits.filter(h => h.id !== id);
  if (selectedHabitId === id) selectedHabitId = null;
  save();
  renderAll();
}

function startHabit(id) {
  const h = state.habits.find(x => x.id === id);
  if (!h || h.activeStart) return;
  h.activeStart = Date.now();
  save();
  renderDetail(h);
  renderList();
  updatePlantAnimation(); // start visual growth
}

function stopHabit(id) {
  const h = state.habits.find(x => x.id === id);
  if (!h || !h.activeStart) return;
  const start = h.activeStart;
  const end = Date.now();
  const durationHours = (end - start) / (1000 * 60 * 60);
  h.sessions.push({ start, end, durationHours });
  h.activeStart = null;
  save();
  renderDetail(h);
  renderList();
  updatePlantAnimation(); // stop growth
}

function manualAddSession(id, startStr, endStr) {
  const h = state.habits.find(x => x.id === id);
  if (!h) return;
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  if (!start || !end || end <= start) return;
  const durationHours = (end - start) / (1000 * 60 * 60);
  h.sessions.push({ start, end, durationHours });
  save();
  renderDetail(h);
  renderList();
  updatePlantAnimation();
}

function clearAll() {
  if (!confirm('Clear all habit data? This cannot be undone.')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = { habits: [] };
  selectedHabitId = null;
  renderAll();
  updatePlantAnimation();
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'habit-garden-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importJSONFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.habits)) throw new Error('Invalid format');
      if (!confirm('Importing will replace current local data. Continue?')) return;
      state = data;
      save();
      selectedHabitId = null;
      renderAll();
      updatePlantAnimation();
    } catch (err) {
      alert('Failed to import: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// Time helpers
function getWeekRangeForDate(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const offset = (day + 6) % 7;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
  start.setHours(0,0,0,0);
  const end = new Date(start.getTime() + 7*24*60*60*1000 - 1);
  return { start: start.getTime(), end: end.getTime() };
}

function sessionsInRange(sessions, rangeStart, rangeEnd) {
  return sessions.filter(s => s.start <= rangeEnd && s.end >= rangeStart)
    .map(s => {
      const st = Math.max(s.start, rangeStart);
      const ed = Math.min(s.end, rangeEnd);
      return (ed - st) / (1000*60*60);
    }).reduce((a,b)=>a+b, 0);
}

function hoursThisWeek(habit) {
  const { start, end } = getWeekRangeForDate();
  return sessionsInRange(habit.sessions, start, end);
}

function todaysSessions(habit) {
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(todayStart.getTime() + 24*60*60*1000 - 1);
  const list = habit.sessions.filter(s => s.start >= todayStart.getTime() && s.start <= todayEnd.getTime());
  if (habit.activeStart) list.push({ start: habit.activeStart, end: Date.now(), durationHours: (Date.now()-habit.activeStart)/(1000*60*60) });
  return list;
}

// --- Rendering and UI updates
function renderList() {
  const listEl = document.getElementById('habitList');
  listEl.innerHTML = '';
  state.habits.forEach(h => {
    const el = document.createElement('div');
    el.className = 'habit-item' + (selectedHabitId === h.id ? ' active' : '');
    el.onclick = () => { selectedHabitId = h.id; renderAll(); updatePlantAnimation(); };
    const left = document.createElement('div');
    left.innerHTML = `<strong>${escapeHtml(h.name)}</strong><div class="small">Goal: ${h.goalHours} h/week</div>`;
    const right = document.createElement('div');
    const w = hoursThisWeek(h);
    const rounded = Math.round(w*100)/100;
    right.innerHTML = `<div class="meta">${rounded} h this week</div>`;
    el.appendChild(left);
    el.appendChild(right);
    listEl.appendChild(el);
  });
  populateStatsSelect();
}

function renderDetail(habit) {
  const el = document.getElementById('habitDetail');
  if (!habit) {
    el.innerHTML = '<p class="hint">Select a habit on the left to view and control it.</p>';
    return;
  }
  const totalWeek = Math.round(hoursThisWeek(habit) * 100) / 100;
  const goal = habit.goalHours || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((totalWeek / goal) * 100)) : 0;
  const active = habit.activeStart;

  // include a small habit plant that will animate when active
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <h2>${escapeHtml(habit.name)}</h2>
        <div class="meta">Weekly goal: <strong>${goal} h</strong> · This week: <strong>${totalWeek} h</strong></div>
      </div>

      <div style="text-align:right">
        <button id="startStopBtn" class="${active ? 'stop-btn pulse' : 'start-btn'}">${active ? 'Stop' : 'Start'}</button>
        <div style="margin-top:8px"><button id="deleteHabitBtn" style="background:#fff;border:1px solid rgba(7,32,20,0.04);padding:8px;border-radius:10px;cursor:pointer">Delete</button></div>
      </div>
    </div>

    <div style="margin-top:10px; display:flex; gap:16px; align-items:flex-start;">
      <div style="flex:1;">
        <label>Weekly progress</label>
        <div class="progress"><span style="width:${pct}%;"></span></div>
      </div>

      <div style="width:110px; display:flex; align-items:center; justify-content:center;">
        <svg id="habitPlant" class="plant plant-idle" viewBox="0 0 120 120" width="92" height="92" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="habit plant">
          <g transform="translate(10,8)">
            <rect x="34" y="70" width="52" height="18" rx="4" fill="#7C4D2E"/>
            <ellipse cx="60" cy="64" rx="30" ry="6" fill="#4B2F23" opacity="0.95"/>
            <g id="habitLeaves" transform="translate(60,64)">
              <path class="leaf" d="M0,0 C-14,-8 -26,-22 -8,-28 C-3,-20 -4,-9 0,0" fill="#10B981"/>
              <path class="leaf" d="M0,0 C14,-8 26,-22 8,-28 C3,-20 4,-9 0,0" fill="#059669"/>
              <path class="sprout" d="M0,0 C2,-16 12,-24 16,-34" stroke="#0b7a56" stroke-width="3" fill="none" stroke-linecap="round"/>
              <g class="flower" transform="translate(16,-34)">
                <circle class="flower-center" r="2.5" fill="#FFD166" />
                <path class="petal" d="M0,-5 C2,-5 4,-2 2,0 C1,2 -1,2 -3,0 C-5,-2 -3,-5 0,-5" fill="#FF6B6B"/>
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>

    <div class="sessions">
      <h3>Today's sessions</h3>
      <div id="todaySessionsList"></div>
    </div>

    <div style="margin-top:12px">
      <h3>All sessions (most recent first)</h3>
      <div id="allSessionsList"></div>
    </div>
  `;

  document.getElementById('startStopBtn').onclick = () => {
    if (habit.activeStart) stopHabit(habit.id);
    else startHabit(habit.id);
  };
  document.getElementById('deleteHabitBtn').onclick = () => removeHabit(habit.id);

  // Today's sessions
  const todayList = document.getElementById('todaySessionsList');
  const tSessions = todaysSessions(habit);
  if (tSessions.length === 0 && !habit.activeStart) {
    todayList.innerHTML = `<div class="meta">No sessions today. Click Start to begin timing.</div>`;
  } else {
    todayList.innerHTML = '';
    tSessions.forEach(s => {
      const div = document.createElement('div');
      div.className = 'session-item';
      const start = new Date(s.start).toLocaleTimeString();
      const end = s.end ? new Date(s.end).toLocaleTimeString() : '—';
      div.innerHTML = `<div>${start} → ${end}</div><div>${(Math.round(s.durationHours*100)/100)} h</div>`;
      todayList.appendChild(div);
    });
    if (habit.activeStart) {
      const div = document.createElement('div');
      div.className = 'session-item';
      const start = new Date(habit.activeStart).toLocaleTimeString();
      div.innerHTML = `<div>Running since ${start}</div><div style="color:var(--leaf2)">Active</div>`;
      todayList.appendChild(div);
    }
  }

  // All sessions
  const allEl = document.getElementById('allSessionsList');
  const sessions = (habit.sessions || []).slice().sort((a,b)=>b.start - a.start);
  if (sessions.length === 0) {
    allEl.innerHTML = `<div class="meta">No recorded sessions yet</div>`;
  } else {
    allEl.innerHTML = '';
    sessions.forEach(s => {
      const div = document.createElement('div');
      div.className = 'session-item';
      const start = new Date(s.start).toLocaleString();
      const end = new Date(s.end).toLocaleString();
      div.innerHTML = `<div>${start} → ${end}</div><div>${(Math.round(s.durationHours*100)/100)} h</div>`;
      allEl.appendChild(div);
    });
  }

  // update the plant animation state for this habit immediately
  updatePlantAnimation();
}

// Stats chart (weekly)
function renderStatsChart(habitId=null, weeks = 6) {
  const ctx = document.getElementById('weeksChart').getContext('2d');
  if (!habitId || !state.habits.find(h=>h.id===habitId)) {
    if (weeksChart) { weeksChart.destroy(); weeksChart = null; }
    ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
    return;
  }
  const habit = state.habits.find(h=>h.id===habitId);
  const labels = [];
  const data = [];
  const now = new Date();
  let curMonday = new Date(getWeekRangeForDate(now).start);
  for (let i = weeks-1; i >= 0; i--) {
    const start = new Date(curMonday.getTime() - i*7*24*60*60*1000);
    const end = new Date(start.getTime() + 7*24*60*60*1000 - 1);
    labels.push(formatWeekLabel(start));
    const sum = sessionsInRange(habit.sessions, start.getTime(), end.getTime());
    data.push(Math.round(sum*100)/100);
  }

  if (weeksChart) weeksChart.destroy();
  weeksChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `${habit.name} (hours / week)`,
        data,
        backgroundColor: 'rgba(6,95,70,0.9)',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero:true } },
      plugins: { legend: { display: false } }
    }
  });
}

// --- Heatmap (unchanged)
function renderHeatmap(habitId, weeks = 12) {
  const container = document.getElementById('heatmap');
  container.innerHTML = '';
  const habit = state.habits.find(h=>h.id===habitId);
  if (!habit) return;

  const today = new Date();
  const lastMonday = new Date(getWeekRangeForDate(today).start);
  const totalDays = weeks * 7;
  const startDay = new Date(lastMonday.getTime() - (weeks-1)*7*24*60*60*1000);
  startDay.setHours(0,0,0,0);

  const dailyTotals = [];
  for (let i=0;i<totalDays;i++){
    const dStart = new Date(startDay.getTime() + i*24*60*60*1000).getTime();
    const dEnd = dStart + 24*60*60*1000 -1;
    const hours = sessionsInRange(habit.sessions, dStart, dEnd);
    dailyTotals.push({ date: new Date(dStart), hours: Math.round(hours*100)/100 });
  }

  const values = dailyTotals.map(d=>d.hours).sort((a,b)=>a-b);
  const q = (p) => {
    if (values.length===0) return 0;
    const idx = Math.floor(p*(values.length-1));
    return values[idx];
  };
  const thresholds = [q(0.2), q(0.4), q(0.6), q(0.8)];

  for (let w = 0; w < weeks; w++) {
    const row = document.createElement('div');
    row.className = 'heatmap-row';
    for (let d = 0; d < 7; d++) {
      const idx = w*7 + d;
      const cellData = dailyTotals[idx];
      const cell = document.createElement('div');
      cell.className = 'heat-cell';
      const h = cellData.hours;
      let cls = 'c0';
      if (h > thresholds[3]) cls = 'c4';
      else if (h > thresholds[2]) cls = 'c3';
      else if (h > thresholds[1]) cls = 'c2';
      else if (h > thresholds[0]) cls = 'c1';
      cell.classList.add(cls);
      cell.title = `${cellData.date.toDateString()}: ${h} h`;
      cell.addEventListener('mouseenter', ()=> { cell.textContent = `${h>0?h:''}`; });
      cell.addEventListener('mouseleave', ()=> { cell.textContent = ''; });
      row.appendChild(cell);
    }
    container.appendChild(row);
  }
}

// --- Sessions list with filters
function applyFiltersToSessions(sessions) {
  const from = filters.from ? new Date(filters.from).setHours(0,0,0,0) : null;
  const to = filters.to ? new Date(filters.to).setHours(23,59,59,999) : null;
  const minH = filters.minHours ? Number(filters.minHours) : 0;
  return sessions.filter(s => {
    const okDate = (!from || s.start >= from) && (!to || s.start <= to);
    const okMin = (!minH || s.durationHours >= minH);
    return okDate && okMin;
  });
}

function renderSessionsList(habitId) {
  const box = document.getElementById('sessionsList');
  box.innerHTML = '';
  const habit = state.habits.find(h=>h.id===habitId);
  if (!habit) { box.innerHTML = '<div class="meta">Select a habit to view sessions</div>'; return; }

  const sessions = (habit.sessions || []).slice().sort((a,b)=>b.start - a.start);
  const filtered = applyFiltersToSessions(sessions);
  if (filtered.length===0) {
    box.innerHTML = `<div class="meta">No sessions match the filters.</div>`;
    return;
  }
  filtered.forEach(s => {
    const div = document.createElement('div');
    div.className = 'session-item';
    const start = new Date(s.start).toLocaleString();
    const end = new Date(s.end).toLocaleString();
    div.innerHTML = `<div>${start} → ${end}</div><div>${(Math.round(s.durationHours*100)/100)} h</div>`;
    box.appendChild(div);
  });
}

// --- Helpers
function formatWeekLabel(date) {
  const d = new Date(date);
  const end = new Date(d.getTime() + 6*24*60*60*1000);
  const s = `${d.getMonth()+1}/${d.getDate()}`;
  const e = `${end.getMonth()+1}/${end.getDate()}`;
  return `${s}–${e}`;
}

function populateStatsSelect() {
  const sel = document.getElementById('statsHabitSelect');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  state.habits.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h.id;
    opt.textContent = h.name;
    sel.appendChild(opt);
  });
  if (state.habits.find(h=>h.id===cur)) sel.value = cur;
  else if (state.habits[0]) sel.value = state.habits[0].id;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}

// --- Plant animation controller
function updatePlantAnimation() {
  // header/global plant
  const globalPlant = document.getElementById('globalPlant');
  // habit plant (if present)
  const habitPlant = document.getElementById('habitPlant');

  // determine if selected habit is active
  const activeHabit = state.habits.find(h => h.id === selectedHabitId && h.activeStart);
  if (activeHabit) {
    // growing + watering state
    if (globalPlant) {
      globalPlant.classList.remove('plant-idle');
      globalPlant.classList.add('plant-growing', 'plant-watering');
    }
    if (habitPlant) {
      habitPlant.classList.remove('plant-idle');
      habitPlant.classList.add('plant-growing', 'plant-watering');
      // add a tiny waterdrop indicator next to start button for fun
      const startBtn = document.getElementById('startStopBtn');
      if (startBtn && !startBtn.querySelector('.waterdrop')) {
        const d = document.createElement('span');
        d.className = 'waterdrop';
        startBtn.appendChild(d);
      }
    }
  } else {
    // idle / resting plant
    if (globalPlant) {
      globalPlant.classList.remove('plant-growing', 'plant-watering');
      globalPlant.classList.add('plant-idle');
    }
    if (habitPlant) {
      habitPlant.classList.remove('plant-growing', 'plant-watering');
      habitPlant.classList.add('plant-idle');
      // remove waterdrop if present
      const startBtn = document.getElementById('startStopBtn');
      if (startBtn) {
        const d = startBtn.querySelector('.waterdrop');
        if (d) d.remove();
      }
    }
  }
}

// --- UI wiring
document.addEventListener('DOMContentLoaded', () => {
  load();

  const form = document.getElementById('newHabitForm');
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('habitName').value.trim();
    const goal = document.getElementById('habitGoal').value;
    if (!name) return alert('Name required');
    createHabit(name, goal || 0);
    form.reset();
  };

  document.getElementById('exportBtn').onclick = exportJSON;
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = (e) => {
    const file = e.target.files[0];
    if (file) importJSONFile(file);
    e.target.value = '';
  };

  document.getElementById('clearBtn').onclick = clearAll;

  // Filters
  document.getElementById('applyFilters').onclick = () => {
    filters.from = document.getElementById('filterFrom').value || null;
    filters.to = document.getElementById('filterTo').value || null;
    filters.minHours = document.getElementById('filterMin').value || 0;
    renderSessionsList(selectedHabitId);
  };
  document.getElementById('clearFilters').onclick = () => {
    filters = { from: null, to: null, minHours: 0 };
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    document.getElementById('filterMin').value = '';
    renderSessionsList(selectedHabitId);
  };

  // Stats controls
  document.getElementById('statsHabitSelect').onchange = () => {
    const weeks = Number(document.getElementById('weeksRange').value);
    renderStatsChart(document.getElementById('statsHabitSelect').value, weeks);
    renderHeatmap(document.getElementById('statsHabitSelect').value, Number(document.getElementById('heatmapWeeks').value));
    renderSessionsList(selectedHabitId);
  };
  document.getElementById('weeksRange').onchange = () => {
    const weeks = Number(document.getElementById('weeksRange').value);
    renderStatsChart(document.getElementById('statsHabitSelect').value, weeks);
  };

  // Heatmap weeks slider
  const heatSlider = document.getElementById('heatmapWeeks');
  const heatVal = document.getElementById('heatmapWeeksVal');
  heatVal.textContent = heatSlider.value;
  heatSlider.oninput = (e) => {
    heatVal.textContent = e.target.value;
    renderHeatmap(document.getElementById('statsHabitSelect').value, Number(e.target.value));
  };

  // Keep UI updated for active session
  setInterval(() => {
    const h = state.habits.find(h=>h.id===selectedHabitId) || null;
    if (h && h.activeStart) renderDetail(h);
    updatePlantAnimation();
  }, 2500);

  if (!selectedHabitId && state.habits[0]) selectedHabitId = state.habits[0].id;

  renderAll();
  updatePlantAnimation();
});

function renderAll() {
  renderList();
  const sel = state.habits.find(h => h.id === selectedHabitId) || (state.habits[0] || null);
  if (!selectedHabitId && sel) selectedHabitId = sel.id;
  renderDetail(sel);
  populateStatsSelect();
  const statsSel = document.getElementById('statsHabitSelect');
  const chosen = statsSel ? statsSel.value || (state.habits[0] && state.habits[0].id) : (state.habits[0] && state.habits[0].id);
  const w = Number(document.getElementById('weeksRange') ? document.getElementById('weeksRange').value : 6);
  renderStatsChart(chosen, w);
  renderHeatmap(chosen, Number(document.getElementById('heatmapWeeks') ? document.getElementById('heatmapWeeks').value : 12));
  renderSessionsList(selectedHabitId);
  updatePlantAnimation();
}