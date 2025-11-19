// js/app.js
// MediCycle - IndexedDB (Option C) rewrite
// Replace your old app.js with this file. UI unchanged.

// ---------- Old localStorage key used for migration reference ----------
const LEGACY_STORAGE_KEY = 'medicycle_data_v1';
const VERIFIED_KEY = 'medicycle_verified_profile'; // kept name for meta migration
// NOTE: Verified key will be migrated into meta store as 'verifiedProfile'

// ---------- IndexedDB service (db) ----------
const db = (function(){
  const DB_NAME = 'medicycle_db';
  const DB_VERSION = 1;
  const STORE_PROFILES = 'profiles';
  const STORE_MEDICINES = 'medicines';
  const STORE_HISTORY = 'history';
  const STORE_META = 'meta';

  let _db = null;

  function open(){
    return new Promise((resolve, reject) => {
      if(_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const idb = e.target.result;
        if(!idb.objectStoreNames.contains(STORE_PROFILES)){
          idb.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
        }
        if(!idb.objectStoreNames.contains(STORE_MEDICINES)){
          const s = idb.createObjectStore(STORE_MEDICINES, { keyPath: 'id' });
          s.createIndex('byProfile', 'profileId', { unique: false });
        }
        if(!idb.objectStoreNames.contains(STORE_HISTORY)){
          const s = idb.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
          s.createIndex('byProfile', 'profileId', { unique: false });
          s.createIndex('byMed', 'medId', { unique: false });
        }
        if(!idb.objectStoreNames.contains(STORE_META)){
          idb.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(_db);
      };
      req.onerror = (e) => reject(e.target.error);
      req.onblocked = () => console.warn('DB open blocked');
    });
  }

  function tx(storeNames, mode='readonly'){
    return open().then(database => database.transaction(storeNames, mode));
  }

  // helpers
  function getStoreAll(storeName){
    return tx([storeName], 'readonly').then(t => {
      return new Promise((res, rej) => {
        const store = t.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => rej(req.error);
      });
    });
  }

  function put(storeName, obj){
    return tx([storeName], 'readwrite').then(t => {
      return new Promise((res, rej) => {
        const store = t.objectStore(storeName);
        const req = store.put(obj);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    });
  }

  function getByKey(storeName, key){
    return tx([storeName], 'readonly').then(t => {
      return new Promise((res, rej) => {
        const store = t.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    });
  }

  function deleteKey(storeName, key){
    return tx([storeName], 'readwrite').then(t => {
      return new Promise((res, rej) => {
        const store = t.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => res();
        req.onerror = () => rej(req.error);
      });
    });
  }

  function getIndexAll(storeName, indexName, query){
    return tx([storeName], 'readonly').then(t => {
      return new Promise((res, rej) => {
        const store = t.objectStore(storeName);
        const index = store.index(indexName);
        const req = index.getAll(query);
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => rej(req.error);
      });
    });
  }

  // Public API
  return {
    open: open,

    // Profiles
    async getProfiles(){
      return getStoreAll(STORE_PROFILES);
    },
    async getProfile(id){
      return getByKey(STORE_PROFILES, id);
    },
    async saveProfile(profile){
      // profile must have id
      await put(STORE_PROFILES, profile);
      return profile;
    },
    async deleteProfile(id){
      // delete profile, its medicines and history
      await deleteKey(STORE_PROFILES, id);
      // delete medicines for profile
      const meds = await getIndexAll(STORE_MEDICINES, 'byProfile', id);
      await Promise.all(meds.map(m => deleteKey(STORE_MEDICINES, m.id)));
      // delete history for profile
      const hist = await getIndexAll(STORE_HISTORY, 'byProfile', id);
      await Promise.all(hist.map(h => deleteKey(STORE_HISTORY, h.id)));
    },

    // Medicines
    async getMedicines(profileId){
      if(!profileId) return [];
      return getIndexAll(STORE_MEDICINES, 'byProfile', profileId);
    },
    async getMedicine(id){
      return getByKey(STORE_MEDICINES, id);
    },
    async saveMedicine(med){
      await put(STORE_MEDICINES, med);
      return med;
    },
    async deleteMedicine(id){
      await deleteKey(STORE_MEDICINES, id);
    },

    // History
    async addHistory(entry){
      // entry should get generated id
      const obj = Object.assign({}, entry, { id: entry.id || ('hist_' + Math.random().toString(36).slice(2,9)) });
      await put(STORE_HISTORY, obj);
      return obj;
    },
    async getHistory(profileId){
      if(!profileId) return [];
      return getIndexAll(STORE_HISTORY, 'byProfile', profileId);
    },
    async clearHistoryForProfile(profileId){
      const h = await getIndexAll(STORE_HISTORY, 'byProfile', profileId);
      await Promise.all(h.map(item => deleteKey(STORE_HISTORY, item.id)));
    },

    // Meta (key-value)
    async getMeta(key){
      const r = await getByKey(STORE_META, key);
      return r ? r.value : null;
    },
    async setMeta(key, value){
      await put(STORE_META, { key, value });
      return value;
    },

    // Export everything into a JSON object (compatible with previous localStorage shape)
    async exportAll(){
      const profiles = await getStoreAll(STORE_PROFILES);
      // For each profile, include associated medicines as array on the profile object to match legacy shape
      const medicines = await getStoreAll(STORE_MEDICINES);
      const history = await getStoreAll(STORE_HISTORY);
      const metaItems = await getStoreAll(STORE_META);
      const meta = {};
      metaItems.forEach(m => meta[m.key] = m.value);

      // Convert into legacy-like structure:
      // profiles (each with medicines array), history [...], currentProfileId from meta.currentProfileId
      const profilesMap = {};
      profiles.forEach(p => {
        const copy = Object.assign({}, p);
        copy.medicines = medicines.filter(m => m.profileId === p.id).map(m => {
          const c = Object.assign({}, m);
          // remove profileId from medicine as before (keeping simple)
          delete c.profileId;
          return c;
        });
        profilesMap[p.id] = copy;
      });

      const profilesArr = Object.values(profilesMap);
      const exportObj = {
        profiles: profilesArr,
        history: history.map(h => {
          // legacy history shape: { profileId, medId, medName, dosage, timeTakenISO }
          const out = {
            profileId: h.profileId,
            medId: h.medId,
            medName: h.medName,
            dosage: h.dosage,
            timeTakenISO: h.timeTakenISO,
          };
          // include id optionally
          out.id = h.id;
          return out;
        }),
        currentProfileId: meta.currentProfileId || null,
        meta: meta
      };
      return exportObj;
    },

    // Import full JSON as produced by exportAll or legacy export
    // Strategy: clear DB then insert data from JSON
    async importAll(json){
      // json expected shape: { profiles: [ {id, name, age, passkey, medicines:[...]} ], history: [...], currentProfileId }
      // We'll clear stores and bulk-put items.
      await open();
      // Clearing by opening readwrite txs and using clear()
      await new Promise((res, rej) => {
        const t = _db.transaction([STORE_PROFILES, STORE_MEDICINES, STORE_HISTORY, STORE_META], 'readwrite');
        t.objectStore(STORE_PROFILES).clear();
        t.objectStore(STORE_MEDICINES).clear();
        t.objectStore(STORE_HISTORY).clear();
        t.objectStore(STORE_META).clear();
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
      });

      // Insert profiles
      const profiles = Array.isArray(json.profiles) ? json.profiles : [];
      for(const p of profiles){
        const pCopy = Object.assign({}, p);
        // remove medicines from profile object before saving to profiles store
        const medsForProfile = Array.isArray(pCopy.medicines) ? pCopy.medicines : [];
        delete pCopy.medicines;
        await put(STORE_PROFILES, pCopy);

        // insert medicines
        for(const m of medsForProfile){
          // ensure medicine record has profileId so we can index it
          const mCopy = Object.assign({}, m);
          mCopy.profileId = pCopy.id;
          if(!mCopy.id) mCopy.id = 'med_' + Math.random().toString(36).slice(2,9);
          await put(STORE_MEDICINES, mCopy);
        }
      }

      // Insert history
      const hist = Array.isArray(json.history) ? json.history : [];
      for(const h of hist){
        const hCopy = Object.assign({}, h);
        // ensure fields exist
        if(!hCopy.id) hCopy.id = 'hist_' + Math.random().toString(36).slice(2,9);
        await put(STORE_HISTORY, hCopy);
      }

      // Insert meta
      const meta = json.meta || {};
      if(json.currentProfileId) meta.currentProfileId = json.currentProfileId;
      for(const k of Object.keys(meta)){
        await put(STORE_META, { key: k, value: meta[k] });
      }

      return true;
    },

    // Clear entire DB (useful for resets)
    async clearAll(){
      await new Promise((res, rej) => {
        const t = _db.transaction([STORE_PROFILES, STORE_MEDICINES, STORE_HISTORY, STORE_META], 'readwrite');
        t.objectStore(STORE_PROFILES).clear();
        t.objectStore(STORE_MEDICINES).clear();
        t.objectStore(STORE_HISTORY).clear();
        t.objectStore(STORE_META).clear();
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
      });
    }
  };
})();

// ---------- Utility functions ----------
function uid(prefix='id'){
  return prefix + '_' + Math.random().toString(36).slice(2,9);
}

// ---------- DOM refs (unchanged) ----------
const screenProfile = document.getElementById('screen-profile');
const screenApp = document.getElementById('screen-app');
const screenAdd = document.getElementById('screen-add');

const createProfileBtn = document.getElementById('createProfileBtn');
const addProfileBtn = document.getElementById('addProfileBtn');
const profilesList = document.getElementById('profilesList');

const profileTitle = document.getElementById('profileTitle');
const profileAgeEl = document.getElementById('profileAge');
const profileIdEl = document.getElementById('profileId');

const switchProfileBtn = document.getElementById('switchProfileBtn');
const logoutBtn = document.getElementById('logoutBtn');
const deleteProfileBtn = document.getElementById('deleteProfileBtn');

const addMedicineBtn = document.getElementById('addMedicineBtn');
const medListAll = document.getElementById('medListAll');
const medListToday = document.getElementById('medListToday');
const historyList = document.getElementById('historyList');

const medForm = document.getElementById('medForm');
const medName = document.getElementById('medName');
const medDosage = document.getElementById('medDosage');
const medTime = document.getElementById('medTime');
const medCycle = document.getElementById('medCycle');
const cycleDetails = document.getElementById('cycleDetails');
const saveMedBtn = document.getElementById('saveMedBtn');
const cancelMedBtn = document.getElementById('cancelMedBtn');
const addTitle = document.getElementById('addTitle');

const toggleTheme = document.getElementById('toggleTheme');
const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');

// Tabs wiring (unchanged)
document.querySelectorAll('#mainTabs .nav-link').forEach(a => {
  a.addEventListener('click', ()=>{
    document.querySelectorAll('#mainTabs .nav-link').forEach(x=>x.classList.remove('active'));
    a.classList.add('active');

    document.querySelectorAll('.tab-pane').forEach(p=>p.style.display='none');
    document.getElementById('tab-'+a.dataset.tab).style.display='block';

    if(a.dataset.tab === 'history') renderHistory();
    if(a.dataset.tab === 'today') renderToday();
    if(a.dataset.tab === 'all') renderAll();
  });
});

// ---------- Application state ----------
let currentProfile = null;
let editingMedId = null;
let notifiedSet = new Set();

// ---------- Migration: from localStorage to IndexedDB (if present) ----------
async function migrateFromLocalStorageIfNeeded(){
  try{
    // If DB already has profiles, skip migration
    await db.open();
    const existingProfiles = await db.getProfiles();
    if(existingProfiles && existingProfiles.length>0) return;

    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    if(!parsed || !parsed.profiles) return;

    // Ask user (non-modal environments may just auto-migrate) — we'll auto-import but leave localStorage intact.
    console.info('Legacy localStorage data detected. Importing into IndexedDB...');
    await db.importAll(parsed);

    // preserve legacy VERIFIED_KEY as meta
    const verified = localStorage.getItem(VERIFIED_KEY);
    if(verified) await db.setMeta('verifiedProfile', verified);

    // do not automatically remove legacy data; leave it so user can still Export/Import from old flow.
    console.info('Migration complete. Legacy localStorage left intact for safety.');
  }catch(err){
    console.error('Migration failed', err);
  }
}

// ---------- App init ----------
(async function init(){
  await db.open();
  await migrateFromLocalStorageIfNeeded();
  await initApp();
})();

// ---------- Profile creation / selection UI ----------
async function showCreateProfileForm(){
  const name = prompt('Name:'); if(!name) return;
  const age = prompt('Age:'); if(!age) return;
  const passkey = prompt('Passkey:'); if(!passkey) return;

  const id = uid('profile');
  const profileObj = { id, name, age, passkey };
  await db.saveProfile(profileObj);
  // save medicines later via medicine API (none right now)
  await db.setMeta('currentProfileId', id);
  await db.setMeta('verifiedProfile', id);

  await initApp();
}

async function renderProfiles(){
  profilesList.innerHTML = '';

  const profiles = await db.getProfiles();
  if(!profiles || profiles.length===0){
    document.getElementById('no-data-screen').style.display='block';
    document.getElementById('select-profile-screen').style.display='none';
    return;
  }

  document.getElementById('no-data-screen').style.display='none';
  document.getElementById('select-profile-screen').style.display='block';

  profiles.forEach(p=>{
    const div = document.createElement('div');
    div.className = 'd-flex align-items-center justify-content-between mb-2 card p-2';

    div.innerHTML = `
      <div><strong>${p.name}</strong>
        <div class="small-muted">Age ${p.age}</div>
      </div>
      <div>
        <button class="btn btn-sm btn-primary select-profile" data-id="${p.id}">Open</button>
        <button class="btn btn-sm btn-outline-danger ms-1 delete-profile" data-id="${p.id}">Delete</button>
      </div>
    `;

    profilesList.appendChild(div);
  });

  // SELECT PROFILE — passkey only here
  document.querySelectorAll('.select-profile').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const id = b.dataset.id;
      const profile = await db.getProfile(id);
      if(!profile) return;

      const verified = await db.getMeta('verifiedProfile');
      if(verified !== id){
        const pass = prompt(`Passkey for "${profile.name}":`);
        if(pass !== profile.passkey){
          alert("Wrong passkey");
          return;
        }
        await db.setMeta('verifiedProfile', id);
      }

      await db.setMeta('currentProfileId', id);
      await initApp();
    });
  });

  // DELETE PROFILE
  document.querySelectorAll('.delete-profile').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const id = b.dataset.id;
      const profile = await db.getProfile(id);

      if(confirm(`Delete profile "${profile.name}"?`)){
        await db.deleteProfile(id);
        const verified = await db.getMeta('verifiedProfile');
        if(verified === id) await db.setMeta('verifiedProfile', null);
        const current = await db.getMeta('currentProfileId');
        if(current === id) await db.setMeta('currentProfileId', null);

        await initApp();
      }
    });
  });
}

