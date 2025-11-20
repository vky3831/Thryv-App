
// App initialization and event bindings
document.addEventListener('DOMContentLoaded', async ()=>{
  await openDB();
  bindProfileForm();
  bindDashboardButtons();
  // show profiles or create form
  const profiles = await getAllProfiles();
  if(!profiles || profiles.length===0){
    showProfileUI();
  } else {
    showProfileUI();
  }
});

function bindProfileForm(){
  const form = document.getElementById('profileForm');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = document.getElementById('pName').value.trim();
    const dob = document.getElementById('pDob').value;
    if(!name) return alert('Name required');
    const id = await addProfile({name, dob});
    form.reset();
    refreshProfiles();
    // auto-open new profile
    const profiles = await getAllProfiles();
    const p = profiles.find(x=>x.id===id);
    if(p) openDashboard(p);
  });
}

function bindDashboardButtons(){
  qs('#btnLogout').addEventListener('click', ()=>{
    // clear current user and show profiles
    currentUser = null;
    showProfileUI();
  });
  qs('#recordForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const type = qs('#inputType').value;
    const value = qs('#inputValue').value;
    const unit = qs('#inputUnit').value;
    const datetime = qs('#inputDatetime').value;
    if(!type || !value || !unit || !datetime) return alert('fill all fields');
    const editing = qs('#recordForm').dataset.editing;
    if(editing){
      const rec = {
        id: Number(editing),
        userId: currentUser.id,
        type, value, unit, datetime
      };
      await updateRecord(rec);
      delete qs('#recordForm').dataset.editing;
    } else {
      await addRecord({userId: currentUser.id, type, value, unit, datetime});
    }
    qs('#recordForm').reset();
    // reset datetime to now
    qs('#inputDatetime').value = new Date().toISOString().slice(0,16);
    await loadRecords(qs('#filterType').value);
  });

  qs('#btnClear').addEventListener('click', ()=>{
    qs('#recordForm').reset();
    qs('#inputDatetime').value = new Date().toISOString().slice(0,16);
    delete qs('#recordForm').dataset.editing;
  });

  qs('#btnApplyFilter').addEventListener('click', async ()=>{
    await loadRecords(qs('#filterType').value);
  });
  qs('#btnResetFilter').addEventListener('click', async ()=>{
    qs('#filterType').value = '';
    await loadRecords();
  });

  qs('#btnExport').addEventListener('click', async ()=>{
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'healthscale_export.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  qs('#importFile').addEventListener('change', async (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    const text = await f.text();
    try{
      const data = JSON.parse(text);
      await importJson(data);
      alert('Import complete');
      refreshProfiles();
    }catch(err){
      alert('Invalid JSON');
    }
    e.target.value = '';
  });
}
