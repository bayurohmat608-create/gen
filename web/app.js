const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];

let state = null;
let roomMode = 'free';
let typing = null;
let discoveredModels = [[], []];
let agentDrafts = [
  {name:'Agent A', provider:'openai', model:'', persona:'focus', api_key_env:'OPENAI_API_KEY', base_url:'', max_output_tokens:700, key_present:false},
  {name:'Agent B', provider:'gemini', model:'', persona:'mbul', api_key_env:'GEMINI_API_KEY', base_url:'', max_output_tokens:700, key_present:false},
];

const DEFAULT_ENV = {
  openai:'OPENAI_API_KEY',
  anthropic:'ANTHROPIC_API_KEY',
  gemini:'GEMINI_API_KEY',
  'openai-compatible':'OPENAI_COMPAT_API_KEY'
};

const PROVIDER_META = {
  openai:{
    label:'OpenAI Platform',
    auth:'API key',
    link:'https://platform.openai.com/api-keys',
    linkText:'Buat / kelola API key',
    note:'Login ChatGPT dan langganan ChatGPT terpisah dari akses API. BlindRoom menghubungkan OpenAI Platform dengan API key.'
  },
  anthropic:{
    label:'Anthropic',
    auth:'API key',
    link:'https://console.anthropic.com/settings/keys',
    linkText:'Buka Anthropic Console',
    note:'Setelah terhubung, BlindRoom mengambil daftar model yang tersedia untuk key tersebut.'
  },
  gemini:{
    label:'Google Gemini API',
    auth:'API key',
    link:'https://aistudio.google.com/app/apikey',
    linkText:'Buka Google AI Studio',
    note:'Model diambil langsung dari endpoint models.list dan difilter ke model yang mendukung generateContent.'
  },
  'openai-compatible':{
    label:'OpenAI-compatible',
    auth:'API key / token',
    link:'',
    linkText:'',
    note:'Gunakan endpoint HTTPS atau localhost. BlindRoom akan mencoba GET /v1/models untuk discovery.'
  }
};

