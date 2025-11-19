const authModal = new bootstrap.Modal(document.getElementById('authModal'), {
  backdrop: 'static',
  keyboard: false
});

function showAuthError(msg){
  const el=document.getElementById('authError');
  el.innerText=msg;
  el.style.display='block';
}

async function showInitialAuth(){
  const profile=await getProfile();
  document.getElementById('authError').style.display='none';
  document.getElementById('passkeyInput').value='';

  if(!profile){
    document.getElementById('firstTimeFields').style.display='block';
    document.getElementById('authTitle').innerText='First time setup — create passkey';

    document.getElementById('authSubmit').onclick=async()=>{
      const name=document.getElementById('userNameInput').value.trim();
      const pass=document.getElementById('passkeyInput').value;

      if(!name||!pass) return showAuthError('Please fill all fields');

      await saveProfile({id:'profile',name,passkey:pass});
      authModal.hide();
      afterLogin();
    };
    authModal.show();
  } else {
      afterLogin();
  }
}
