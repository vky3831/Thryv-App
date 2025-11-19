function escapeHtml(t){
  return t.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

async function renderEntries(){
  const all=await getAllEntriesDescending();
  const root=document.getElementById('entriesList');
  root.innerHTML='';

  if(!all.length){
    root.innerHTML="<div class='text-muted'>No entries yet</div>";
    return;
  }

  all.forEach(e=>{
    const id='entry-'+e.date;
    const div=document.createElement('div');
    div.className='accordion-item mb-2';

    div.innerHTML=`
      <h2 class="accordion-header">
        <button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#c-${id}">
          ${new Date(e.date).toLocaleDateString()}
        </button>
      </h2>
      <div id="c-${id}" class="accordion-collapse collapse">
        <div class="accordion-body">
          <div class="entry-card mb-2">${escapeHtml(e.content)}</div>
          <button class="btn btn-sm btn-outline-primary" data-action="load" data-date="${e.date}">Load</button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-date="${e.date}">Delete</button>
        </div>
      </div>
    `;
    root.appendChild(div);
  });
}
