/* ============================================
   LocalEMR — Main application logic
   ============================================ */

(() => {
  'use strict';

  // ---- DOM refs ----
  const $list         = document.getElementById('patient-list');
  const $empty        = document.getElementById('empty-state');
  const $fab          = document.getElementById('fab-add');
  const $overlay      = document.getElementById('modal-overlay');
  const $modal        = document.getElementById('patient-modal');
  const $modalTitle   = document.getElementById('modal-title');
  const $form         = document.getElementById('patient-form');
  const $id           = document.getElementById('patient-id');
  const $name         = document.getElementById('patient-name');
  const $room         = document.getElementById('patient-room');
  const $age          = document.getElementById('patient-age');
  const $status       = document.getElementById('patient-status-select');
  const $diagnoses    = document.getElementById('patient-diagnoses');
  const $medications  = document.getElementById('patient-medications');
  const $notes        = document.getElementById('patient-notes');
  const $btnCancel    = document.getElementById('btn-cancel');
  const $btnDelete    = document.getElementById('btn-delete');
  const $btnSave      = document.getElementById('btn-save');
  const $modalClose   = document.getElementById('modal-close');
  const $btnExport    = document.getElementById('btn-export');
  const $btnImport    = document.getElementById('btn-import');
  const $importFile   = document.getElementById('import-file');
  const $statTotal    = document.getElementById('stat-total');
  const $statSeen     = document.getElementById('stat-seen');
  const $statNotes    = document.getElementById('stat-notes');
  const $toast        = document.getElementById('toast');
  const $btnNewDay    = document.getElementById('btn-new-day');
  const $sortStatus   = document.getElementById('sort-status');
  const $sortRoom     = document.getElementById('sort-room');

  const filterTabs = document.querySelectorAll('.filter-tab');

  let patients = [];
  let activeFilter = 'all';
  let activeSort = 'status';

  // ---- Init ----
  async function init() {
    await loadPatients();
    bindEvents();
    registerSW();
  }

  async function loadPatients() {
    patients = await PatientDB.getAll();
    render();
  }

  // ---- Rendering ----
  function render() {
    const filtered = filterPatients(patients, activeFilter);

    // Stats
    const total = patients.length;
    const seen  = patients.filter(p => p.status === 'seen' || p.status === 'noteComplete').length;
    const notes = patients.filter(p => p.status === 'noteComplete').length;
    $statTotal.textContent = total;
    $statSeen.textContent  = seen;
    $statNotes.textContent = notes;

    // Clear cards (keep empty state element)
    $list.querySelectorAll('.patient-card').forEach(el => el.remove());

    if (filtered.length === 0) {
      $empty.classList.remove('hidden');
      if (patients.length > 0 && filtered.length === 0) {
        $empty.querySelector('p').textContent = 'No patients match this filter';
        $empty.querySelector('.empty-sub').textContent = 'Try selecting a different tab';
      } else {
        $empty.querySelector('p').textContent = 'No patients yet';
        $empty.querySelector('.empty-sub').textContent = 'Tap the + button to add your first patient';
      }
    } else {
      $empty.classList.add('hidden');
    }

    const sorted = [...filtered].sort((a, b) => {
      if (activeSort === 'room') {
        return (a.room || '').localeCompare(b.room || '', undefined, { numeric: true });
      }
      const order = { pending: 0, seen: 1, noteComplete: 2 };
      const diff = (order[a.status] ?? 0) - (order[b.status] ?? 0);
      if (diff !== 0) return diff;
      return (a.room || '').localeCompare(b.room || '', undefined, { numeric: true });
    });

    for (const p of sorted) {
      $list.appendChild(createCard(p));
    }
  }

  function filterPatients(list, filter) {
    switch (filter) {
      case 'pending':   return list.filter(p => p.status === 'pending');
      case 'seen':      return list.filter(p => p.status === 'seen' || p.status === 'noteComplete');
      case 'completed': return list.filter(p => p.status === 'noteComplete');
      default:          return list;
    }
  }

  function createCard(p) {
    const card = document.createElement('div');
    card.className = `patient-card status-${p.status}`;
    card.dataset.id = p.id;

    const statusBadge = p.status === 'noteComplete'
      ? '<span class="badge badge-complete">Note Done</span>'
      : p.status === 'seen'
        ? '<span class="badge badge-seen">Seen</span>'
        : '<span class="badge badge-pending">Pending</span>';

    const diagText = p.diagnoses ? escapeHtml(p.diagnoses) : '<em style="color:var(--gray-400)">No diagnoses listed</em>';

    card.innerHTML = `
      <div class="card-top">
        <div class="card-identity">
          <span class="card-name">${escapeHtml(p.name || 'Unnamed')}</span>
          <span class="card-meta">
            ${p.age ? `<span>Age ${escapeHtml(String(p.age))}</span>` : ''}
          </span>
        </div>
        ${p.room ? `<span class="card-room">${escapeHtml(p.room)}</span>` : ''}
      </div>
      <div class="card-diagnoses">${diagText}</div>
      <div class="card-bottom">
        ${statusBadge}
      </div>
      <div class="card-actions">
        <button class="card-action-btn ${p.status === 'seen' || p.status === 'noteComplete' ? 'active-seen' : ''}" data-action="toggleSeen" data-id="${p.id}">
          ${p.status === 'seen' || p.status === 'noteComplete' ? '&#10003; Seen' : '&#9675; Mark Seen'}
        </button>
        <button class="card-action-btn ${p.status === 'noteComplete' ? 'active-note' : ''}" data-action="toggleNote" data-id="${p.id}">
          ${p.status === 'noteComplete' ? '&#10003; Note Done' : '&#9675; Note Done'}
        </button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-action-btn')) return;
      openEdit(p.id);
    });

    return card;
  }

  // ---- Modal ----
  function openModal() {
    $overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $overlay.classList.remove('open');
    document.body.style.overflow = '';
    $form.reset();
    $id.value = '';
  }

  function openAdd() {
    $modalTitle.textContent = 'Add Patient';
    $btnDelete.classList.add('hidden');
    $btnSave.textContent = 'Save Patient';
    $form.reset();
    $id.value = '';
    $status.value = 'pending';
    openModal();
    setTimeout(() => $name.focus(), 300);
  }

  async function openEdit(id) {
    const p = await PatientDB.get(id);
    if (!p) return;

    $modalTitle.textContent = 'Edit Patient';
    $btnDelete.classList.remove('hidden');
    $btnSave.textContent = 'Update Patient';

    $id.value          = p.id;
    $name.value        = p.name || '';
    $room.value        = p.room || '';
    $age.value         = p.age || '';
    $status.value      = p.status || 'pending';
    $diagnoses.value   = p.diagnoses || '';
    $medications.value = p.medications || '';
    $notes.value       = p.notes || '';

    openModal();
  }

  // ---- Save / Delete ----
  async function savePatient() {
    const data = {
      name:        $name.value.trim(),
      room:        $room.value.trim(),
      age:         $age.value ? parseInt($age.value, 10) : null,
      status:      $status.value,
      diagnoses:   $diagnoses.value.trim(),
      medications: $medications.value.trim(),
      notes:       $notes.value.trim(),
    };

    if (!data.name) {
      $name.focus();
      toast('Please enter a patient name');
      return;
    }

    try {
      if ($id.value) {
        const existing = await PatientDB.get(parseInt($id.value, 10));
        await PatientDB.update({ ...existing, ...data });
        toast('Patient updated');
      } else {
        await PatientDB.add(data);
        toast('Patient added');
      }
      closeModal();
      await loadPatients();
    } catch (err) {
      toast('Error saving patient');
      console.error(err);
    }
  }

  async function deletePatient() {
    if (!$id.value) return;
    const id = parseInt($id.value, 10);

    showConfirm('Delete this patient? This cannot be undone.', async () => {
      try {
        await PatientDB.remove(id);
        closeModal();
        toast('Patient deleted');
        await loadPatients();
      } catch (err) {
        toast('Error deleting patient');
        console.error(err);
      }
    }, 'Delete');
  }

  // ---- Quick status toggles (on card) ----
  async function handleCardAction(action, id) {
    const p = await PatientDB.get(id);
    if (!p) return;

    if (action === 'toggleSeen') {
      if (p.status === 'pending') {
        p.status = 'seen';
      } else if (p.status === 'seen') {
        p.status = 'pending';
      }
      // don't demote noteComplete via the seen button
    } else if (action === 'toggleNote') {
      if (p.status === 'noteComplete') {
        p.status = 'seen';
      } else {
        p.status = 'noteComplete';
      }
    }

    await PatientDB.update(p);
    await loadPatients();
  }

  // ---- Export / Import ----
  async function exportData() {
    try {
      const json = await PatientDB.exportAll();
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `localemr-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Data exported');
    } catch (err) {
      toast('Export failed');
      console.error(err);
    }
  }

  async function importData(file) {
    try {
      const text  = await file.text();
      const count = await PatientDB.importAll(text);
      await loadPatients();
      toast(`Imported ${count} patient${count !== 1 ? 's' : ''}`);
    } catch (err) {
      toast('Import failed — invalid file');
      console.error(err);
    }
  }

  // ---- New Day Reset ----
  async function newDayReset() {
    if (patients.length === 0) {
      toast('No patients to reset');
      return;
    }
    showConfirm('Start a new day? This resets all patients to Pending while keeping their info.', async () => {
      try {
        let count = 0;
        for (const p of patients) {
          if (p.status !== 'pending') {
            p.status = 'pending';
            await PatientDB.update(p);
            count++;
          }
        }
        await loadPatients();
        toast(count > 0 ? `Reset ${count} patient${count !== 1 ? 's' : ''} to Pending` : 'All patients already pending');
      } catch (err) {
        toast('Error resetting statuses');
        console.error(err);
      }
    }, 'Start New Day');
  }

  // ---- Sort toggle ----
  function setSort(mode) {
    activeSort = mode;
    $sortStatus.classList.toggle('active', mode === 'status');
    $sortRoom.classList.toggle('active', mode === 'room');
    render();
  }

  // ---- Filter tabs ----
  function setFilter(filter) {
    activeFilter = filter;
    filterTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    render();
  }

  // ---- Confirm dialog ----
  function showConfirm(message, onConfirm, confirmLabel = 'Confirm') {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-box">
        <p>${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary" data-role="cancel">Cancel</button>
          <button class="btn btn-primary" data-role="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    overlay.querySelector('[data-role="cancel"]').addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-role="confirm"]').addEventListener('click', () => {
      overlay.remove();
      onConfirm();
    });

    document.body.appendChild(overlay);
  }

  // ---- Toast ----
  let toastTimer;
  function toast(msg) {
    clearTimeout(toastTimer);
    $toast.textContent = msg;
    $toast.classList.add('show');
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2200);
  }

  // ---- Helpers ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Service Worker ----
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // ---- Event binding ----
  function bindEvents() {
    $fab.addEventListener('click', openAdd);

    $form.addEventListener('submit', (e) => {
      e.preventDefault();
      savePatient();
    });

    $btnCancel.addEventListener('click', closeModal);
    $modalClose.addEventListener('click', closeModal);
    $btnDelete.addEventListener('click', deletePatient);

    $overlay.addEventListener('click', (e) => {
      if (e.target === $overlay) closeModal();
    });

    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => setFilter(tab.dataset.filter));
    });

    $btnNewDay.addEventListener('click', newDayReset);

    $sortStatus.addEventListener('click', () => setSort('status'));
    $sortRoom.addEventListener('click', () => setSort('room'));

    $btnExport.addEventListener('click', exportData);
    $btnImport.addEventListener('click', () => $importFile.click());
    $importFile.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        showConfirm('Importing will replace all current data. Continue?', () => {
          importData(e.target.files[0]);
          $importFile.value = '';
        }, 'Import');
      }
    });

    $list.addEventListener('click', (e) => {
      const btn = e.target.closest('.card-action-btn');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = parseInt(btn.dataset.id, 10);
      handleCardAction(action, id);
    });
  }

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', init);
})();
