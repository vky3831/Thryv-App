const DB_NAME = 'daily-journal-db';
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains('profile'))
        idb.createObjectStore('profile', { keyPath: 'id' });
      if (!idb.objectStoreNames.contains('entries')) {
        const store = idb.createObjectStore('entries', { keyPath: 'date' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

function getProfile() {
  return new Promise(res => {
    const tx = db.transaction('profile','readonly');
    tx.objectStore('profile').get('profile').onsuccess = e => res(e.target.result);
  });
}

function saveProfile(p) {
  return new Promise(res => {
    const tx = db.transaction('profile','readwrite');
    tx.objectStore('profile').put(p).onsuccess = () => res();
  });
}

function saveEntryObj(entry) {
  return new Promise(res => {
    entry.updatedAt = new Date().toISOString();
    const tx = db.transaction('entries','readwrite');
    tx.objectStore('entries').put(entry).onsuccess = () => res();
  });
}

function getEntry(date) {
  return new Promise(res => {
    const tx = db.transaction('entries','readonly');
    tx.objectStore('entries').get(date).onsuccess = e => res(e.target.result);
  });
}

function getAllEntriesDescending() {
  return new Promise(res => {
    const tx = db.transaction('entries','readonly');
    const req = tx.objectStore('entries').openCursor(null,'prev');
    const out=[];
    req.onsuccess=e=>{
      const c=e.target.result;
      if(c){out.push(c.value);c.continue();}
      else res(out);
    };
  });
}

function clearAllData(){
  return new Promise(res=>{
    const tx=db.transaction(['profile','entries'],'readwrite');
    tx.objectStore('profile').clear();
    tx.objectStore('entries').clear();
    tx.oncomplete=()=>res();
  });
}
