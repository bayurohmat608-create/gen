const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
let state = null;
let roomMode = 'free';
let typing = null;
let agentDrafts = [
  {name:'Agent A', provider:'openai', model:'', persona:'focus', api_key_env:'OPENAI_API_KEY', base_url:'', max_output_tokens:700},
  {name:'Agent B', provider:'gemini', model:'', persona:'mbul', api_key_env:'GEMINI_API_KEY', base_url:'', max_output_tokens:700},
];

async function api(path, opts={}) {
  const res = await fetch(path, {headers:{'Content-Type':'application/json'}, ...opts});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
function fmtTime(iso){try{return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});}catch{return ''}}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function agentMetaByName(name){return state?.config?.agents?.find(a=>a.name===name) || {};}
function renderMessage(m){
  const cls = m.role==='user' ? 'user' : (m.speaker==='Agent B' ? 'agent-b' : 'agent-a');
  const meta = m.meta || agentMetaByName(m.speaker);
  const persona = m.role==='agent' && meta.persona ? `<span class="persona-tag">${esc(meta.persona)}</span>` : '';
  return `<div class="message-row ${cls}" data-id="${esc(m.id)}"><article class="message-card"><div class="message-head"><b>${esc(m.speaker)}</b>${persona}<span class="message-time">${fmtTime(m.created_at)}</span></div><div class="message-text">${esc(m.text)}</div></article></div>`;
}
function renderState(s){
  state=s;
  const live=s.running;
  const status = $('#statusLine');
  status.innerHTML=`<span class="dot ${live?'live':''}"></span> ${live?(s.paused?'paused':'live'):'idle'} · ${live?(typing?`${typing} mengetik…`:(s.topic||'room aktif')):'siap dimulai'}`;
  $('#topicText').textContent=s.topic||'Belum ada topik';
  $('#navTopic').textContent=s.topic||'Belum ada topik';
  $('#turnChip').textContent=`${s.turn_count||0} / ${s.turn_limit||8} turn`;
  $('#turnsInput').value=s.turn_limit||8;
  $('#modePill').textContent=(s.mode||roomMode).toUpperCase();
  roomMode=s.mode||roomMode;
  $$('.mini-pill').forEach(b=>b.classList.toggle('active',b.dataset.mode===roomMode));
  $('#pauseBtn').classList.toggle('hidden',!live);
  $('#pauseBtn').textContent=s.paused?'Resume':'Pause';
  $('#hintText').textContent=live?'Kirim pesan untuk nimbrung ke room':'Enter untuk mulai · Shift+Enter baris baru';
  renderMessages(s.messages||[]);
  hydrateSettings(s.config);
}
function renderMessages(messages){
  const host=$('#messages');
  const empty=$('#emptyState');
  const typingRow=$('#typingRow');
  host.querySelectorAll('.message-row').forEach(n=>n.remove());
  empty.classList.toggle('hidden',messages.length>0);
  messages.forEach(m=>typingRow.insertAdjacentHTML('beforebegin',renderMessage(m)));
  typingRow.classList.toggle('hidden',!typing);
  if(typing) $('#typingName').textContent=typing;
  requestAnimationFrame(()=>host.scrollTop=host.scrollHeight);
}
function renderAgentPanel(index){
  const a=agentDrafts[index]; const panel=$(`[data-panel="${index}"]`);
  const providers=['openai','anthropic','gemini','openai-compatible'];
  const personas=['default','calm','focus','mbul'];
  panel.innerHTML=`
    <div class="field"><label>Provider</label><select data-k="provider">${providers.map(x=>`<option ${a.provider===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label>Persona</label><select data-k="persona">${personas.map(x=>`<option ${a.persona===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="field full"><label>Model ID</label><input data-k="model" value="${esc(a.model)}" placeholder="exact model id dari provider"/></div>
    <div class="field"><label>API key env</label><input data-k="api_key_env" value="${esc(a.api_key_env)}"/></div>
    <div class="field"><label>Max output tokens</label><input data-k="max_output_tokens" type="number" min="64" max="16000" value="${a.max_output_tokens||700}"/></div>
    <div class="field full"><label>Base URL <small>(khusus OpenAI-compatible)</small></label><input data-k="base_url" value="${esc(a.base_url||'')}" placeholder="https://api.example.com"/></div>
    <div class="field full"><label>Pasang API key ke memory server</label><div class="key-row"><input type="password" data-key-input placeholder="Tidak disimpan ke disk"/><button type="button" class="secondary" data-key-btn>Pasang</button></div><small>${a.key_present?'Key terdeteksi untuk env ini.':'Belum ada key terdeteksi.'}</small></div>`;
  panel.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('input',()=>{const k=el.dataset.k;agentDrafts[index][k]=k==='max_output_tokens'?Number(el.value):el.value;}));
  $('[data-key-btn]',panel).onclick=async()=>{
    try{const value=$('[data-key-input]',panel).value;if(!value)throw new Error('API key kosong');await api('/api/key',{method:'POST',body:JSON.stringify({env:agentDrafts[index].api_key_env,value})});$('[data-key-input]',panel).value='';$('#settingsStatus').textContent='API key dipasang ke memory saja.';await refresh();}catch(e){$('#settingsStatus').textContent=e.message;}
  };
}
function hydrateSettings(cfg){
  if(cfg?.agents?.length===2){agentDrafts=cfg.agents.map(a=>({...a}));}
  renderAgentPanel(0); renderAgentPanel(1);
}
async function refresh(){try{renderState(await api('/api/state'));}catch(e){console.error(e)}}
async function submitComposer(){
  const input=$('#composerInput'); const text=input.value.trim(); if(!text)return;
  try{
    if(state?.running){await api('/api/message',{method:'POST',body:JSON.stringify({text})});input.value='';resizeComposer();}
    else{await api('/api/start',{method:'POST',body:JSON.stringify({topic:text,mode:roomMode,turns:Number($('#turnsInput').value)||8})});input.value='';resizeComposer();}
  }catch(e){alert(e.message)}
}
function resizeComposer(){const t=$('#composerInput');t.style.height='auto';t.style.height=Math.min(t.scrollHeight,150)+'px';}
function openSettings(){hydrateSettings(state?.config||{});$('#settingsDialog').showModal();}

$('#sendBtn').onclick=submitComposer;
$('#composerInput').addEventListener('input',resizeComposer);
$('#composerInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitComposer();}});
$$('.starter').forEach(b=>b.onclick=()=>{$('#composerInput').value=b.dataset.topic;resizeComposer();submitComposer();});
$$('.mini-pill').forEach(b=>b.onclick=()=>{roomMode=b.dataset.mode;$$('.mini-pill').forEach(x=>x.classList.toggle('active',x===b));$('#modePill').textContent=roomMode.toUpperCase();});
$('#stopBtn').onclick=async()=>{try{await api('/api/stop',{method:'POST',body:'{}'});}catch(e){alert(e.message)}};
$('#pauseBtn').onclick=async()=>{try{await api('/api/pause',{method:'POST',body:JSON.stringify({paused:!state?.paused})});}catch(e){alert(e.message)}};
$('#newRoomBtn').onclick=()=>{if(state?.running)return alert('Stop room dulu.');$('#composerInput').focus();$('#composerInput').value='';$('#sidebar').classList.remove('open');};
$('#settingsBtn').onclick=openSettings; $('#settingsBtnSide').onclick=openSettings;
$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open'); $('#closeSidebar').onclick=()=>$('#sidebar').classList.remove('open');
$$('.agent-tab').forEach(tab=>tab.onclick=()=>{$$('.agent-tab').forEach(x=>x.classList.toggle('active',x===tab));$$('.agent-panel').forEach(p=>p.classList.toggle('hidden',p.dataset.panel!==tab.dataset.agent));});
$('#saveSettingsBtn').onclick=async()=>{try{await api('/api/config',{method:'POST',body:JSON.stringify({agents:agentDrafts,turns:Number($('#turnsInput').value)||8,reveal_at_end:true})});$('#settingsStatus').textContent='Tersimpan.';await refresh();}catch(e){$('#settingsStatus').textContent=e.message;}};
$('#testDemoBtn').onclick=async()=>{try{$('#settingsDialog').close();const topic=$('#composerInput').value.trim()||'Halo';await api('/api/start',{method:'POST',body:JSON.stringify({topic,mode:roomMode,turns:Number($('#turnsInput').value)||8,demo:true})});}catch(e){alert(e.message)}};
$('#exportBtn').onclick=async()=>{try{const data=await api('/api/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`blindroom-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){alert(e.message)}};

const events=new EventSource('/api/events');
events.onmessage=(ev)=>{try{const packet=JSON.parse(ev.data);if(packet.event==='state')renderState(packet.data);if(packet.event==='message'){refresh();}if(packet.event==='typing'){typing=packet.data.active?packet.data.speaker:null;$('#typingRow').classList.toggle('hidden',!typing);if(typing)$('#typingName').textContent=typing;renderState({...state});}if(packet.event==='error'){alert(packet.data.message);refresh();}}catch(e){console.error(e)}};
events.onerror=()=>{$('#statusLine').innerHTML='<span class="dot"></span> reconnecting…';};
refresh();
