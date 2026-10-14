import { createClient } from '@supabase/supabase-js'
import { publicKey } from './config.js'
const db = createClient('https://qtmxzqpfhlamcwjqaqfx.supabase.co', publicKey, { auth: { storageKey: 'frost-maintenance-reborn-v1', detectSessionInUrl: false } })
const el = (id) => document.getElementById(id)
const categories = {
  vehicle: [['safety_inspection','Safety Inspection (PMI)'],['mot_certificate','MOT Certificate'],['repair_invoice','Repair Invoice'],['defect_sheet','Defect Sheet'],['brake_test_inspection','Brake Test'],['tachograph_calibration','Tachograph Calibration'],['loler_certificate','LOLER Certificate'],['road_tax','Road Tax']],
  trailer: [['pmi_inspection','PMI Inspection'],['mot_certificate','MOT Certificate'],['repair_invoice','Repair Invoice'],['defect_sheet','Defect Sheet'],['brake_test_inspection','Brake Test'],['loler_certificate','LOLER Certificate']],
}
let kind = 'vehicle', fleet = [], submission = null, busy = false, loggedIn = false
function ukDate() { return new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date()) }
function resetDate() { el('inspectionDate').value = ukDate(); el('inspectionDate').max = ukDate() }
function status(message, error = false) { el('statusMessage').hidden = false; el('statusMessage').textContent = message; el('statusMessage').className = error ? 'error' : '' }
async function rpc(name, params) { const result = await db.rpc(name, params); if (result.error) throw new Error(result.error.message); return result.data }
function populateAssets() {
  const select = el('assetSelect'), previous = select.value
  select.replaceChildren(new Option('-- Select '+(kind === 'vehicle' ? 'Vehicle Registration' : 'Trailer Number')+' --', ''))
  for (const asset of fleet.filter((item) => item.kind === kind)) select.add(new Option(asset.label, asset.id))
  if ([...select.options].some((option) => option.value === previous)) select.value = previous
}
function toggleAsset(value) {
  if (busy) return
  kind = value; submission = null
  el('btnVehicle').classList.toggle('active', kind === 'vehicle'); el('btnTrailer').classList.toggle('active', kind === 'trailer')
  el('docType').replaceChildren(...categories[kind].map(([value,label]) => new Option(label,value)))
  populateAssets()
}
async function loadFleet() { fleet = await rpc('maintenance_portal_fleet'); populateAssets() }
async function showApp() {
  await loadFleet() // Membership is checked on the server before any fleet data appears.
  loggedIn = true; el('loginCard').hidden = true; el('mainCard').hidden = false; resetDate(); toggleAsset(kind)
}
el('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); el('loginBtn').disabled = true; el('loginBtn').textContent = 'Authenticating…'; el('loginError').hidden = true
  try {
    const { error } = await db.auth.signInWithPassword({ email:'maintenance-'+el('loginEmail').value.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'@frost.tms-reborn.invalid',password:el('loginPassword').value })
    if (error) throw error
    await showApp(); el('loginPassword').value = ''
  } catch (error) { el('loginError').hidden = false; el('loginError').textContent = error.message; await db.auth.signOut({ scope:'local' }) }
  finally { el('loginBtn').disabled = false; el('loginBtn').textContent = 'Sign in' }
})
el('logoutBtn').addEventListener('click', async () => { if (!busy) { await db.auth.signOut({scope:'local'}); location.reload() } })
el('btnVehicle').addEventListener('click', () => toggleAsset('vehicle'))
el('btnTrailer').addEventListener('click', () => toggleAsset('trailer'))
for (const id of ['assetSelect','docType','inspectionDate','fileInput']) el(id).addEventListener('change', () => { submission = null })