async function api(path, opts={}) {
  const res = await fetch(path, {headers:{'Content-Type':'application/json'}, ...opts});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function fmtTime(iso){
  try{return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});}
  catch{return ''}
}
function esc(s){
  return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
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
  $('#statusLine').innerHTML=`<span class="dot ${live?'live':''}"></span> ${live?(s.paused?'paused':'live'):'idle'} · ${live?(typing?`${typing} mengetik…`:(s.topic||'room aktif')):'siap dimulai'}`;
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
  if (!$('#settingsDialog').open) hydrateSettings(s.config);
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

function providerHelp(provider){
  const m=PROVIDER_META[provider]||PROVIDER_META['openai-compatible'];
  const link=m.link?`<a href="${m.link}" target="_blank" rel="noreferrer">${esc(m.linkText)} ↗</a>`:'';
  return `<div class="provider-help"><div><b>${esc(m.label)}</b><span>Auth: ${esc(m.auth)}</span></div><p>${esc(m.note)}</p>${link}</div>`;
}

function modelOptions(index, current){
  const rows=discoveredModels[index]||[];
  if(!rows.length) return '';
  return `<div class="field full discovered-models"><label>Model tersedia <span class="count-badge">${rows.length}</span></label><select data-model-picker><option value="">Pilih model dari provider…</option>${rows.map(m=>`<option value="${esc(m.id)}" ${m.id===current?'selected':''}>${esc(m.display_name||m.id)}${m.kind==='other'?' · other':''}</option>`).join('')}</select><small>Daftar ini berasal langsung dari provider untuk credential yang sedang terhubung.</small></div>`;
}

function renderAgentPanel(index){
  const a=agentDrafts[index];
  const panel=$(`[data-panel="${index}"]`);
  const providers=['openai','anthropic','gemini','openai-compatible'];
  const personas=['default','calm','focus','mbul'];
  const connected=!!a.key_present;
  panel.innerHTML=`
    <div class="connection-card full ${connected?'connected':''}">
      <div class="connection-main">
        <span class="connection-dot"></span>
        <div><b>${connected?'Provider terhubung':'Hubungkan penyedia'}</b><small>${connected?`${esc(a.provider)} · ${esc(a.api_key_env)}`:'Credential hanya disimpan di memory proses lokal.'}</small></div>
      </div>
      <span class="auth-badge">API KEY</span>
    </div>
    ${providerHelp(a.provider)}
    <div class="field"><label>Provider</label><select data-k="provider">${providers.map(x=>`<option value="${x}" ${a.provider===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label>Persona</label><select data-k="persona">${personas.map(x=>`<option value="${x}" ${a.persona===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="field full"><label>Model ID</label><input data-k="model" value="${esc(a.model)}" placeholder="Hubungkan provider untuk memuat model otomatis"/></div>
    ${modelOptions(index,a.model)}
    <div class="field"><label>API key env</label><input data-k="api_key_env" value="${esc(a.api_key_env)}"/></div>
    <div class="field"><label>Max output tokens</label><input data-k="max_output_tokens" type="number" min="64" max="16000" value="${a.max_output_tokens||700}"/></div>
    <div class="field full ${a.provider==='openai-compatible'?'':'muted-field'}"><label>Base URL <small>(OpenAI-compatible)</small></label><input data-k="base_url" value="${esc(a.base_url||'')}" placeholder="https://api.example.com" ${a.provider==='openai-compatible'?'':'disabled'}/></div>
    <div class="field full">
      <label>${connected?'Refresh model / ganti credential':'Hubungkan credential'}</label>
      <div class="connect-row">
        <input type="password" data-key-input autocomplete="off" placeholder="${connected?'Kosongkan untuk memakai key yang sudah terhubung':'Tempel API key di sini'}"/>
        <button type="button" class="primary" data-connect-btn>${connected?'Refresh model':'Hubungkan'}</button>
        ${connected?'<button type="button" class="secondary" data-disconnect-btn>Putus</button>':''}
      </div>
      <small>Key tidak ditulis ke blindroom.json, transcript, atau GitHub. Restart server akan menghapus key yang dimasukkan lewat UI.</small>
    </div>`;

  panel.querySelectorAll('[data-k]').forEach(el=>{
    el.addEventListener('input',()=>{
      const k=el.dataset.k;
      const oldProvider=agentDrafts[index].provider;
      const oldDefault=DEFAULT_ENV[oldProvider];
      const value=k==='max_output_tokens'?Number(el.value):el.value;
      agentDrafts[index][k]=value;
      if(k==='provider'){
        const next=value;
        if(agentDrafts[index].api_key_env===oldDefault) agentDrafts[index].api_key_env=DEFAULT_ENV[next];
        if(next!=='openai-compatible') agentDrafts[index].base_url='';
        agentDrafts[index].key_present=false;
        discoveredModels[index]=[];
        renderAgentPanel(index);
      }
    });
  });

  const picker=$('[data-model-picker]',panel);
  if(picker) picker.addEventListener('change',()=>{
    if(!picker.value) return;
    agentDrafts[index].model=picker.value;
    const modelInput=$('[data-k="model"]',panel);
    if(modelInput) modelInput.value=picker.value;
  });

  $('[data-connect-btn]',panel).onclick=async()=>{
    const button=$('[data-connect-btn]',panel);
    const key=$('[data-key-input]',panel).value;
    button.disabled=true;
    button.textContent='Menghubungkan…';
    $('#settingsStatus').textContent='';
    try{
      const payload={provider:a.provider,env:a.api_key_env,base_url:a.base_url||''};
      let data;
      if(key){
        data=await api('/api/provider/connect',{method:'POST',body:JSON.stringify({...payload,key})});
      }else{
        data=await api('/api/provider/models',{method:'POST',body:JSON.stringify(payload)});
      }
      discoveredModels[index]=data.models||[];
      agentDrafts[index].key_present=true;
      if(!agentDrafts[index].model && discoveredModels[index].length) agentDrafts[index].model=discoveredModels[index][0].id;
      $('#settingsStatus').textContent=`Terhubung. ${discoveredModels[index].length} model ditemukan.`;
      renderAgentPanel(index);
    }catch(e){
      $('#settingsStatus').textContent=e.message;
      button.disabled=false;
      button.textContent=connected?'Refresh model':'Hubungkan';
    }
  };

  const disconnect=$('[data-disconnect-btn]',panel);
  if(disconnect) disconnect.onclick=async()=>{
    try{
      await api('/api/provider/disconnect',{method:'POST',body:JSON.stringify({provider:a.provider,env:a.api_key_env})});
      agentDrafts[index].key_present=false;
      discoveredModels[index]=[];
      $('#settingsStatus').textContent='Provider diputus dari memory server.';
      renderAgentPanel(index);
    }catch(e){$('#settingsStatus').textContent=e.message;}
  };
}

function hydrateSettings(cfg){
  if(cfg?.agents?.length===2) agentDrafts=cfg.agents.map(a=>({...a}));
  renderAgentPanel(0);
  renderAgentPanel(1);
}

async function refresh(){
  try{renderState(await api('/api/state'));}
  catch(e){console.error(e)}
}

async function submitComposer(){
  const input=$('#composerInput');
  const text=input.value.trim();
  if(!text)return;
  try{
    if(state?.running){
      await api('/api/message',{method:'POST',body:JSON.stringify({text})});
      input.value='';resizeComposer();
    }else{
      await api('/api/start',{method:'POST',body:JSON.stringify({topic:text,mode:roomMode,turns:Number($('#turnsInput').value)||8})});
      input.value='';resizeComposer();
    }
  }catch(e){alert(e.message)}
}

function resizeComposer(){
  const t=$('#composerInput');
  t.style.height='auto';
  t.style.height=Math.min(t.scrollHeight,150)+'px';
}
function openSettings(){
  hydrateSettings(state?.config||{});
  $('#settingsDialog').showModal();
}

$('#sendBtn').onclick=submitComposer;
$('#composerInput').addEventListener('input',resizeComposer);
$('#composerInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitComposer();}});
$$('.starter').forEach(b=>b.onclick=()=>{$('#composerInput').value=b.dataset.topic;resizeComposer();submitComposer();});
$$('.mini-pill').forEach(b=>b.onclick=()=>{roomMode=b.dataset.mode;$$('.mini-pill').forEach(x=>x.classList.toggle('active',x===b));$('#modePill').textContent=roomMode.toUpperCase();});
$('#stopBtn').onclick=async()=>{try{await api('/api/stop',{method:'POST',body:'{}'});}catch(e){alert(e.message)}};
$('#pauseBtn').onclick=async()=>{try{await api('/api/pause',{method:'POST',body:JSON.stringify({paused:!state?.paused})});}catch(e){alert(e.message)}};
$('#newRoomBtn').onclick=()=>{if(state?.running)return alert('Stop room dulu.');$('#composerInput').focus();$('#composerInput').value='';$('#sidebar').classList.remove('open');};
$('#settingsBtn').onclick=openSettings;
$('#settingsBtnSide').onclick=openSettings;
$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
$('#closeSidebar').onclick=()=>$('#sidebar').classList.remove('open');
$$('.agent-tab').forEach(tab=>tab.onclick=()=>{
  $$('.agent-tab').forEach(x=>x.classList.toggle('active',x===tab));
  $$('.agent-panel').forEach(p=>p.classList.toggle('hidden',p.dataset.panel!==tab.dataset.agent));
});
$('#saveSettingsBtn').onclick=async()=>{
  try{
    await api('/api/config',{method:'POST',body:JSON.stringify({agents:agentDrafts,turns:Number($('#turnsInput').value)||8,reveal_at_end:true})});
    $('#settingsStatus').textContent='Tersimpan.';
    $('#settingsDialog').close();
    await refresh();
  }catch(e){$('#settingsStatus').textContent=e.message;}
};
$('#testDemoBtn').onclick=async()=>{
  try{
    $('#settingsDialog').close();
    const topic=$('#composerInput').value.trim()||'Halo';
    await api('/api/start',{method:'POST',body:JSON.stringify({topic,mode:roomMode,turns:Number($('#turnsInput').value)||8,demo:true})});
  }catch(e){alert(e.message)}
};
$('#exportBtn').onclick=async()=>{
  try{
    const data=await api('/api/export');
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`blindroom-${Date.now()}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }catch(e){alert(e.message)}
};

const events=new EventSource('/api/events');
events.onmessage=(ev)=>{
  try{
    const packet=JSON.parse(ev.data);
    if(packet.event==='state') renderState(packet.data);
    if(packet.event==='message') refresh();
    if(packet.event==='typing'){
      typing=packet.data.active?packet.data.speaker:null;
      $('#typingRow').classList.toggle('hidden',!typing);
      if(typing) $('#typingName').textContent=typing;
      if(state) renderState({...state});
    }
    if(packet.event==='error'){alert(packet.data.message);refresh();}
  }catch(e){console.error(e)}
};
events.onerror=()=>{$('#statusLine').innerHTML='<span class="dot"></span> reconnecting…';};
refresh();
