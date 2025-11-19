// exportImport.js - export/import JSON
async function exportData(all=false, profileId=null){
  const snapshot = await exportAll();
  let data = snapshot;
  if(profileId){
    data = {
      profiles: (snapshot.profiles || []).filter(p => p.id === profileId),
      payments: (snapshot.payments || []).filter(x=>x.profileId===profileId),
      history: (snapshot.history || []).filter(x=>x.profileId===profileId),
      exportedAt: snapshot.exportedAt
    };
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = profileId ? `fintrack_profile_${profileId}.json` : 'fintrack_backup.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importFromFile(file, merge=true){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = async (e) => {
      try{
        const obj = JSON.parse(e.target.result);
        await importAll(obj, merge);
        resolve(true);
      }catch(err){ reject(err); }
    };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
