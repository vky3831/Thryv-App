
// UI helper functions and handlers
let currentUser = null;
const qs = sel => document.querySelector(sel);
const qsa = sel => document.querySelectorAll(sel);

async function refreshProfiles(){
  const profiles = await getAllProfiles();
  const container = qs('#profilesList');
  container.innerHTML = '';
  if(!profiles || profiles.length===0){
    qs('#profileTitle').textContent = 'No users yet — create one';
  } else {
    qs('#profileTitle').textContent = 'Select a user';
  }
  profiles.forEach(p=>{
    const div = document.createElement('div');
    div.className = 'card p-2 mb-2';
    div.innerHTML = `<div class="d-flex align-items-center">
      <div>
        <strong>${p.name}</strong><div class="small text-muted">DOB: ${p.dob || ''}</div>
      </div>
      <div class="ms-auto">
        <button data-id="${p.id}" class="btn btn-sm btn-primary selectUser">Open</button>
        <button data-id="${p.id}" class="btn btn-sm btn-outline-secondary editUser">Edit</button>
        <button data-id="${p.id}" class="btn btn-sm btn-outline-danger deleteUser">Delete</button>
      </div>
    </div>`;
    container.appendChild(div);
  });

  // attach listeners
  qsa('.selectUser').forEach(b=>b.addEventListener('click', async (e)=>{
    const id = e.currentTarget.dataset.id;
    const profiles = await getAllProfiles();
    const p = profiles.find(x=>x.id==id);
    openDashboard(p);
  }));
  qsa('.editUser').forEach(b=>b.addEventListener('click', async (e)=>{
    const id = Number(e.currentTarget.dataset.id);
    const profiles = await getAllProfiles();
    const p = profiles.find(x=>x.id===id);
    const newName = prompt('Edit name', p.name);
    if(newName!==null){
      p.name = newName;
      await updateProfile(p);
      refreshProfiles();
    }
  }));
  qsa('.deleteUser').forEach(b=>b.addEventListener('click', async (e)=>{
    const id = Number(e.currentTarget.dataset.id);
    if(confirm('Delete profile and all its records?')) {
      await deleteProfile(id);
      refreshProfiles();
    }
  }));
}

function showDashboardUI(){
  qs('#profileArea').classList.add('d-none');
  qs('#dashboardArea').classList.remove('d-none');
}

function showProfileUI(){
  qs('#profileArea').classList.remove('d-none');
  qs('#dashboardArea').classList.add('d-none');
  refreshProfiles();
}

async function openDashboard(profile){
  currentUser = profile;
  qs('#dashUserName').textContent = profile.name;
  qs('#dashUserDob').textContent = profile.dob ? ('DOB: '+profile.dob) : '';
  showDashboardUI();
  await populateTypeUnit();
  await loadRecords();
}

async function populateTypeUnit(){
  // combine profile custom types/units
  const types = (currentUser.customTypes || []);
  const units = (currentUser.customUnits || []);
  const typeSelect = qs('#inputType');
  const unitSelect = qs('#inputUnit');
  const filterSelect = qs('#filterType');
  typeSelect.innerHTML = '';
  unitSelect.innerHTML = '';
  filterSelect.innerHTML = '<option value="">-- All types --</option>';
  types.forEach(t=>{
    const o = document.createElement('option'); o.value=o.textContent=t;
    typeSelect.appendChild(o);
    const f = document.createElement('option'); f.value=f.textContent=t;
    filterSelect.appendChild(f);
  });
  units.forEach(u=>{
    const o = document.createElement('option'); o.value=o.textContent=u;
    unitSelect.appendChild(o);
  });
  // set default datetime to now
  const now = new Date();
  const local = now.toISOString().slice(0,16);
  qs('#inputDatetime').value = local;
  // click handlers to add
  qs('#addTypeBtn').onclick = async ()=>{
    const val = prompt('Add new type (e.g. Blood Pressure)');
    if(val){
      currentUser.customTypes = currentUser.customTypes || [];
      currentUser.customTypes.push(val);
      await updateProfile(currentUser);
      await populateTypeUnit();
    }
  };
  qs('#addUnitBtn').onclick = async ()=>{
    const val = prompt('Add new unit (e.g. mmHg)');
    if(val){
      currentUser.customUnits = currentUser.customUnits || [];
      currentUser.customUnits.push(val);
      await updateProfile(currentUser);
      await populateTypeUnit();
    }
  };
}

async function loadRecords(filterType=''){
  const rows = await getRecordsByUser(currentUser.id);
  let list = rows || [];
  if(filterType) list = list.filter(r=>r.type===filterType);
  const container = qs('#recordsList');
  if(list.length===0){
    container.innerHTML = '<div class="small text-muted">No records yet.</div>';
    return;
  }
  const table = document.createElement('table');
  table.className = 'table table-sm';
  table.innerHTML = `<thead><tr><th>Type</th><th>Value</th><th>Unit</th><th>Date</th><th></th></tr></thead>`;
  const tb = document.createElement('tbody');
  list.sort((a,b)=>new Date(b.datetime)-new Date(a.datetime));
  list.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.type}</td><td>${r.value}</td><td>${r.unit}</td><td>${new Date(r.datetime).toLocaleString()}</td>
      <td>
        <button class="btn btn-sm btn-outline-secondary editRec" data-id="${r.id}">Edit</button>
        <button class="btn btn-sm btn-outline-danger delRec" data-id="${r.id}">Delete</button>
      </td>`;
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  container.innerHTML = '';
  container.appendChild(table);

  qsa('.delRec').forEach(b=>b.addEventListener('click', async (e)=>{
    const id = Number(e.currentTarget.dataset.id);
    if(confirm('Delete record?')){
      await deleteRecord(id);
      await loadRecords(qs('#filterType').value);
    }
  }));
  qsa('.editRec').forEach(b=>b.addEventListener('click', async (e)=>{
    const id = Number(e.currentTarget.dataset.id);
    const rows = await getRecordsByUser(currentUser.id);
    const rec = rows.find(x=>x.id===id);
    if(rec){
      qs('#inputType').value = rec.type;
      qs('#inputValue').value = rec.value;
      qs('#inputUnit').value = rec.unit;
      // format datetime-local
      const dt = new Date(rec.datetime);
      qs('#inputDatetime').value = dt.toISOString().slice(0,16);
      // temporarily store editing id
      qs('#recordForm').dataset.editing = id;
    }
  }));
}