// ---------- App initialization / rendering ----------
async function initApp(){
  // load metadata currentProfileId
  const curId = await db.getMeta('currentProfileId');
  if(!curId){
    // show profile list
    screenProfile.style.display='block';
    screenApp.style.display='none';
    screenAdd.style.display='none';
    await renderProfiles();
    return;
  }

  const profile = await db.getProfile(curId);
  if(profile){
    currentProfile = profile;
    await openAppForProfile();
    return;
  }

  // invalid stored id -> reset
  await db.setMeta('currentProfileId', null);
  screenProfile.style.display='block';
  screenApp.style.display='none';
  screenAdd.style.display='none';
  await renderProfiles();
}

async function openAppForProfile(){
  screenProfile.style.display='none';
  screenApp.style.display='block';
  screenAdd.style.display='none';

  profileTitle.textContent = currentProfile.name;
  profileAgeEl.textContent = currentProfile.age;
  profileIdEl.textContent = currentProfile.id;

  await renderAll();
  await renderToday();
}

// ---------- Rendering ----------
async function renderAll(){
  medListAll.innerHTML = '';
  if(!currentProfile){
    medListAll.innerHTML = '<div class="text-muted">No medicines added yet</div>';
    return;
  }

  const meds = await db.getMedicines(currentProfile.id);
  if(!meds || meds.length===0){
    medListAll.innerHTML = '<div class="text-muted">No medicines added yet</div>';
    return;
  }

  meds.forEach(m=>{
    const card = document.createElement('div');
    card.className='card p-2 mb-2';
    card.innerHTML = `
      <div class="d-flex justify-content-between">
        <div>
          <div class="h6 mb-0">${m.name}</div>
          <div class="small-muted">${m.dosage} • ${m.food==='after'?'After Food':'Before Food'}</div>
          <div class="small-muted">Time: ${m.time} • Cycle: ${cycleLabel(m)}</div>
        </div>
        <div class="text-end">
          <button class="btn btn-sm btn-outline-primary edit-med" data-id="${m.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger ms-1 del-med" data-id="${m.id}">Delete</button>
        </div>
      </div>`;
    medListAll.appendChild(card);
  });

  document.querySelectorAll('.edit-med').forEach(b=> b.addEventListener('click', ()=> openEditMedicine(b.dataset.id)));
  document.querySelectorAll('.del-med').forEach(b=> b.addEventListener('click', ()=> deleteMed(b.dataset.id)));
}

