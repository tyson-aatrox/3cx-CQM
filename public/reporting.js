// Client-facing reporting add-on for 3CX CQM.
// Uses the analyser's in-browser DATA object; no call data leaves the browser.
(function(){
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const dt=v=>{const d=new Date(String(v||'').replace(' ','T'));return Number.isNaN(d.getTime())?null:d};
  const pct=(n,d)=>d?Math.round(n*1000/d)/10:0;
  const local=v=>typeof formatLocalDateTime==='function'?formatLocalDateTime(v):v;
  function inPeriod(c,a,b){const d=dt(c.date_time);return d&&(!a||d>=a)&&(!b||d<=b)}
  function reportCalls(){
    const a=$('#reportStart').value?new Date($('#reportStart').value):null;
    const b=$('#reportEnd').value?new Date($('#reportEnd').value):null;
    return (DATA?.calls||[]).filter(c=>inPeriod(c,a,b));
  }
  function bucket(calls){
    const out={};
    calls.forEach(c=>{const d=dt(c.date_time);if(!d)return;const k=d.toLocaleDateString(undefined,{day:'2-digit',month:'short'});const q=effectiveQuality(c,$('#excludeNoRtcp')?.checked??true);const x=out[k]??={total:0,degraded:0};x.total++;if(q==='Poor'||q==='Warning')x.degraded++});
    return out;
  }
  function renderTrend(calls){
    const b=bucket(calls),max=Math.max(1,...Object.values(b).map(x=>pct(x.degraded,x.total)));
    return Object.entries(b).map(([k,x])=>{const p=pct(x.degraded,x.total);return '<div class="report-trend-row"><span>'+esc(k)+'</span><div><i style="width:'+Math.max(2,p/max*100)+'%"></i></div><strong>'+p+'%</strong></div>'}).join('')||'<p>No calls in selected period.</p>';
  }
  function summaryText(s,calls){
    const degraded=s.quality_counts.Poor+s.quality_counts.Warning,p=pct(degraded,s.measurable_calls);
    const top=Object.entries(s.domains).filter(([k])=>!['No Fault Detected','Insufficient Data'].includes(k)).sort((a,b)=>b[1]-a[1])[0];
    return calls.length?('During the selected monitoring period, '+s.total_calls+' calls were analysed and '+s.measurable_calls+' contained measurable quality data. '+p+'% of measurable calls showed warning or poor quality.'+(top?' The most frequently identified fault domain was '+top[0]+'.':' No dominant fault domain was identified.')):'No calls fall within the selected monitoring period.';
  }
  function generate(){
    if(!DATA?.calls?.length)return;
    const calls=reportCalls(),exclude=$('#excludeNoRtcp')?.checked??true,s=summary(calls,exclude);
    const customer=$('#reportCustomer').value.trim()||'Customer',title=$('#reportTitle').value.trim()||'Call Quality Investigation Report';
    const poor=calls.filter(c=>['Poor','Warning'].includes(effectiveQuality(c,exclude))).slice(0,12);
    $('#reportPreview').innerHTML='<article class="client-report"><header><span>CALL QUALITY MONITORING</span><h1>'+esc(title)+'</h1><p>'+esc(customer)+'</p></header>'+
      '<section class="report-summary"><h2>Executive Summary</h2><p>'+esc(summaryText(s,calls))+'</p></section>'+
      '<section><h2>Monitoring Period</h2><div class="report-kpis"><div><b>'+s.total_calls+'</b><span>Calls analysed</span></div><div><b>'+s.measurable_calls+'</b><span>Measurable calls</span></div><div><b>'+s.quality_counts.Poor+'</b><span>Poor calls</span></div><div><b>'+s.quality_counts.Warning+'</b><span>Warning calls</span></div></div></section>'+
      '<section><h2>Quality Progression</h2><p class="report-note">Percentage of measurable calls classified Warning or Poor by day.</p><div class="report-trend">'+renderTrend(calls)+'</div></section>'+
      '<section><h2>Investigation Findings</h2><p>'+esc($('#reportFindings').value.trim()||'Engineer findings have not yet been entered.')+'</p></section>'+
      '<section><h2>Actions / Changes</h2><p>'+esc($('#reportActions').value.trim()||'No investigation actions have been recorded.')+'</p></section>'+
      '<section><h2>Affected Call Examples</h2><table><thead><tr><th>Date / Time</th><th>Parties</th><th>Quality</th><th>Fault domain</th></tr></thead><tbody>'+poor.map(c=>'<tr><td>'+esc(local(c.date_time))+'</td><td>'+esc(c.party1.number)+' ↔ '+esc(c.party2.number)+'</td><td>'+esc(effectiveQuality(c,exclude))+'</td><td>'+esc(effectiveDomain(c,exclude))+'</td></tr>').join('')+'</tbody></table></section>'+
      '<footer>Diagnostic findings are based on available 3CX call-quality telemetry and should be correlated with reported symptoms and network evidence.</footer></article>';
    $('#reportPreview').classList.remove('hidden');
  }
  window.openReporting=()=>{if(!DATA?.calls?.length)return alert('Load a Call Monitor CSV before creating a report.');$('#reporting').classList.remove('hidden');const ds=DATA.calls.map(c=>dt(c.date_time)).filter(Boolean).sort((a,b)=>a-b);if(ds.length){const iso=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16)};if(!$('#reportStart').value)$('#reportStart').value=iso(ds[0]);if(!$('#reportEnd').value)$('#reportEnd').value=iso(ds.at(-1));}generate()};
  document.addEventListener('DOMContentLoaded',()=>{$('#reportGenerate')?.addEventListener('click',generate);$('#reportPrint')?.addEventListener('click',()=>{generate();window.print()});$('#reportClose')?.addEventListener('click',()=>$('#reporting').classList.add('hidden'))});
})();