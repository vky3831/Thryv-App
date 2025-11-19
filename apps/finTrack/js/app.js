// app.js - initialization
document.addEventListener('DOMContentLoaded', async ()=>{
  await openDB();
  await refreshProfilesList();
  // make sure modals work: login modal submitted in ui.js
});
