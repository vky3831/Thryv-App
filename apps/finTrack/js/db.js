// db.js - IndexedDB wrapper for FinTrack
const DB_NAME = 'fintrack_db_v1';
const DB_VERSION = 1;
let dbPromise = null;

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if(!idb.objectStoreNames.contains('profiles')){
        const s = idb.createObjectStore('profiles', { keyPath: 'id', autoIncrement: true });
        s.createIndex('name', 'name', { unique: false });
      }
      if(!idb.objectStoreNames.contains('payments')){
        const s = idb.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
        s.createIndex('profileId', 'profileId', { unique: false });
      }
      if(!idb.objectStoreNames.contains('history')){
        const s = idb.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        s.createIndex('profileId', 'profileId', { unique: false });
        s.createIndex('paymentId', 'paymentId', { unique: false });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

async function add(store, value){
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).add(value).onsuccess = (e) => res(e.target.result);
    tx.onerror = (e) => rej(e);
  });
}

async function put(store, value){
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value).onsuccess = (e) => res(e.target.result);
    tx.onerror = (e) => rej(e);
  });
}

async function getAll(store, index=null, key=null){
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    let req;
    if(index && key !== null) req = os.index(index).getAll(key);
    else req = os.getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function getByKey(store, key){
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function remove(store, key){
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key).onsuccess = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}

async function clearStore(store){
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear().onsuccess = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}

// Export and import functions for full DB snapshot
async function exportAll(){
  const profiles = await getAll('profiles');
  const payments = await getAll('payments');
  const history = await getAll('history');
  return { profiles, payments, history, exportedAt: new Date().toISOString() };
}

async function importAll(snapshot, merge=true){
  if(!snapshot) throw new Error('Invalid snapshot');
  if(!merge){
    await clearStore('profiles');
    await clearStore('payments');
    await clearStore('history');
  }
  const mapOldToNewProfile = {};
  // Add profiles
  for(const p of snapshot.profiles || []){
    const copy = Object.assign({}, p);
    delete copy.id; // allow auto increment
    const newId = await add('profiles', copy);
    mapOldToNewProfile[p.id] = newId;
  }
  // Add payments
  for(const pay of snapshot.payments || []){
    const copy = Object.assign({}, pay);
    delete copy.id;
    if(mapOldToNewProfile[pay.profileId]) copy.profileId = mapOldToNewProfile[pay.profileId];
    await add('payments', copy);
  }
  // Add history
  for(const h of snapshot.history || []){
    const copy = Object.assign({}, h);
    delete copy.id;
    if(mapOldToNewProfile[h.profileId]) copy.profileId = mapOldToNewProfile[h.profileId];
    await add('history', copy);
  }
  return true;
}
