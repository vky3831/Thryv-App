// ui.js - DOM rendering and events
let currentProfile = null;

function showNoProfiles(){
  const html = `
  <div class="card p-4">
    <h4>Welcome to FinTrack</h4>
    <p>Create your first profile to start tracking EMIs, LIC, Subscriptions and more.</p>
    <form id="createProfileForm" class="row g-2">
      <div class="col-12 col-md-6">
        <input id="newProfileName" class="form-control" placeholder="Your name" required>
      </div>
      <div class="col-12 col-md-6">
        <input id="newProfilePass" type="password" class="form-control" placeholder="Passkey (min 4)" required minlength="4">
      </div>
      <div class="col-12">
        <button class="btn btn-primary">Create Profile</button>
      </div>
    </form>
    <hr>
    <div class="small text-muted">You can export or import data using the options below.</div>
    <div class="mt-3">
      <button class="btn btn-sm btn-outline-secondary" id="exportAllBtn">Export All</button>
      <input type="file" id="importFileInput" style="display:none" accept=".json">
      <button class="btn btn-sm btn-outline-success" id="importBtn">Import</button>
    </div>
  </div>`;
  document.getElementById('mainArea').innerHTML = html;
  document.getElementById('createProfileForm').onsubmit = async (e)=>{
    e.preventDefault();
    const name = document.getElementById('newProfileName').value.trim();
    const pass = document.getElementById('newProfilePass').value;
    const p = await createProfile(name, pass);
    await refreshProfilesList();
    openProfileModal(p.id);
  };
  document.getElementById('exportAllBtn').onclick = ()=> exportData(false);
  document.getElementById('importBtn').onclick = ()=> document.getElementById('importFileInput').click();
  document.getElementById('importFileInput').onchange = async (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    try{
      await importFromFile(f, confirm('Merge imported data with existing? Press Cancel to replace current data.'));
      alert('Import successful');
      await refreshProfilesList();
    }catch(err){ alert('Import failed: '+err); }
  };
}

