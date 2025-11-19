function isoDate(d=new Date()){
  const tz=d.getTimezoneOffset()*60000;
  return new Date(d-tz).toISOString().slice(0,10);
}

async function afterLogin(){
  const p=await getProfile();
  document.getElementById('userGreeting').innerText=p?`Hi, ${p.name}`:'';
  document.getElementById('entryDate').value=isoDate();
  await renderEntries();
}

document.getElementById('btnSave').onclick=async()=>{
  const date=document.getElementById('entryDate').value||isoDate();
  const content=document.getElementById('entryContent').value.trim();
  if(!content) return alert('Write something first');
  await saveEntryObj({date,content});
  await renderEntries();
  alert('Saved');
};

document.getElementById('btnClear').onclick=()=>{
  document.getElementById('entryContent').value='';
};

document.getElementById('entriesList').onclick=async e=>{
  const btn=e.target.closest('button');
  if(!btn) return;
  const date=btn.dataset.date;

  if(btn.dataset.action==='load'){
    const entry=await getEntry(date);
    if(entry){
      document.getElementById('entryDate').value=entry.date;
      document.getElementById('entryContent').value=entry.content;
      window.scrollTo({top:0,behavior:'smooth'});
    }
  }

  if(btn.dataset.action==='delete'){
    if(!confirm('Delete this entry?')) return;
    const tx=db.transaction('entries','readwrite');
    tx.objectStore('entries').delete(date);
    tx.oncomplete=()=>renderEntries();
  }
};

document.getElementById('btnExport').onclick=async()=>{
  const profile=await getProfile();
  const entries=await getAllEntriesDescending();
  const blob=new Blob([JSON.stringify({exportedAt:new Date(),profile,entries},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='daily-journal-export.json';
  a.click();
  URL.revokeObjectURL(url);
};

document.getElementById('btnImport').onclick=()=>document.getElementById('importFile').click();

document.getElementById('importFile').onchange=async e=>{
  const f=e.target.files[0];
  if(!f) return;
  const txt=await f.text();
  const data=JSON.parse(txt);
  if(!data.entries) return alert('Invalid import');
  if(!confirm('Import will overwrite same dates. Continue?'))return;

  const tx=db.transaction(['entries','profile'],'readwrite');

  data.entries.forEach(en=>tx.objectStore('entries').put(en));
  if(data.profile) tx.objectStore('profile').put(data.profile);

  tx.oncomplete=()=>renderEntries();
  e.target.value='';
};

document.getElementById('btnDeleteProfile').onclick=async()=>{
  if(!confirm('This will delete EVERYTHING')) return;
  await clearAllData();
  location.reload();
};

document.getElementById('btnLogout').onclick=()=>showInitialAuth();

(async()=>{
  await openDB();
  await showInitialAuth();
})();