async function renderToday(){
  medListToday.innerHTML = '';
  if(!currentProfile) return;

  const now = new Date();
  const meds = await db.getMedicines(currentProfile.id);
  const todays = meds.filter(m=> isMedicineForDate(m, now));

  if(todays.length===0){
    medListToday.innerHTML = '<div class="text-muted">No medicines scheduled for today</div>';
    return;
  }

  todays.forEach(m=>{
    // wasTakenToday check uses history from DB
    const div = document.createElement('div');
    div.className='card p-2 mb-2 d-flex justify-content-between align-items-center';
    // we'll check taken status asynchronously after building list to keep UI responsive
    div.innerHTML = `
      <div>
        <div class="h6 mb-0">${m.name} <span class="taken-badge-${m.id}"></span></div>
        <div class="small-muted">${m.dosage} • ${m.time} • ${m.food==='after'?'After Food':'Before Food'}</div>
      </div>
      <button class="btn btn-sm btn-success mark-taken" data-id="${m.id}">Mark taken</button>`;

    medListToday.appendChild(div);
  });

  // attach handlers
  document.querySelectorAll('.mark-taken').forEach(b=> b.addEventListener('click', ()=> markTaken(b.dataset.id)));

  // update badges by checking history
  for(const m of todays){
    const taken = await wasTakenToday(currentProfile.id, m.id);
    const span = document.querySelector(`.taken-badge-${m.id}`);
    if(span) span.innerHTML = taken ? '<span class="badge bg-success ms-2">Taken</span>' : '';
    const btn = Array.from(document.querySelectorAll('.mark-taken')).find(x => x.dataset.id === m.id);
    if(btn) btn.disabled = taken;
  }
}

