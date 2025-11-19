// auth.js - profile creation and passkey handling
async function hashPasskey(pass){
  const enc = new TextEncoder().encode(pass);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function createProfile(name, passkey){
  const passHash = await hashPasskey(passkey);
  const profile = { name, passHash, createdAt: new Date().toISOString() };
  const id = await add('profiles', profile);
  return { ...profile, id };
}

async function verifyProfile(profileId, passkey){
  const p = await getByKey('profiles', profileId);
  if(!p) return false;
  const h = await hashPasskey(passkey);
  return h === p.passHash;
}

async function updateProfileName(profileId, newName){
  const p = await getByKey('profiles', profileId);
  if(!p) throw new Error('Profile not found');
  p.name = newName;
  await put('profiles', p);
  return p;
}
