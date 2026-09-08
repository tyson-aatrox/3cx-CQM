let DATA=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=(v,s='')=>v===null||v===undefined||Number.isNaN(Number(v))?'—':`${Number(v).toFixed(Number(v)%1?2:0)}${s}`;
const badge=q=>`<span class="quality-badge ${q}">${q}</span>`;
const T={rtt_warn:100,rtt_poor:150,jitter_warn:20,jitter_poor:30,loss_warn:.5,loss_poor:1,mos_warn:4,mos_poor:3.5};
const fnum=v=>v===null||v===undefined||v===''||Number.isNaN(Number(v))?null:Number(v);
const bool=v=>v===true||v===1||v==='1'||String(v).toLowerCase()==='true';
function durationS(s){const p=String(s??'').split(':').map(Number);return p.length===3&&p.every(Number.isFinite)?p[0]*3600+p[1]*60+p[2]:0}
function lossPct(lost,packets){lost=fnum(lost);packets=fnum(packets);if(lost===null||packets===null||packets<=0)return null;return lost+packets?100*lost/(lost+packets):0}
function csvRows(text){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else quoted=false}else field+=c}else if(c==='"')quoted=true;else if(c===','){row.push(field);field=''}else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field=''}else field+=c}if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row)}return rows}
function csvObjects(text){const rows=csvRows(text.replace(/^\uFEFF/,''));if(!rows.length)return[];const h=rows[0].map(x=>x.trim());return rows.slice(1).filter(r=>r.some(x=>x!=='')).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
function endpoint(p={}){return{number:p.Number||'',endpoint_type:p.EndpointType||'',address:p.AddressStr||'',tunnel_address:p.TunAddressStr||'',pbx_address:p.PbxAddress||'',codec:p.Codec||'',user_agent:p.UserAgent||'',inbound:bool(p.Inbound),duration:p.Duration||'',duration_s:durationS(p.Duration),rtt:fnum(p.RTT),rx_jitter:fnum(p.RxJitter),tx_jitter:fnum(p.TxJitter),rx_lost:fnum(p.RxLost),tx_lost:fnum(p.TxLost),rx_packets:fnum(p.RxPackets),tx_packets:fnum(p.TxPackets),rx_loss_pct:lossPct(p.RxLost,p.RxPackets),tx_loss_pct:lossPct(p.TxLost,p.TxPackets),mos_from_pbx:fnum(p.MOSFromPBX),mos_to_pbx:fnum(p.MOSToPBX),summary:p.Summary}}
function state(name,v){if(v===null)return'na';if(name==='rtt')return v>T.rtt_poor?'poor':v>T.rtt_warn?'warning':'good';if(name==='jitter')return v>T.jitter_poor?'poor':v>T.jitter_warn?'warning':'good';if(name==='loss')return v>T.loss_poor?'poor':v>T.loss_warn?'warning':'good';if(name==='mos'){if(v<=0)return'na';return v<T.mos_poor?'poor':v<T.mos_warn?'warning':'good'}return'na'}
function classifyLeg(p,suppressNoRtp=false){const checks=[['High RTT','rtt',p.rtt],['High receive jitter','jitter',p.rx_jitter],['High transmit jitter','jitter',p.tx_jitter],['Receive packet loss','loss',p.rx_loss_pct],['Transmit packet loss','loss',p.tx_loss_pct],['Low MOS from PBX','mos',p.mos_from_pbx],['Low MOS to PBX','mos',p.mos_to_pbx]];const states=[],issues=[];for(const [label,n,v] of checks){const st=state(n,v);states.push(st);if(st==='warning'||st==='poor')issues.push(label)}if(!suppressNoRtp&&p.tx_packets&&p.tx_packets>100&&(p.rx_packets||0)===0){issues.push('No RTP received');states.push('poor')}const measurable=[p.rtt,p.rx_jitter,p.tx_jitter,p.rx_loss_pct,p.tx_loss_pct].some(v=>v!==null)||[p.mos_from_pbx,p.mos_to_pbx].some(v=>v!==null&&v>0);const q=states.includes('poor')?'Poor':states.includes('warning')?'Warning':'Good';return[measurable?q:'Inconclusive',issues]}
function rtcpUnavailableForLeg(call,leg){if(!/No valid RTCP|No RTCP/i.test(call.reason||''))return false;const reason=String(call.reason||'').toLowerCase(),num=String(leg.number||'').toLowerCase();if(num&&reason.includes(num))return true;if(leg.endpoint_type==='EXTERNAL')return true;return false}
function includedLegs(call,excludeNoRtcp){return [call.party1,call.party2].filter(l=>!excludeNoRtcp||!rtcpUnavailableForLeg(call,l))}
function effectiveQuality(call,excludeNoRtcp){if(!excludeNoRtcp)return call.quality;const qs=includedLegs(call,true).map(l=>classifyLeg(l)[0]);return qs.includes('Poor')?'Poor':qs.includes('Warning')?'Warning':qs.includes('Good')?'Good':'Inconclusive'}
function effectiveDomain(call,excludeNoRtcp){if(!excludeNoRtcp)return call.fault_domain;const legs=includedLegs(call,true);if(!legs.length)return'Insufficient Data';const internal=legs.filter(l=>['LOCAL','TUNNEL'].includes(l.endpoint_type));const external=legs.filter(l=>l.endpoint_type==='EXTERNAL');const qs=legs.map(l=>classifyLeg(l)[0]);if(qs.includes('Poor')){if(internal.some(l=>classifyLeg(l)[0]==='Poor')&&!external.some(l=>classifyLeg(l)[0]==='Poor'))return'Customer / Site';if(external.some(l=>classifyLeg(l)[0]==='Poor')&&!internal.some(l=>classifyLeg(l)[0]==='Poor'))return'Carrier / External';return'Multiple / End-to-End'}if(qs.includes('Warning')){if(internal.some(l=>classifyLeg(l)[0]==='Warning')&&!external.some(l=>classifyLeg(l)[0]==='Warning'))return'Customer / Site';if(external.some(l=>classifyLeg(l)[0]==='Warning')&&!internal.some(l=>classifyLeg(l)[0]==='Warning'))return'Carrier / External';return'Multiple / End-to-End'}return qs.includes('Good')?'No Fault Detected':'Insufficient Data'}
function faultDomain(p1,p2,reason){const internal=[p1,p2].find(p=>['LOCAL','TUNNEL'].includes(p.endpoint_type));const external=[p1,p2].find(p=>p.endpoint_type==='EXTERNAL');const [q1]=classifyLeg(p1),[q2]=classifyLeg(p2);const [iq]=internal?classifyLeg(internal):['Inconclusive'];const missing=/No valid RTCP|No RTCP/i.test(reason||'');const [eq]=external?classifyLeg(external,missing):['Inconclusive'];if(internal&&iq==='Poor'&&external&&eq!=='Poor')return['Customer / Site','Degradation is concentrated on the local/tunnel endpoint.'];if(external&&eq==='Poor'&&internal&&iq!=='Poor')return['Carrier / External','Degradation is concentrated on the external media endpoint.'];if(internal&&iq==='Warning'&&external&&eq==='Good')return['Customer / Site','Warning-level degradation appears on the local/tunnel endpoint.'];if(external&&eq==='Warning'&&internal&&iq==='Good')return['Carrier / External','Warning-level degradation appears on the external endpoint.'];if(missing)return internal&&['Good','Warning'].includes(iq)?['Insufficient External Data','The measurable site-side leg is usable, but the external RTCP report is missing.']:['Insufficient Data','3CX did not receive enough RTCP data to isolate the fault.'];if(q1==='Good'&&q2==='Good')return['No Fault Detected','Available media statistics are within configured thresholds.'];if(['Poor','Warning'].includes(q1)&&['Poor','Warning'].includes(q2))return['Multiple / End-to-End','Both media legs show degradation.'];return['Insufficient Data','Available statistics are not sufficient to isolate the fault.']}

function formatLocalDateTime(value){
  const raw=String(value||'').trim();
  if(!raw)return '—';
  // 3CX exports UTC timestamps as "YYYY-MM-DD HH:mm:ssZ". Normalise to ISO
  // before parsing so the browser converts UTC to its own local timezone.
  const normalised=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/i.test(raw)
    ? raw.replace(' ','T')
    : raw;
  const d=new Date(normalised);
  if(Number.isNaN(d.getTime()))return raw;
  const pad=n=>String(n).padStart(2,'0');
  const day=pad(d.getDate());
  const month=pad(d.getMonth()+1);
  const year=d.getFullYear();
  const h24=d.getHours();
  const hour=pad(h24%12||12);
  const minute=pad(d.getMinutes());
  const suffix=h24>=12?'PM':'AM';
  return `${day}/${month}/${year} ${hour}:${minute} ${suffix}`;
}

function parseCalls(text){const calls=[];for(const [idx,row] of csvObjects(text).entries()){if(String(row['Event ID']||'').trim()!=='10034')continue;let d;try{d=JSON.parse(row.Details||'{}')}catch{continue}const p1=endpoint(d.Party1||{}),p2=endpoint(d.Party2||{}),reason=String(d.Reason||'').trim(),missing=/No valid RTCP|No RTCP/i.test(reason);const [q1,i1]=classifyLeg(p1,missing&&p1.endpoint_type==='EXTERNAL'),[q2,i2]=classifyLeg(p2,missing&&p2.endpoint_type==='EXTERNAL');const [domain,diagnosis]=faultDomain(p1,p2,reason);const quality=[q1,q2].includes('Poor')?'Poor':[q1,q2].includes('Warning')?'Warning':[q1,q2].includes('Good')?'Good':'Inconclusive';calls.push({id:idx+1,date_time:row['Date & Time']||'',department:row.Department||'',source:row.Source||'',summary:d.Summary,overall_score:d.OverallScore,mos:fnum(d.MOS),transcoding:bool(d.Transcoding),reason,party1:p1,party2:p2,quality,fault_domain:domain,diagnosis,issues:[...new Set([...i1,...i2])].sort()})}return calls}
const avg=v=>{v=v.filter(x=>x!==null&&Number.isFinite(x));return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100:null};
function summary(calls,excludeNoRtcp=false){
  const allLegs=calls.flatMap(c=>[c.party1,c.party2]);
  const excludedLegs=excludeNoRtcp?calls.reduce((n,c)=>n+[c.party1,c.party2].filter(l=>rtcpUnavailableForLeg(c,l)).length,0):0;
  const legs=calls.flatMap(c=>includedLegs(c,excludeNoRtcp));
  const mos=legs.flatMap(l=>[l.mos_from_pbx,l.mos_to_pbx]).filter(v=>v&&v>0),loss=legs.flatMap(l=>[l.rx_loss_pct,l.tx_loss_pct]).filter(v=>v!==null),jitter=legs.flatMap(l=>[l.rx_jitter,l.tx_jitter]).filter(v=>v!==null&&v<10000),rtt=legs.map(l=>l.rtt).filter(v=>v!==null);
  const quality_counts=Object.fromEntries(['Good','Warning','Poor','Inconclusive'].map(k=>[k,calls.filter(c=>effectiveQuality(c,excludeNoRtcp)===k).length]));
  const domains={};calls.forEach(c=>{const d=effectiveDomain(c,excludeNoRtcp);domains[d]=(domains[d]||0)+1});
  const users={};
  for(const c of calls)for(const l of includedLegs(c,excludeNoRtcp)){
    if(!['LOCAL','TUNNEL'].includes(l.endpoint_type))continue;
    const key=l.number||l.address||'Unknown',u=users[key]??={name:key,calls:0,poor:0,warning:0,rtt:[],jitter:[],loss:[],address:l.address,tunnel_address:l.tunnel_address,user_agent:l.user_agent};
    u.calls++;const[q]=classifyLeg(l);if(q==='Poor')u.poor++;if(q==='Warning')u.warning++;if(l.rtt!==null)u.rtt.push(l.rtt);[l.rx_jitter,l.tx_jitter].forEach(v=>{if(v!==null&&v<10000)u.jitter.push(v)});[l.rx_loss_pct,l.tx_loss_pct].forEach(v=>{if(v!==null)u.loss.push(v)})
  }
  const userRows=Object.values(users).map(u=>({...u,avg_rtt:avg(u.rtt),max_jitter:u.jitter.length?Math.round(Math.max(...u.jitter)*100)/100:null,max_loss:u.loss.length?Math.round(Math.max(...u.loss)*1000)/1000:null})).sort((a,b)=>b.poor-a.poor||b.warning-a.warning||b.calls-a.calls);
  const measurableCalls=quality_counts.Good+quality_counts.Warning+quality_counts.Poor;
  const health_score=measurableCalls?Math.round((quality_counts.Good*100+quality_counts.Warning*70+quality_counts.Poor*25)/measurableCalls):null;
  const health_label=health_score==null?'No measurable data':health_score>=90?'Excellent':health_score>=75?'Good':health_score>=55?'Fair':'Poor';
  return{total_calls:calls.length,total_legs:allLegs.length,included_legs:legs.length,excluded_legs:excludedLegs,quality_counts,domains,health_score,health_label,measurable_calls:measurableCalls,transcoding:calls.filter(c=>c.transcoding).length,missing_rtcp:calls.filter(c=>/No valid RTCP|No RTCP/i.test(c.reason)).length,avg_rtt:avg(rtt),avg_jitter:avg(jitter),max_jitter:jitter.length?Math.round(Math.max(...jitter)*100)/100:null,avg_loss:avg(loss),max_loss:loss.length?Math.round(Math.max(...loss)*1000)/1000:null,avg_mos:avg(mos),users:userRows}
}
const drop=$('#drop'),file=$('#file');drop.onclick=()=>file.click();drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();file.click()}};['dragenter','dragover'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.add('drag')}));['dragleave','drop'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.remove('drag')}));drop.addEventListener('drop',e=>e.dataTransfer.files[0]&&analyse(e.dataTransfer.files[0]));file.onchange=()=>file.files[0]&&analyse(file.files[0]);
async function analyse(f){$('#status').className='utility-status';$('#status').textContent='Analysing '+f.name+'…';try{if(f.size>25*1024*1024)throw Error('CSV exceeds the 25 MB limit.');const calls=parseCalls(await f.text());if(!calls.length)throw Error('No 3CX Call Monitor Event ID 10034 records were found.');DATA={calls};render();$('#status').className='utility-status ok';$('#status').textContent=`Loaded ${calls.length} monitored calls from ${f.name}. Data was processed locally in this browser.`}catch(e){$('#status').className='utility-status error';$('#status').textContent=e.message||String(e)}}
function card(label,value,sub=''){return `<div class="quality-stat-card"><div class="quality-stat-label">${label}</div><div class="quality-stat-value">${value}</div><div class="quality-stat-sub">${sub}</div></div>`}
function render(){const exclude=$('#excludeNoRtcp')?.checked??true,s=summary(DATA.calls,exclude);DATA.summary=s;$('#dashboard').classList.remove('hidden');$('#rtcpScope').innerHTML=exclude?`<strong>${s.excluded_legs} of ${s.total_legs} media legs excluded</strong> because RTCP was unavailable. Dashboard averages, quality distribution, fault-domain summary and endpoint statistics use the remaining ${s.included_legs} measurable legs.`:`<strong>All ${s.total_legs} media legs included.</strong> ${s.missing_rtcp} calls contain a 3CX missing-RTCP warning.`;$('#cards').innerHTML=card('Calls monitored',s.total_calls,'Event ID 10034')+card('Poor calls',s.quality_counts.Poor,`${s.quality_counts.Warning} warning`)+card('Avg RTT',fmt(s.avg_rtt,' ms'),'included legs')+card('Avg jitter',fmt(s.avg_jitter,' ms'),`max ${fmt(s.max_jitter,' ms')}`)+card('Avg measurable MOS',fmt(s.avg_mos),'zero / missing excluded')+card('Transcoding',`${s.transcoding}/${s.total_calls}`,`${s.total_calls?Math.round(100*s.transcoding/s.total_calls):0}% of calls`);renderGauge(s);bars('#domainBars',s.domains,s.total_calls);renderUsers();const current=$('#domain').value;$('#domain').innerHTML='<option value="">All fault domains</option>'+Object.keys(s.domains).sort().map(x=>`<option>${esc(x)}</option>`).join('');if([...$('#domain').options].some(o=>o.value===current))$('#domain').value=current;renderCalls()}