async function renderHistory(){
  historyList.innerHTML = '';
  if(!currentProfile) return;

  const list = await db.getHistory(currentProfile.id);
  // sort descending by timeTakenISO
  list.sort((a,b) => new Date(b.timeTakenISO) - new Date(a.timeTakenISO));

  if(list.length===0){
    historyList.innerHTML = '<div class="text-muted">No history yet</div>';
    return;
  }

  list.forEach(h=>{
    const el = document.createElement('div');
    el.className='card p-2 mb-2';
    el.innerHTML = `
      <div class="d-flex justify-content-between">
        <div>
          <strong>${h.medName}</strong>
          <div class="small-muted">${h.dosage} • ${new Date(h.timeTakenISO).toLocaleString()}</div>
        </div>
        <button class="btn btn-sm btn-outline-secondary btn-copy" data-iso="${h.timeTakenISO}">Copy time</button>
      </div>`;
    historyList.appendChild(el);
  });

  document.querySelectorAll('.btn-copy')
    .forEach(b=> b.addEventListener('click', ()=> navigator.clipboard.writeText(b.dataset.iso)));
}

// ---------- Helpers (same logic) ----------
function cycleLabel(m){
  if(m.cycle==='daily') return 'Daily';
  if(m.cycle==='monthly') return 'Monthly on '+ (m.monthDay || '?');
  if(m.cycle==='weekly') return 'Weekly on '+ (m.weekDays? m.weekDays.join(', '):'?');
  return '';
}

