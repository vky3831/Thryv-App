
// IndexedDB wrapper for HealthScale
const DB_NAME = 'HealthScaleDB';
const DB_VERSION = 1;
let dbPromise = null;

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains('profiles')){
        const p = db.createObjectStore('profiles', { keyPath: 'id', autoIncrement: true });
      }
      if(!db.objectStoreNames.contains('records')){
        const r = db.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
        r.createIndex('userId', 'userId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function addProfile(profile){
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('profiles','readwrite');
    const store = tx.objectStore('profiles');
    const p = Object.assign({
      createdAt: new Date().toISOString(),
      customTypes: ['Blood Sugar','Weight','BMI'],
      customUnits: ['mg/dL','kg','kg/m2']
    }, profile);
    const r = store.add(p);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function getAllProfiles(){
  const db = await openDB();
  return new Promise((res,rej) => {
    const tx = db.transaction('profiles','readonly');
    const store = tx.objectStore('profiles');
    const q = store.getAll();
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

async function updateProfile(profile){
  const db = await openDB();
  return new Promise((res,rej) => {
    const tx = db.transaction('profiles','readwrite');
    const store = tx.objectStore('profiles');
    const r = store.put(profile);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function deleteProfile(id){
  const db = await openDB();
  return new Promise((res,rej) => {
    const tx = db.transaction(['profiles','records'],'readwrite');
    tx.objectStore('profiles').delete(id);
    // delete records for that user
    const idx = tx.objectStore('records').index('userId');
    const range = IDBKeyRange.only(Number(id));
    const req = idx.openCursor(range);
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if(cur){ cur.delete(); cur.continue(); }
    };
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}

async function addRecord(record){
  const db = await openDB();
  return new Promise((res,rej) => {
    const tx = db.transaction('records','readwrite');
    const store = tx.objectStore('records');
    const r = store.add(record);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function getRecordsByUser(userId){
  const db = await openDB();
  return new Promise((res,rej) => {
    const tx = db.transaction('records','readonly');
    const store = tx.objectStore('records');
    const idx = store.index('userId');
    const q = idx.getAll(Number(userId));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

async function updateRecord(record){
  const db = await openDB();
  return new Promise((res,rej) => {
    const tx = db.transaction('records','readwrite');
    const store = tx.objectStore('records');
    const r = store.put(record);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function deleteRecord(id){
  const db = await openDB();
  return new Promise((res,rej) => {
    const tx = db.transaction('records','readwrite');
    const store = tx.objectStore('records');
    const r = store.delete(id);
    r.onsuccess = () => res(true);
    r.onerror = () => rej(r.error);
  });
}

// Export entire DB to JSON
async function exportAll(){
  const profiles = await getAllProfiles();
  const records = await (async ()=>{
    const db = await openDB();
    return new Promise((res,rej)=>{
      const tx = db.transaction('records','readonly');
      const store = tx.objectStore('records');
      const q = store.getAll();
      q.onsuccess = ()=>res(q.result);
      q.onerror = ()=>rej(q.error);
    });
  })();
  return { exportedAt: new Date().toISOString(), profiles, records };
}

// Import JSON (merge)
async function importJson(data){
  const db = await openDB();
  return new Promise(async (res,rej)=>{
    try{
      // naive merge: add profiles, then add records (relink if needed)
      for(const p of data.profiles || []){
        // remove id to avoid collision, but keep metadata
        const copy = Object.assign({}, p);
        delete copy.id;
        const newId = await addProfile(copy);
        // map old id -> new id
        p.__newId = newId;
      }
      for(const r of data.records || []){
        const copy = Object.assign({}, r);
        const oldUserId = r.userId;
        const mapping = (data.profiles || []).find(pp=>pp.id===oldUserId);
        if(mapping && mapping.__newId) copy.userId = mapping.__newId;
        else {
          // keep as is if profile existed already
        }
        delete copy.id;
        await addRecord(copy);
      }
      res(true);
    }catch(err){ rej(err); }
  });
}