function renderGauge(s){
  const score=s.health_score;
  const angle=score==null?-90:-90+(score*1.8);
  const value=score==null?'—':score;
  const label=esc(s.health_label);
  const measurable=s.measurable_calls||0;
  const excluded=s.quality_counts.Inconclusive||0;
  $('#qualityGauge').innerHTML=`
    <div class="quality-gauge-wrap">
      <svg class="quality-gauge" viewBox="0 0 240 145" role="img" aria-label="Overall call quality health ${score==null?'not available':score+' out of 100'}">
        <path class="gauge-track" d="M30 120 A90 90 0 0 1 210 120" pathLength="100"/>
        <path class="gauge-zone gauge-poor" d="M30 120 A90 90 0 0 1 210 120" pathLength="100" stroke-dasharray="25 75" stroke-dashoffset="0"/>
        <path class="gauge-zone gauge-fair" d="M30 120 A90 90 0 0 1 210 120" pathLength="100" stroke-dasharray="25 75" stroke-dashoffset="-25"/>
        <path class="gauge-zone gauge-good" d="M30 120 A90 90 0 0 1 210 120" pathLength="100" stroke-dasharray="25 75" stroke-dashoffset="-50"/>
        <path class="gauge-zone gauge-excellent" d="M30 120 A90 90 0 0 1 210 120" pathLength="100" stroke-dasharray="25 75" stroke-dashoffset="-75"/>
        ${score==null?'':`<g class="gauge-needle" style="transform:rotate(${angle}deg);transform-origin:120px 120px"><line x1="120" y1="120" x2="120" y2="48"/><circle cx="120" cy="120" r="7"/></g>`}
        <text x="30" y="140" class="gauge-tick" text-anchor="middle">0</text>
        <text x="75" y="48" class="gauge-tick" text-anchor="middle">25</text>
        <text x="120" y="31" class="gauge-tick" text-anchor="middle">50</text>
        <text x="165" y="48" class="gauge-tick" text-anchor="middle">75</text>
        <text x="210" y="140" class="gauge-tick" text-anchor="middle">100</text>
      </svg>
      <div class="quality-gauge-readout"><strong>${value}</strong><span>/ 100</span></div>
      <div class="quality-gauge-label ${String(s.health_label).replace(/[^A-Za-z]/g,'')}">${label}</div>
    </div>`;
}