function isMedicineForDate(m, date){
  if(m.cycle==='daily') return true;

  if(m.cycle==='monthly'){
    return Number(m.monthDay) === date.getDate();
  }

  if(m.cycle==='weekly'){
    const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return m.weekDays && m.weekDays.includes(names[date.getDay()]);
  }

  return false;
}

async function wasTakenToday(profileId, medId){
  const list = await db.getHistory(profileId);
  const today = (new Date()).toDateString();
  return list.some(h=> h.profileId===profileId && h.medId===medId && new Date(h.timeTakenISO).toDateString()===today);
}

// ---------- Add/Edit/Delete medicine ----------
function openAddMedicine(){
  editingMedId = null;
  addTitle.textContent = 'Add Medicine';

  medForm.reset();
  cycleDetails.innerHTML='';
  medCycle.value='daily';
  renderCycleDetails();

  screenProfile.style.display='none';
  screenApp.style.display='none';
  screenAdd.style.display='block';
}

async function openEditMedicine(id){
  const med = await db.getMedicine(id);
  if(!med) return;

  editingMedId = id;
  addTitle.textContent = 'Edit Medicine';

  medName.value = med.name;
  medDosage.value = med.dosage;
  medTime.value = med.time;
  document.querySelectorAll('input[name="food"]').forEach(r=> r.checked = (r.value === med.food));
  medCycle.value = med.cycle;

  renderCycleDetails(med);

  screenProfile.style.display='none';
  screenApp.style.display='none';
  screenAdd.style.display='block';
}