function fileMime(file) {
  const mime = { pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp' }[file.name.split('.').pop().toLowerCase()]
  if (!mime || (file.type && file.type !== mime)) throw new Error('Use PDF, JPG, PNG or WebP files.')
  return mime
}
async function checkSignature(file, mime) {
  const bytes = new Uint8Array(await file.slice(0,12).arrayBuffer())
  const text = String.fromCharCode(...bytes)
  const valid = mime === 'application/pdf' ? text.startsWith('%PDF-') : mime === 'image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 : mime === 'image/png' ? [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n) : text.startsWith('RIFF') && text.slice(8,12)==='WEBP'
  if (!valid) throw new Error(file.name+' does not contain a valid '+mime.split('/')[1]+' file.')
}
el('uploadForm').addEventListener('submit', async (event) => {
  event.preventDefault(); if (busy) return
  const files = [...el('fileInput').files], assetId = el('assetSelect').value, type = el('docType').value, date = el('inspectionDate').value
  if (!assetId) return status('Select an asset.',true)
  if (!files.length || files.length>10) return status('Choose between 1 and 10 files per inspection.',true)
  if (!date || date>ukDate() || date<'2000-01-01') return status('Enter a valid inspection date, no later than today.',true)
  busy = true; const controls = [...el('uploadForm').elements]; controls.forEach((control) => { control.disabled = true }); el('logoutBtn').disabled = true
  try {
    for (const file of files) { if (!file.size || file.size>25*1048576 || file.name.length>200) throw new Error('Use non-empty files up to 25 MB with names no longer than 200 characters.'); await checkSignature(file,fileMime(file)) }
    if (!submission) submission = { id:crypto.randomUUID(), files:files.map((file) => ({ id:crypto.randomUUID(),file,done:false })) }
    for (let index=0;index<submission.files.length;index++) {
      const entry = submission.files[index]; if (entry.done) continue
      status('Uploading '+(index+1)+' of '+files.length+'…'); el('submitBtn').textContent = 'Synchronising…'
      const row = await rpc('maintenance_portal_begin_upload', { p_id:entry.id,p_submission_id:submission.id,p_asset_kind:kind,p_asset_id:assetId,p_document_type:type,p_inspection_date:date,p_file_name:entry.file.name,p_mime_type:fileMime(entry.file),p_size_bytes:entry.file.size })
      if (row.status === 'uploading') {
        const { error } = await db.storage.from(row.storage_bucket).upload(row.storage_path,entry.file,{contentType:row.mime_type,upsert:false})
        // A lost response can leave the immutable object stored. Finalise to verify it.
        if (error && !['409','Duplicate'].includes(String(error.statusCode)) && !/already exists|duplicate/i.test(error.message)) throw error
      }
      await rpc('maintenance_portal_finish_upload',{p_id:entry.id}); entry.done = true
    }
    const count = submission.files.length; submission = null; el('fileInput').value = ''; resetDate()
    status(count+' '+(count===1 ? 'document' : 'documents')+' uploaded successfully — awaiting Frost office authorisation.')
    void loadFleet().catch(() => {})
  } catch (error) { const completed = submission?.files.filter((entry)=>entry.done).length || 0; status(error.message+(completed ? ' '+completed+' file(s) already reached the office queue.' : '')+' Retry with the same selection to resume without duplicates.',true) }
  finally { busy = false; controls.forEach((control)=>{control.disabled=false}); el('logoutBtn').disabled=false; el('submitBtn').textContent='Confirm and upload records' }
})

let reportRevision=0
function row(title, lines, resolved=false) {
  const article = document.createElement('article'); article.className='report-row'+(resolved?' resolved':'')
  const h = document.createElement('h3'); h.textContent=title; article.append(h)
  for (const line of lines) { const p=document.createElement('p'); p.textContent=line; article.append(p) }
  return article
}
async function maintenanceRequests() {
  const revision=++reportRevision
  el('reportsTitle').textContent='Maintenance Requests'; el('reportsSubtitle').textContent='Defects sent to JCC by the office'; el('reportFilters').hidden=true
  el('reportContent').textContent='Loading maintenance requests…'
  try {
    const data=[]
    for(let offset=0;;offset+=50){
      const page=await rpc('list_vehicle_maintenance_requests',{p_offset:offset,p_limit:50})
      if(revision!==reportRevision)return
      data.push(...page); if(page.length<50)break
    }
    const labels={lights_indicators:'Lights & Indicators',tyre_condition:'Tyre Condition',wheel_nuts:'Wheel Nuts',mirrors:'Mirrors',window_screen:'Window Screen',bodywork:'Bodywork',wipers_washers:'Wipers/Washers',oil_level:'Oil Level',coolant_level:'Coolant Level',adblue_level:'AdBlue Level',air_lines_suzies:'Air Lines/Suzies',fifth_wheel_clip:'5th Wheel/Clip'}
    const stamp=(value)=>new Date(value).toLocaleString('en-GB',{timeZone:'Europe/London'})
    el('reportContent').replaceChildren(...data.map(item=>row(item.vehicle_registration+' · '+(item.repaired_at?'Repaired':'Awaiting repair'),[
      'Requested: '+stamp(item.requested_at), 'Check: '+stamp(item.checked_at)+' · '+item.driver_full_name,
      'Failed items: '+(Object.entries(item.checklist||{}).filter(([,passed])=>!passed).map(([key])=>labels[key]||key.replaceAll('_',' ')).join(', ')||'See defect notes'),
      item.defect_details||'No additional notes', ...(item.repaired_at?['Repair: '+item.repair_date+' · '+item.repair_carried_out_by,item.repair_work_carried_out]:[])
    ],!!item.repaired_at)))
    if(!data.length)el('reportContent').textContent='No maintenance requests have been sent to JCC.'
  }catch(error){if(revision===reportRevision)el('reportContent').textContent=error.message}
}
el('requestsBtn').addEventListener('click',()=>{el('reportsDialog').showModal();void maintenanceRequests()})
async function defects(resolved=false) {
  const revision=++reportRevision
  el('reportsTitle').textContent='Maintenance audit log'; el('reportsSubtitle').textContent=resolved?'Resolved vehicle defects':'Active defects'; el('reportFilters').hidden=false
  el('activeDefects').classList.toggle('active',!resolved); el('resolvedDefects').classList.toggle('active',resolved)
  el('reportContent').textContent='Loading reports…'
  try { const data=await rpc('maintenance_portal_defects',{p_resolved:resolved}); if(revision!==reportRevision)return; el('reportContent').replaceChildren(...data.map((item)=>row(item.label+' · '+item.kind,[item.defect_details||'No details recorded',new Date(item.checked_at).toLocaleString('en-GB'),...(item.repair_details?[item.repair_details]:[])],resolved))); if(!data.length)el('reportContent').textContent='No '+(resolved?'resolved':'active')+' defect reports.' }
  catch(error){if(revision===reportRevision)el('reportContent').textContent=error.message}
}
el('defectsBtn').addEventListener('click',()=>{el('reportsDialog').showModal();void defects()})
el('activeDefects').addEventListener('click',()=>void defects())
el('resolvedDefects').addEventListener('click',()=>void defects(true))
el('closeReports').addEventListener('click',()=>{reportRevision++;el('reportsDialog').close()})
el('reportsDialog').addEventListener('cancel',()=>{reportRevision++})
el('fleetBtn').addEventListener('click',async()=>{
  const revision=++reportRevision
  el('reportsTitle').textContent='Fleet status'; el('reportsSubtitle').textContent='Frost Transport Solutions'; el('reportFilters').hidden=true; el('reportsDialog').showModal(); el('reportContent').textContent='Loading fleet…'
  try { await loadFleet(); if(revision!==reportRevision)return; el('reportContent').replaceChildren(...fleet.map((asset)=>row(asset.label+' · '+asset.kind,['Status: '+asset.condition_status.replaceAll('_',' '),'PMI due: '+(asset.pmi_due||'Not entered'),'Brake test due: '+(asset.brake_due||'Not entered'),'MOT due: '+(asset.mot_due||'Not entered')]))); if(!fleet.length)el('reportContent').textContent='No active fleet assets.' }catch(error){if(revision===reportRevision)el('reportContent').textContent=error.message}
})
window.addEventListener('focus',()=>{if(loggedIn&&!busy)void loadFleet().catch((error)=>status(error.message,true))})
db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'&&loggedIn){loggedIn=false;fleet=[];submission=null;el('reportsDialog').close();el('mainCard').hidden=true;el('loginCard').hidden=false}})
const {data:{session}}=await db.auth.getSession()
if(session){try{await showApp()}catch(error){el('loginError').hidden=false;el('loginError').textContent=error.message;await db.auth.signOut({scope:'local'})}}