function bars(sel,obj,total){$(sel).innerHTML=Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="quality-bar-row"><div>${esc(k)}</div><div class="quality-bar-bg"><div class="quality-bar" style="width:${total?100*v/total:0}%"></div></div><strong>${v}</strong></div>`).join('')}
function renderUsers(){const q=$('#userSearch').value.toLowerCase();$('#users').innerHTML=DATA.summary.users.filter(u=>JSON.stringify(u).toLowerCase().includes(q)).map(u=>`<tr><td><strong>${esc(u.name)}</strong><br><small>${esc(u.address)}</small></td><td>${u.calls}</td><td>${u.poor}</td><td>${u.warning}</td><td>${fmt(u.avg_rtt,' ms')}</td><td>${fmt(u.max_jitter,' ms')}</td><td>${fmt(u.max_loss,'%')}</td><td><small>${esc(u.user_agent)}</small></td></tr>`).join('')}
function renderCalls(){const q=$('#search').value.toLowerCase(),qual=$('#quality').value,dom=$('#domain').value,exclude=$('#excludeNoRtcp')?.checked??true;const rows=DATA.calls.map(c=>({...c,dashboard_quality:effectiveQuality(c,exclude),dashboard_domain:effectiveDomain(c,exclude)})).filter(c=>(!qual||c.dashboard_quality===qual)&&(!dom||c.dashboard_domain===dom)&&(!q||JSON.stringify(c).toLowerCase().includes(q)));$('#calls').innerHTML=rows.map(c=>`<tr><td>${esc(formatLocalDateTime(c.date_time))}<br><small>${esc(c.department)}</small></td><td><strong>${esc(c.party1.number)}</strong><br>${esc(c.party2.number)}</td><td>${badge(c.dashboard_quality)}</td><td>${esc(c.dashboard_domain)}</td><td>${c.issues.length?c.issues.map(esc).join(', '):'—'}</td><td>${c.transcoding?'Yes':'No'}</td><td><button onclick="detail(${c.id})">View</button></td></tr>`).join('')}
function pathValue(v,suffix=''){return v===null||v===undefined||Number.isNaN(v)?'—':`${Math.round(v*100)/100}${suffix}`}
function endpointMetrics(p,label){
  const leftHeader=label==='A'?'A → B':'B → C';
  const rightHeader=label==='A'?'A ← B':'B ← C';
  const leftRows=label==='A'?
    [['RTT',fmt(p.rtt,' ms')],['MOS to PBX',fmt(p.mos_to_pbx)],['Tx Jitter',fmt(p.tx_jitter,' ms')],['Tx Loss',fmt(p.tx_loss_pct,'%')],['Tx Packets',fmt(p.tx_packets)],['IP Address',esc(p.address)||'—']]:
    [['RTT',fmt(p.rtt,' ms')],['MOS from PBX',fmt(p.mos_from_pbx)],['Rx Jitter',fmt(p.rx_jitter,' ms')],['Rx Loss',fmt(p.rx_loss_pct,'%')],['Rx Packets',fmt(p.rx_packets)],['PBX Address',esc(p.pbx_address)||'—']];
  const rightRows=label==='A'?
    [['MOS from PBX',fmt(p.mos_from_pbx)],['Rx Jitter',fmt(p.rx_jitter,' ms')],['Rx Loss',fmt(p.rx_loss_pct,'%')],['Rx Packets',fmt(p.rx_packets)],['PBX Address',esc(p.pbx_address)||'—']]:
    [['MOS to PBX',fmt(p.mos_to_pbx)],['Tx Jitter',fmt(p.tx_jitter,' ms')],['Tx Loss',fmt(p.tx_loss_pct,'%')],['Tx Packets',fmt(p.tx_packets)],['IP Address',esc(p.address)||'—']];
  const n=Math.max(leftRows.length,rightRows.length);
  let rows='';
  for(let i=0;i<n;i++){
    const l=leftRows[i]||['','']; const r=rightRows[i]||['',''];
    rows+=`<div class="quality-paired-row"><div><span>${l[0]}</span><b>${l[1]}</b></div><div><span>${r[0]}</span><b>${r[1]}</b></div></div>`;
  }
  return `<section class="quality-endpoint-card"><div class="quality-endpoint-head"><span class="quality-node-letter">${label}</span><div><h3>${esc(p.number)||'Unknown endpoint'}</h3><small>${esc(p.endpoint_type)||'Endpoint'}</small></div></div><div class="quality-path-column-heads"><div><strong>${leftHeader}</strong></div><div><strong>${rightHeader}</strong></div></div><div class="quality-paired-metrics">${rows}</div></section>`}

function mediaPathSummary(call,key){
  const map={
    'A-B':{label:'A → B',leg:call.party1,jitter:'tx_jitter',loss:'tx_loss_pct',packets:'tx_packets',mos:'mos_to_pbx',direction:'audio from A to the 3CX PBX'},
    'A<-B':{label:'A ← B',leg:call.party1,jitter:'rx_jitter',loss:'rx_loss_pct',packets:'rx_packets',mos:'mos_from_pbx',direction:'audio from the 3CX PBX to A'},
    'B-C':{label:'B → C',leg:call.party2,jitter:'rx_jitter',loss:'rx_loss_pct',packets:'rx_packets',mos:'mos_from_pbx',direction:'audio from the 3CX PBX to C'},
    'B<-C':{label:'B ← C',leg:call.party2,jitter:'tx_jitter',loss:'tx_loss_pct',packets:'tx_packets',mos:'mos_to_pbx',direction:'audio from C to the 3CX PBX'}
  }[key];
  const p=map.leg,j=fnum(p[map.jitter]),loss=fnum(p[map.loss]),packets=fnum(p[map.packets]),mos=fnum(p[map.mos]);
  const noRtcp=rtcpUnavailableForLeg(call,p);
  const measurable=(j!==null)||(loss!==null)||(mos!==null&&mos>0)||(packets!==null&&packets>0);
  if(!measurable || (noRtcp && (packets===null||packets===0) && (mos===null||mos<=0) && j===null && loss===null)){
    return {label:map.label,status:'Unavailable',tone:'na',detail:`No measurable RTP quality data is available for ${map.direction}.`};
  }
  const states=[state('jitter',j),state('loss',loss),state('mos',mos)];
  let status=states.includes('poor')?'Poor':states.includes('warning')?'Warning':'Good';
  if(packets===0 && !noRtcp) status='Poor';
  const tone=status.toLowerCase();
  const bits=[];
  if(mos!==null&&mos>0)bits.push(`MOS ${fmt(mos)}`);
  if(j!==null)bits.push(`jitter ${fmt(j,' ms')}`);
  if(loss!==null)bits.push(`loss ${fmt(loss,'%')}`);
  if(packets!==null)bits.push(`${fmt(packets)} packets`);
  return {label:map.label,status,tone,detail:bits.length?bits.join(' · '):`Limited measurable data for ${map.direction}.`};
}
function mediaPathBreakdown(call){
  return ['A-B','A<-B','B-C','B<-C'].map(k=>{
    const x=mediaPathSummary(call,k);
    return `<div class="quality-path-summary ${x.tone}"><div class="quality-path-summary-head"><strong>${x.label}</strong><span>${x.status}</span></div><small>${esc(x.detail)}</small></div>`;
  }).join('');
}

function audioPair(leftLabel,rightLabel){return `<div class="quality-audio-pair" aria-label="Inbound and outbound audio between ${leftLabel} and ${rightLabel}"><div class="quality-audio-path forward"><div class="quality-arrow-line"><i></i><b>Inbound</b><i class="arrow-head"></i></div></div><div class="quality-audio-path reverse"><div class="quality-arrow-line reverse-line"><i class="arrow-head left"></i><b>Outbound</b><i></i></div></div></div>`}
function pbxNode(c){const addr=c.party1.pbx_address||c.party2.pbx_address||'3CX PBX';return `<section class="quality-pbx-node"><span class="quality-node-letter">B</span><div><strong>3CX PBX</strong><small>${esc(addr)}</small></div></section>`}
window.detail=id=>{const c=DATA.calls.find(x=>x.id===id);const exclude=$('#excludeNoRtcp')?.checked??true;const dq=effectiveQuality(c,exclude),dd=effectiveDomain(c,exclude);$('#detail').innerHTML=`<div class="quality-detail-title"><div><span class="eyebrow">MEDIA PATH</span><h2>${esc(c.party1.number)} ↔ 3CX PBX ↔ ${esc(c.party2.number)}</h2><p>${esc(formatLocalDateTime(c.date_time))} · ${badge(dq)}</p></div></div><div class="quality-diagnosis"><strong>Likely fault domain: ${esc(dd)}</strong><br>${esc(c.diagnosis)}<div class="quality-path-summary-grid">${mediaPathBreakdown(c)}</div></div><div class="quality-media-topology"><div class="quality-topology-side">${endpointMetrics(c.party1,'A')}</div><div class="quality-topology-link">${audioPair('A','B')}</div><div class="quality-topology-centre">${pbxNode(c)}</div><div class="quality-topology-link">${audioPair('B','C')}</div><div class="quality-topology-side">${endpointMetrics(c.party2,'C')}</div></div><p class="quality-path-note">Inbound and outbound RTP/audio paths are shown for each call leg. RTCP reporting is not represented as a media path.</p><h3>3CX reason</h3><div class="quality-reason">${esc(c.reason)||'No reason supplied.'}</div>`;$('#modal').classList.remove('hidden')};$('#close').onclick=()=>$('#modal').classList.add('hidden');$('#modal').onclick=e=>{if(e.target===$('#modal'))$('#modal').classList.add('hidden')};['search','quality','domain'].forEach(id=>$('#'+id).addEventListener('input',renderCalls));$('#userSearch').addEventListener('input',renderUsers);$('#excludeNoRtcp').addEventListener('change',render);