async function deleteMed(id){
  if(!confirm('Delete this medicine?')) return;

  await db.deleteMedicine(id);
  await renderAll();
  await renderToday();
}

medCycle.addEventListener('change', ()=> renderCycleDetails());

function renderCycleDetails(med=null){
  const v = medCycle.value;

  if(v==='daily'){
    cycleDetails.innerHTML = '<div class="form-text">Will repeat every day</div>';
    return;
  }

  if(v==='monthly'){
    const val = med? (med.monthDay||'') : '';
    cycleDetails.innerHTML = `
      <label class="form-label">Date of month (1-31)</label>
      <input id="monthDay" type="number" min="1" max="31" class="form-control" value="${val}" required>`;
    return;
  }

  if(v==='weekly'){
    const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const selected = med && med.weekDays ? med.weekDays : [];

    cycleDetails.innerHTML = `
      <label class="form-label d-block">Select weekdays</label>
      ${names.map(n=> `
        <div class='form-check form-check-inline'>
          <input class='form-check-input week-day' type='checkbox' value='${n}' ${selected.includes(n)?'checked':''}>
          <label class='form-check-label'>${n.slice(0,3)}</label>
        </div>`).join('')}
    `;
  }
}

medForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  await saveMedicine();
});

cancelMedBtn.addEventListener('click', ()=>{
  screenAdd.style.display='none';
  screenApp.style.display='block';
});

async function saveMedicine(){
  const name = medName.value.trim();
  const dosage = medDosage.value.trim();
  const time = medTime.value;
  const food = document.querySelector('input[name="food"]:checked').value;
  const cycle = medCycle.value;

  if(!currentProfile) { alert('No profile selected'); return; }

  let medObj = editingMedId ? await db.getMedicine(editingMedId) : null;

  if(!medObj){
    medObj = { id: uid('med'), profileId: currentProfile.id, name, dosage, time, food, cycle };
  } else {
    medObj.name = name;
    medObj.dosage = dosage;
    medObj.time = time;
    medObj.food = food;
    medObj.cycle = cycle;
  }

  if(cycle==='monthly'){
    medObj.monthDay = Number(document.getElementById('monthDay').value);
  } else {
    delete medObj.monthDay;
  }
  if(cycle==='weekly'){
    medObj.weekDays = Array.from(document.querySelectorAll('.week-day:checked')).map(x=>x.value);
  } else {
    delete medObj.weekDays;
  }

  await db.saveMedicine(medObj);
  // ensure profile saved (in case newly created)
  await db.saveProfile(currentProfile);

  await initApp();
}

