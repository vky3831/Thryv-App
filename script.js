// ------------------------------
// IndexedDB Setup
// ------------------------------
let db;

const request = indexedDB.open("ThryvDB", 1);
request.onupgradeneeded = function(e){
  db = e.target.result;
  if(!db.objectStoreNames.contains("profile")){
    db.createObjectStore("profile", { keyPath: "id" });
  }
};
request.onsuccess = function(e){
  db = e.target.result;
  initAuth();
};
request.onerror = function(e){
  console.error("IndexedDB error", e);
  alert("Unable to access IndexedDB. Thryv requires browser storage to run.");
};


// ------------------------------
// Authentication Logic
// ------------------------------
function initAuth(){
  // small delay to ensure DOM ready
  setTimeout(checkSession, 100);
}

function checkSession(){
  const logged = sessionStorage.getItem("loggedIn");

  if(logged){
    showApp();
  }else{
    showLogin();
  }
}

function showLogin(){
  document.getElementById("authModal").style.display = "flex";
  document.getElementById("appWrapper").classList.add("hidden");
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("authModal").setAttribute("aria-hidden","false");
  document.getElementById("appWrapper").setAttribute("aria-hidden","true");
}

function showApp(){
  document.getElementById("welcomeScreen").style.display = "block";
  document.getElementById("appFrame").classList.add("hidden");

  document.getElementById("authModal").style.display = "none";
  document.getElementById("appWrapper").classList.remove("hidden");
  document.getElementById("logoutBtn").style.display = "block";
  document.getElementById("authModal").setAttribute("aria-hidden","true");
  document.getElementById("appWrapper").setAttribute("aria-hidden","false");
}


// ------------------------------
// Create / Login Profile
// ------------------------------
function loginOrCreate(){
  const nameEl = document.getElementById("userName");
  const passEl = document.getElementById("userPass");
  const name = nameEl.value.trim();
  const pass = passEl.value.trim();

  if(!name || !pass){
    alert("Please enter both name & passkey");
    return;
  }

  const tx = db.transaction("profile", "readwrite");
  const store = tx.objectStore("profile");

  const getReq = store.get(1);
  getReq.onsuccess = function(){
    const profile = getReq.result;

    // First Time: Create Profile
    if(!profile){
      store.put({ id:1, name, pass });
      sessionStorage.setItem("loggedIn", "yes");
      // clear inputs (not necessary but nice)
      nameEl.value = "";
      passEl.value = "";
      showApp();
      return;
    }

    // Existing: Validate Login
    if(profile.name === name && profile.pass === pass){
      sessionStorage.setItem("loggedIn", "yes");
      nameEl.value = "";
      passEl.value = "";
      showApp();
    }else{
      alert("Invalid name or passkey!");
      passEl.value = "";
      passEl.focus();
    }
  };
  getReq.onerror = function(e){
    console.error("Error reading profile", e);
    alert("An error occurred while accessing profile.");
  };
}


// ------------------------------
// Auto Logout when browser/tab closes
// ------------------------------
window.addEventListener("beforeunload", () => {
  try { sessionStorage.removeItem("loggedIn"); } catch(e){}
});

function logout(){
  sessionStorage.removeItem("loggedIn");
  showLogin();
}


function deleteProfile(){
  if(!confirm("Delete entire profile and all associated data? This cannot be undone.")) return;

  const userId = currentUser.id;

  // delete profile
  let tx1 = db.transaction("profiles", "readwrite");
  tx1.objectStore("profiles").delete(userId);

  // delete all entries of this user
  let tx2 = db.transaction("entries", "readwrite");
  let store = tx2.objectStore("entries");

  store.openCursor().onsuccess = function(e){
    const cursor = e.target.result;
    if(cursor){
      if(cursor.value.userId === userId) cursor.delete();
      cursor.continue();
    }
  };

  alert("Profile deleted successfully.");

  sessionStorage.removeItem("loggedIn");
  location.reload();
}


// ------------------------------
// Your Existing App Loader
// ------------------------------
const apps=[
  {id:"medicycle",name:"MediCycle",path:"apps/medicycle/index.html"},
  {id:"finTrack",name:"FinTrack",path:"apps/finTrack/index.html"},
  {id:"dailyJournal",name:"DailyJournal",path:"apps/dailyJournal/index.html"},
  {id:"healthScale",name:"HealthScale",path:"apps/healthScale/index.html"}
];

function renderAppList(){
  const appList=document.getElementById("appList");
  appList.innerHTML = "";
  apps.forEach(app=>{
    const li=document.createElement("li");
    li.innerHTML=`<button onclick="loadApp('${app.path}')">${app.name}</button>`;
    appList.appendChild(li);
  });
}

function loadApp(path){
  document.getElementById("welcomeScreen").style.display = "none";
  document.getElementById("appFrame").classList.remove("hidden");

  const frame = document.getElementById("appFrame");
  frame.src = path;
}

function toggleSidebar(){
  document.getElementById("sidebar").classList.toggle("open");
}

// Render apps after DOM available
document.addEventListener("DOMContentLoaded", renderAppList);