async function showProfilesList(profiles){
  let rows = profiles.map(p=>`
    <div class="col-12 col-md-6">
      <div class="card mb-3 p-3">
        <div class="d-flex justify-content-between">
          <div>
            <h5>${escapeHtml(p.name)}</h5>
            <div class="small-muted">Created: ${new Date(p.createdAt).toLocaleString()}</div>
          </div>
          <div class="text-end">
            <button class="btn btn-sm btn-primary me-1" data-profileid="${p.id}" data-action="open">Open</button>
            <button class="btn btn-sm btn-outline-secondary me-1" data-profileid="${p.id}" data-action="edit">Edit</button>
            <button class="btn btn-sm btn-danger" data-profileid="${p.id}" data-action="delete">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
  const html = `<div class="row">${rows}</div>
  <div class="mt-3">
    <button class="btn btn-outline-secondary btn-sm" id="exportAllBtn">Export All</button>
    <input type="file" id="importFileInput" style="display:none" accept=".json">
    <button class="btn btn-outline-success btn-sm" id="importBtn">Import</button>
  </div>`;
  document.getElementById('mainArea').innerHTML = html;
  // bind buttons
  document.querySelectorAll('[data-action]').forEach(btn=>{
    btn.onclick = (e)=>{
      const id = Number(btn.getAttribute('data-profileid'));
      const act = btn.getAttribute('data-action');
      if(act==='open') openProfileNoAuth(id);
      else if(act==='edit') editProfileName(id);
      else if(act==='delete') deleteProfileConfirm(id);
    };
  });
  document.getElementById('exportAllBtn').onclick = ()=> exportData(false);
  document.getElementById('importBtn').onclick = ()=> document.getElementById('importFileInput').click();
  document.getElementById('importFileInput').onchange = async (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    try{
      await importFromFile(f, confirm('Merge imported data with existing? Press Cancel to replace current data.'));
      alert('Import successful');
      await refreshProfilesList();
    }catch(err){ alert('Import failed: '+err); }
  };
}

function openProfileNoAuth(profileId){
  // show modal to ask for passkey
  
  enterProfile(profileId);
  loginModal.show();
}

function openProfileModal(profileId){
  // show modal to ask for passkey
  const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
  const loginForm = document.getElementById('loginForm');
  document.getElementById('passkeyInput').value = '';
  document.getElementById('loginError').style.display = 'none';
  loginForm.onsubmit = async (e)=>{
    e.preventDefault();
    const pass = document.getElementById('passkeyInput').value;
    const ok = await verifyProfile(profileId, pass);
    if(ok){
      currentProfile = profileId;
      loginModal.hide();
      await enterProfile(profileId);
    } else {
      document.getElementById('loginError').innerText = 'Incorrect passkey';
      document.getElementById('loginError').style.display = 'block';
    }
  };
  loginModal.show();
}

async function enterProfile(profileId){
  const p = await getByKey('profiles', profileId);
  if(!p) return;
  currentProfile = profileId;
  document.getElementById('currentProfileName').innerText = p.name;
  document.getElementById('logoutBtn').style.display = 'inline-block';
  renderDashboard();
  // bind logout
  document.getElementById('logoutBtn').onclick = ()=> { currentProfile = null; document.getElementById('currentProfileName').innerText=''; document.getElementById('logoutBtn').style.display='none'; refreshProfilesList(); };
}

async function editProfileName(profileId){
  const p = await getByKey('profiles', profileId);
  const newName = prompt('New profile name', p.name);
  if(newName && newName.trim()){
    await updateProfileName(profileId, newName.trim());
    await refreshProfilesList();
  }
}

async function deleteProfileConfirm(profileId){
  if(!confirm('Delete profile and all its data? This cannot be undone.')) return;
  // delete profile and related payments/history
  await remove('profiles', profileId);
  const allPayments = await getAll('payments');
  for(const pay of allPayments.filter(x=>x.profileId===profileId)) await remove('payments', pay.id);
  const allHistory = await getAll('history');
  for(const h of allHistory.filter(x=>x.profileId===profileId)) await remove('history', h.id);
  if(currentProfile===profileId){ currentProfile=null; document.getElementById('currentProfileName').innerText=''; document.getElementById('logoutBtn').style.display='none'; }
  await refreshProfilesList();
}

async function renderDashboard(){
  if(!currentProfile) return;
  const html = `
  <div class="card p-3">
    <ul class="nav nav-tabs" id="dashTabs" role="tablist">
      <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tabAll">All Payments</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabDue">Due This Month</button></li>
      <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tabHistory">History</button></li>
    </ul>
    <div class="tab-content mt-3">
      <div class="tab-pane fade show active" id="tabAll">
        <div class="d-flex justify-content-between mb-2">
          <h5>All Periodic Payments</h5>
          <div>
            <button class="btn btn-sm btn-primary" id="addPaymentBtn">Add Payment</button>
            <button class="btn btn-sm btn-outline-secondary" id="exportProfileBtn">Export Profile</button>
          </div>
        </div>
        <div id="allPaymentsList" class="all-payments"></div>
      </div>
      <div class="tab-pane fade" id="tabDue">
        <div class="d-flex justify-content-between mb-2">
          <h5>Due This Month</h5>
        </div>
        <div id="duePaymentsList"></div>
      </div>
      <div class="tab-pane fade" id="tabHistory">
        <h5>Payment History</h5>
        <div id="historyList"></div>
      </div>
    </div>
  </div>`;
  document.getElementById('mainArea').innerHTML = html;
  document.getElementById('addPaymentBtn').onclick = ()=> openPaymentModal();
  document.getElementById('exportProfileBtn').onclick = ()=> exportData(false, currentProfile);
  await refreshDashboardLists();
}

async function refreshDashboardLists(){
  if(!currentProfile) return;
  // all payments
  const all = await listPaymentsByProfile(currentProfile);
  const rows = all.map(p=>`
    <div class="card mb-2 p-2">
      <div class="d-flex justify-content-between">
        <div>
          <strong>${escapeHtml(p.title)}</strong>
          <div class="small-muted">${escapeHtml(p.type)} • ${escapeHtml(p.cycle)} • ${escapeHtml(p.dateText||'')}</div>
          <div class="small">${escapeHtml(p.notes||'')}</div>
        </div>
        <div class="text-end">
          <button class="btn btn-sm btn-success me-1" data-payid="${p.id}" data-action="markPaid">Mark Paid</button>
          <button class="btn btn-sm btn-outline-secondary me-1" data-payid="${p.id}" data-action="edit">Edit</button>
          <button class="btn btn-sm btn-danger" data-payid="${p.id}" data-action="delete">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
  document.getElementById('allPaymentsList').innerHTML = rows || '<div class="text-muted">No payments. Add one.</div>';
  document.querySelectorAll('[data-action]').forEach(btn=>{
    const a = btn.getAttribute('data-action');
    btn.onclick = async ()=>{
      const id = Number(btn.getAttribute(a==='markPaid' ? 'data-payid' : 'data-payid'));
      if(a==='markPaid') openPaidModal(id);
      else if(a==='edit') openPaymentModal(id);
      else if(a==='delete'){
        if(confirm('Delete this payment?')){ await deletePayment(id); await refreshDashboardLists(); }
      }
    };
  });

  // due this month
  const now = new Date();
  const due = await paymentsForMonth(currentProfile, now.getMonth(), now.getFullYear());

  let dueRows = '';
  for (const p of due) {
    const paid = await isPaymentPaidForMonth(p.id, now.getMonth(), now.getFullYear());
    dueRows += `
      <div class="card mb-2 p-2 ${paid ? 'border-success' : ''}">
        <div class="d-flex justify-content-between">
          <div>
            <strong>${escapeHtml(p.title)}</strong>
            <div class="small-muted">${escapeHtml(p.type)} • ${escapeHtml(p.cycle)} • ${escapeHtml(p.dateText||'')}</div>
            ${paid ? `<span class="badge bg-success mt-1">PAID</span>` : ''}
          </div>
          <div class="text-end">
            ${paid 
              ? `<button class="btn btn-sm btn-outline-secondary" disabled>Paid</button>`
              : `<button class="btn btn-sm btn-success" data-payid="${p.id}" data-action="markPaid">Mark Paid</button>`
            }
          </div>
        </div>
      </div>
    `;
  }

  document.getElementById('duePaymentsList').innerHTML =
    dueRows || '<div class="text-muted">No payments due this month.</div>';

  document.querySelectorAll('#duePaymentsList [data-action]').forEach(btn=>{
    btn.onclick = ()=> openPaidModal(Number(btn.getAttribute('data-payid')));
  });

  // history
  const hist = await listHistory(currentProfile);
  const histRows = hist.map(h=>`
    <div class="card mb-2 p-2">
      <div class="d-flex justify-content-between">
        <div>
          <div class="small-muted">${new Date(h.datePaid).toLocaleString()}</div>
          <div>Payment ID: ${h.paymentId} • ${escapeHtml(h.remarks||'')}</div>
        </div>
      </div>
    </div>
  `).join('');
  document.getElementById('historyList').innerHTML = histRows || '<div class="text-muted">No history yet.</div>';
}

// helpers to open modals
function openPaymentModal(paymentId=null){
  const m = new bootstrap.Modal(document.getElementById('paymentModal'));
  document.getElementById('paymentModalTitle').innerText = paymentId ? 'Edit Payment' : 'Add Payment';
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentId').value = paymentId || '';
  document.getElementById('pTypeCustom').style.display = 'none';
  if(paymentId){
    getByKey('payments', paymentId).then(p=>{
      document.getElementById('paymentId').value = p.id;
      document.getElementById('pTitle').value = p.title;
      document.getElementById('pType').value = ['Subscription','EMI','LIC','Health'].includes(p.type)?p.type:'Custom';
      if(!['Subscription','EMI','LIC','Health'].includes(p.type)){ document.getElementById('pTypeCustom').style.display='block'; document.getElementById('pTypeCustom').value = p.type; }
      document.getElementById('pCycle').value = p.cycle;
      document.getElementById('pDate').value = p.dateText||'';
      document.getElementById('pNotes').value = p.notes||'';
      m.show();
    });
  } else {
    m.show();
  }
  // handle type select
  document.getElementById('pType').onchange = (e)=>{
    if(e.target.value==='Custom') document.getElementById('pTypeCustom').style.display='block';
    else { document.getElementById('pTypeCustom').style.display='none'; document.getElementById('pTypeCustom').value=''; }
  };
  // submit
  document.getElementById('paymentForm').onsubmit = async (e)=>{
    e.preventDefault();
    const id = document.getElementById('paymentId').value;
    const data = {
      title: document.getElementById('pTitle').value.trim(),
      type: document.getElementById('pType').value === 'Custom' ? document.getElementById('pTypeCustom').value.trim() : document.getElementById('pType').value,
      cycle: document.getElementById('pCycle').value,
      dateText: document.getElementById('pDate').value.trim(),
      notes: document.getElementById('pNotes').value.trim()
    };
    if(!data.title){ alert('Title required'); return; }
    if(!currentProfile){ alert('No profile'); return; }
    if(id){
      await updatePayment(Number(id), data);
    } else {
      await addPayment(currentProfile, data);
    }
    m.hide();
    await refreshDashboardLists();
  };
}

function openPaidModal(paymentId){
  const m = new bootstrap.Modal(document.getElementById('paidModal'));
  document.getElementById('paidPaymentId').value = paymentId;
  document.getElementById('paidRemarks').value = '';
  document.getElementById('paidDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('paidForm').onsubmit = async (e)=>{
    e.preventDefault();
    const pid = Number(document.getElementById('paidPaymentId').value);
    const remarks = document.getElementById('paidRemarks').value.trim();
    const date = document.getElementById('paidDate').value;
    await markPaid(currentProfile, pid, remarks, date);
    m.hide();
    await refreshDashboardLists();
  };
  m.show();
}

function escapeHtml(s){ if(!s) return ''; return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

async function refreshProfilesList(){
  const all = await getAll('profiles');
  if(!all || all.length===0) showNoProfiles();
  else showProfilesList(all);
}
