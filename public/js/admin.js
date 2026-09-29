const CIRCUIT_NAMES = [
  'Grand Hairpin', 'Figure Eight', 'Omega Hairpin',
  'Suzuka S-Complex', 'Twin Helix', 'The Colosseum'
];

let adminPassword = sessionStorage.getItem('rallyAdminPassword') || '';
let adminData = null;

const loginPanel = document.getElementById('loginPanel');
const adminPanel = document.getElementById('adminPanel');
const loginError = document.getElementById('loginError');
const dataStatus = document.getElementById('dataStatus');

function authHeaders(json = false) {
  const headers = { Authorization: `Basic ${btoa(`admin:${adminPassword}`)}` };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function adminRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...authHeaders(options.body !== undefined), ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('Incorrect password');
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

async function unlock() {
  try {
    adminData = await adminRequest('/api/admin/data');
    sessionStorage.setItem('rallyAdminPassword', adminPassword);
    loginPanel.hidden = true;
    adminPanel.hidden = false;
    loginError.textContent = '';
    render();
  } catch (error) {
    loginError.textContent = error.message;
    sessionStorage.removeItem('rallyAdminPassword');
  }
}

function render() {
  renderCircuits();
  renderLeaderboards();
}

function renderCircuits() {
  const container = document.getElementById('circuitOptions');
  container.replaceChildren();
  CIRCUIT_NAMES.forEach((name, trackIndex) => {
    const button = document.createElement('button');
    button.textContent = `${trackIndex + 1}. ${name}`;
    button.classList.toggle('active', trackIndex === adminData.trackIndex);
    button.addEventListener('click', async () => {
      const status = document.getElementById('circuitStatus');
      try {
        await adminRequest('/api/admin/config', {
          method: 'PUT', body: JSON.stringify({ trackIndex })
        });
        adminData.trackIndex = trackIndex;
        renderCircuits();
        status.textContent = `${name} is now active.`;
      } catch (error) { status.textContent = error.message; }
    });
    container.appendChild(button);
  });
}

function input(value, type = 'text') {
  const field = document.createElement('input');
  field.type = type;
  field.value = value ?? '';
  return field;
}

function renderLeaderboards() {
  const container = document.getElementById('leaderboards');
  container.replaceChildren();
  CIRCUIT_NAMES.forEach((name, trackIndex) => {
    const rows = adminData.leaderboards[String(trackIndex)] || [];
    const board = document.createElement('section');
    board.className = 'board';
    const title = document.createElement('h3');
    title.textContent = `${trackIndex + 1}. ${name} — ${rows.length} row${rows.length === 1 ? '' : 's'}`;
    board.appendChild(title);
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No records';
      board.appendChild(empty);
      container.appendChild(board);
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Pos</th><th>Driver</th><th>Time (seconds)</th><th>Gap</th><th>Date</th><th>Actions</th></tr></thead>';
    const body = document.createElement('tbody');
    rows.forEach((row, position) => {
      const tr = document.createElement('tr');
      const positionCell = document.createElement('td');
      positionCell.textContent = String(position + 1);
      const nameField = input(row.name);
      nameField.maxLength = 16;
      const timeField = input(row.time, 'number');
      timeField.min = '0';
      timeField.step = '0.001';
      const gapField = input(row.gap);
      const dateField = input(row.date);
      tr.appendChild(positionCell);
      [nameField, timeField, gapField, dateField].forEach(field => {
        const td = document.createElement('td');
        td.appendChild(field);
        tr.appendChild(td);
      });
      const actions = document.createElement('td');
      actions.className = 'actions';
      const save = document.createElement('button');
      save.textContent = 'Save';
      save.addEventListener('click', async () => {
        try {
          const result = await adminRequest(`/api/admin/entries/${trackIndex}/${position}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: nameField.value, time: Number(timeField.value),
              gap: gapField.value, date: dateField.value
            })
          });
          adminData.leaderboards[String(trackIndex)] = result.leaderboard;
          dataStatus.textContent = 'Row saved.';
          renderLeaderboards();
        } catch (error) { dataStatus.textContent = error.message; }
      });
      const remove = document.createElement('button');
      remove.textContent = 'Remove';
      remove.className = 'danger';
      remove.addEventListener('click', async () => {
        if (!confirm(`Remove ${row.name} from ${name}?`)) return;
        try {
          const result = await adminRequest(`/api/admin/entries/${trackIndex}/${position}`, { method: 'DELETE' });
          adminData.leaderboards[String(trackIndex)] = result.leaderboard;
          dataStatus.textContent = 'Row removed.';
          renderLeaderboards();
        } catch (error) { dataStatus.textContent = error.message; }
      });
      actions.append(save, remove);
      tr.appendChild(actions);
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    board.appendChild(wrap);
    container.appendChild(board);
  });
}

document.getElementById('loginForm').addEventListener('submit', event => {
  event.preventDefault();
  adminPassword = document.getElementById('password').value;
  unlock();
});

document.getElementById('logoutButton').addEventListener('click', () => {
  adminPassword = '';
  sessionStorage.removeItem('rallyAdminPassword');
  adminPanel.hidden = true;
  loginPanel.hidden = false;
  document.getElementById('password').value = '';
  document.getElementById('password').focus();
});

document.getElementById('resetButton').addEventListener('click', async () => {
  if (!confirm('Reset the entire leaderboard database? This removes every row on all six circuits.')) return;
  try {
    await adminRequest('/api/admin/leaderboard', { method: 'DELETE' });
    adminData.leaderboards = {};
    dataStatus.textContent = 'All leaderboard rows were removed.';
    renderLeaderboards();
  } catch (error) { dataStatus.textContent = error.message; }
});

if (adminPassword) unlock();
