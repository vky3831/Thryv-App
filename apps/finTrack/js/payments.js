// payments.js - manage periodic payments and history
function makePaymentObject(profileId, data){
  return {
    profileId,
    title: data.title,
    type: data.type,
    cycle: data.cycle,
    dateText: data.dateText||'',
    notes: data.notes||'',
    createdAt: new Date().toISOString()
  };
}

async function addPayment(profileId, data){
  const obj = makePaymentObject(profileId, data);
  return await add('payments', obj);
}

async function updatePayment(id, data){
  const p = await getByKey('payments', id);
  if(!p) throw new Error('Not found');
  Object.assign(p, data);
  await put('payments', p);
  return p;
}

async function deletePayment(id){
  await remove('payments', id);
  // optionally cascade remove history entries for this payment
  const all = await getAll('history');
  for(const h of all.filter(x=>x.paymentId===id)) await remove('history', h.id);
}

async function listPaymentsByProfile(profileId){
  const all = await getAll('payments');
  return all.filter(p => p.profileId === profileId);
}

// history
async function markPaid(profileId, paymentId, remarks, datePaid){
  const entry = { profileId, paymentId, remarks: remarks||'', datePaid: datePaid? new Date(datePaid).toISOString() : new Date().toISOString() };
  return await add('history', entry);
}

async function listHistory(profileId){
  const all = await getAll('history');
  return all.filter(h => h.profileId === profileId).sort((a,b)=> new Date(b.datePaid) - new Date(a.datePaid));
}

// helper: check if a payment occurs in given month/year
function occursInMonth(payment, month, year){
  // payment.dateText stores either:
  // - monthly: "05" or "5"
  // - weekly: "Monday"
  // - half-yearly/quarterly/yearly: "DD/MM"
  // - once: "DD/MM/YYYY"
  const c = payment.cycle;
  const dt = payment.dateText || '';
  if(!dt) return false;
  if(c === 'monthly'){
    const day = parseInt(dt,10);
    if(isNaN(day)) return false;
    // any month has that day (if day > daysInMonth, skip)
    const daysInMonth = new Date(year, month+1, 0).getDate();
    return day <= daysInMonth;
  } else if(c === 'weekly'){
    // dt is weekday name
    const weekdayMap = { 'sunday':0,'monday':1,'tuesday':2,'wednesday':3,'thursday':4,'friday':5,'saturday':6 };
    const w = weekdayMap[dt.toLowerCase()];
    if(w===undefined) return false;
    // there is at least one occurrence of that weekday in the month
    // always true if valid weekday
    return true;
  } else if(c === 'half-yearly' || c==='quarterly' || c==='yearly'){
    // dt: DD/MM
    const parts = dt.split('/');
    if(parts.length < 2) return false;
    const day = parseInt(parts[0],10), monthNum = parseInt(parts[1],10)-1;
    if(isNaN(day) || isNaN(monthNum)) return false;
    if(c==='yearly'){
      return monthNum === month;
    } else if(c==='half-yearly'){
      // assume two months: monthNum and (monthNum+6)%12
      return monthNum === month || ((monthNum+6)%12) === month;
    } else if(c==='quarterly'){
      // months every 3 months
      const months = [monthNum, (monthNum+3)%12, (monthNum+6)%12, (monthNum+9)%12];
      return months.includes(month);
    }
  } else if(c==='once'){
    // dt: DD/MM/YYYY
    const parts = dt.split('/');
    if(parts.length<3) return false;
    const d = parseInt(parts[0],10), m = parseInt(parts[1],10)-1, y = parseInt(parts[2],10);
    return m===month && y===year;
  }
  return false;
}

// payments due in given month
async function paymentsForMonth(profileId, month, year){
  const list = await listPaymentsByProfile(profileId);
  return list.filter(p => occursInMonth(p, month, year));
}


async function isPaymentPaidForMonth(paymentId, month, year){
  const hist = await getAll('history');
  return hist.some(h => {
    const dt = new Date(h.datePaid);
    return h.paymentId === paymentId &&
           dt.getMonth() === month &&
           dt.getFullYear() === year;
  });
}