// ---------- Mark taken ----------
async function markTaken(medId){
  if(!currentProfile) return;
  const med = await db.getMedicine(medId);
  if(!med) return;

  const entry = {
    profileId: currentProfile.id,
    medId: med.id,
    medName: med.name,
    dosage: med.dosage,
    timeTakenISO: new Date().toISOString()
  };

  await db.addHistory(entry);
  await renderToday();
}

// ---------- Export / Import (now use db.exportAll / db.importAll) ----------
exportBtn.addEventListener('click', async ()=>{
  const data = await db.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'medicycle_data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

importFile.addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  if(!f) return;

  try{
    const txt = await f.text();
    const imported = JSON.parse(txt);

    if(!imported.profiles) throw new Error('Invalid file');

    if(confirm('This will replace current data in IndexedDB. Proceed?')){
      await db.importAll(imported);
      // clear verified and current
      await db.setMeta('verifiedProfile', null);
      await db.setMeta('currentProfileId', null);
      alert('Imported. Reloading view.');
      await initApp();
    }

  }catch(err){
    alert('Failed to import: '+err.message);
  }

  importFile.value='';
});

// ---------- Notifications ----------
function requestNotifPermission(){
  if('Notification' in window)
    Notification.requestPermission();
}

async function checkReminders(){
  const now = new Date();
  const hhmm = now.toTimeString().slice(0,5);

  const currentId = await db.getMeta('currentProfileId');
  if(!currentId) return;

  const profile = await db.getProfile(currentId);
  if(!profile) return;

  const meds = await db.getMedicines(profile.id);
  for(const m of meds){
    if(m.time===hhmm && isMedicineForDate(m, now)){
      const key = `${profile.id}|${m.id}|${now.toDateString()}|${hhmm}`;
      if(notifiedSet.has(key)) continue;
      notifiedSet.add(key);
      if(Notification.permission==='granted'){
        new Notification(`MediCycle: ${m.name}`, {
          body: `${m.dosage} • ${m.food==='after'?'After Food':'Before Food'}`
        });
      }
    }
  }
}

setInterval(checkReminders, 20000);

// ---------- Theme (persisted in meta) ----------
async function applyTheme(isDark){
  if(isDark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  await db.setMeta('theme', isDark? 'dark':'light');
}

toggleTheme.addEventListener('click', async ()=>{
  const isDark = document.documentElement.classList.toggle('dark');
  await db.setMeta('theme', isDark? 'dark':'light');
});

(async function(){
  const t = await db.getMeta('theme');
  applyTheme(t==='dark');
})();

// ---------- Buttons wiring ----------
createProfileBtn.addEventListener('click', showCreateProfileForm);
addProfileBtn.addEventListener('click', showCreateProfileForm);

// SWITCH PROFILE — full reset to list
switchProfileBtn.addEventListener('click', async ()=>{
  await db.setMeta('currentProfileId', null);
  await db.setMeta('verifiedProfile', null);
  currentProfile = null;
  await initApp();
});

// LOGOUT FEATURE
logoutBtn.addEventListener('click', async ()=>{
  await db.setMeta('currentProfileId', null);
  await db.setMeta('verifiedProfile', null);
  currentProfile = null;
  await initApp();
});

addMedicineBtn.addEventListener('click', openAddMedicine);

// DELETE PROFILE (current)
deleteProfileBtn.addEventListener('click', async ()=>{
  if(!currentProfile) return;

  if(confirm(`Delete current profile "${currentProfile.name}"?`)){
    await db.deleteProfile(currentProfile.id);
    await db.setMeta('currentProfileId', null);
    await db.setMeta('verifiedProfile', null);
    currentProfile = null;
    await initApp();
  }
});

// Notification permission on first click
document.addEventListener('click', ()=>{
  if(Notification && Notification.permission==='default')
    requestNotifPermission();
}, {once:true});
