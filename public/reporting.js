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
    calls.forEach(c=>{const d=dt(c.date_time);if(!d)return;const k=d.toLocaleDateString(undefined,{day:'2-digit',month:'short'});const q=effectiveQuality(c,$('#excludeNoRtcp')?.checked??true);const x=out[k]??={total:0,degraded:0};if(q!=='Inconclusive'){x.total++;if(q==='Poor'||q==='Warning')x.degraded++}});
    return out;
  }
  function renderTrend(calls){
    const b=bucket(calls),max=Math.max(1,...Object.values(b).map(x=>pct(x.degraded,x.total)));
    return Object.entries(b).map(([k,x])=>{const p=pct(x.degraded,x.total);return '<div class="report-trend-row"><span>'+esc(k)+'</span><div><i style="width:'+Math.max(2,p/max*100)+'%"></i></div><strong>'+p+'%</strong></div>'}).join('')||'<p>No calls in selected period.</p>';
  }
  function intervention(){return $('#reportIntervention').value?new Date($('#reportIntervention').value):null}
  function periodStats(calls,exclude){const s=summary(calls,exclude),bad=s.quality_counts.Poor+s.quality_counts.Warning;return {s,bad,rate:pct(bad,s.measurable_calls)}}
  function compareBlock(calls,exclude){
    const cut=intervention();if(!cut)return '<p class="report-note">Add an intervention time to compare quality before and after a change.</p>';
    const before=calls.filter(c=>dt(c.date_time)<cut),after=calls.filter(c=>dt(c.date_time)>=cut),a=periodStats(before,exclude),b=periodStats(after,exclude);
    const delta=Math.round((b.rate-a.rate)*10)/10,word=delta<0?'decreased':delta>0?'increased':'was unchanged';
    return '<div class="report-compare"><div><span>Before change</span><b>'+a.rate+'%</b><small>'+a.bad+' degraded / '+a.s.measurable_calls+' measurable</small></div><div class="report-compare-arrow">→</div><div><span>After change</span><b>'+b.rate+'%</b><small>'+b.bad+' degraded / '+b.s.measurable_calls+' measurable</small></div></div><p class="report-note">Observed degradation '+word+' by '+Math.abs(delta)+' percentage points following the recorded intervention. This comparison shows correlation in time and does not by itself establish causation.</p>';
  }
  function pathAggregate(calls){
    const keys=['A-B','A<-B','B-C','B<-C'];return keys.map(k=>{const xs=calls.map(c=>mediaPathSummary(c,k)).filter(x=>x.status!=='Unavailable'),poor=xs.filter(x=>x.status==='Poor').length,warn=xs.filter(x=>x.status==='Warning').length;return {label:xs[0]?.label||k,total:xs.length,poor,warn,rate:pct(poor+warn,xs.length)}})
  }
  function pathBlock(calls){
    const paths=pathAggregate(calls), cls=x=>x.poor?'poor':x.warn?'warning':'good';
    const cards='<div class="report-path-grid">'+paths.map(x=>'<div class="'+cls(x)+'"><strong>'+esc(x.label)+'</strong><b>'+x.rate+'%</b><span>degraded</span><small>'+x.poor+' poor · '+x.warn+' warning · '+x.total+' measured</small></div>').join('')+'</div>';
    const topology='<div class="report-topology"><div class="report-node"><b>A</b><span>Endpoint A</span></div><div class="report-link"><span>'+esc(paths[0]?.rate??0)+'% →</span><span>← '+esc(paths[1]?.rate??0)+'%</span></div><div class="report-node pbx"><b>B</b><span>3CX PBX</span></div><div class="report-link"><span>'+esc(paths[2]?.rate??0)+'% →</span><span>← '+esc(paths[3]?.rate??0)+'%</span></div><div class="report-node"><b>C</b><span>Endpoint C</span></div></div>';
    return topology+cards+'<p class="report-note">A and C represent call endpoints; B represents the 3CX PBX. Percentages show paths classified Warning or Poor where path telemetry was measurable.</p>';
  }
  function domainBlock(s){
    const total=Math.max(1,s.total_calls);return '<div class="report-domain-list">'+Object.entries(s.domains).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<div><span>'+esc(k)+'</span><i><em style="width:'+pct(v,total)+'%"></em></i><b>'+v+'</b></div>').join('')+'</div>';
  }
  function eventBlock(){
    const cut=intervention(),label=$('#reportInterventionLabel').value.trim()||'Investigation change';
    return cut?'<div class="report-event"><b>'+esc(cut.toLocaleString())+'</b><span>'+esc(label)+'</span></div>':'<p class="report-note">No intervention marker has been recorded.</p>';
  }
  function metricNarrative(s){
    const parts=[];
    if(Number.isFinite(s.avg_rtt)) parts.push('Average round-trip time was '+Math.round(s.avg_rtt)+' ms'+(s.avg_rtt>=150?', which is above the poor-quality threshold':s.avg_rtt>=100?', which is elevated':''));
    if(Number.isFinite(s.avg_jitter)) parts.push('average jitter was '+Math.round(s.avg_jitter*10)/10+' ms'+(s.avg_jitter>=30?', which is high':s.avg_jitter>=20?', which is elevated':''));
    if(Number.isFinite(s.avg_loss)) parts.push('average packet loss was '+Math.round(s.avg_loss*100)/100+'%'+(s.avg_loss>=1?', which is high':s.avg_loss>=.5?', which is elevated':''));
    if(Number.isFinite(s.avg_mos)) parts.push('average MOS was '+Math.round(s.avg_mos*100)/100+(s.avg_mos<3.5?', indicating poor perceived voice quality':s.avg_mos<4?', indicating reduced perceived voice quality':''));
    return parts.length?parts.join('; ')+'.':'No aggregate RTT, jitter, packet-loss or MOS measurements were available for this period.';
  }
  function summaryText(s,calls){
    const degraded=s.quality_counts.Poor+s.quality_counts.Warning,p=pct(degraded,s.measurable_calls);
    const top=Object.entries(s.domains).filter(([k])=>!['No Fault Detected','Insufficient Data'].includes(k)).sort((a,b)=>b[1]-a[1])[0];
    const domain=top?(top[0]==='Customer / Site'?' The affected calls were predominantly associated with the customer-side audio path.':' The most frequently identified fault domain was '+top[0]+'.'):' No dominant fault domain was identified.';return calls.length?('During the selected monitoring period, '+s.total_calls+' calls were analysed and '+s.measurable_calls+' contained measurable quality data. '+p+'% of measurable calls showed warning or poor quality.'+domain):'No calls fall within the selected monitoring period.';
  }
  function generate(){
    if(!DATA?.calls?.length)return;
    const calls=reportCalls(),exclude=$('#excludeNoRtcp')?.checked??true,s=summary(calls,exclude);
    const customer=$('#reportCustomer').value.trim()||'Customer',title=$('#reportTitle').value.trim()||'Call Quality Investigation Report',status=$('#reportStatus')?.value||'Investigating';
    const poor=calls.filter(c=>['Poor','Warning'].includes(effectiveQuality(c,exclude))).slice(0,12);
    $('#reportPreview').innerHTML='<article class="client-report"><header><span>CALL QUALITY MONITORING</span><h1>'+esc(title)+'</h1><div class="report-head-meta"><p>'+esc(customer)+'</p><span class="report-status '+esc(status.toLowerCase())+'">'+esc(status)+'</span></div></header>'+
      '<section class="report-summary"><h2>Executive Summary</h2><p>'+esc(summaryText(s,calls))+'</p></section>'+
      '<section><h2>Monitoring Period</h2><div class="report-kpis"><div><b>'+s.total_calls+'</b><span>Calls analysed</span></div><div><b>'+s.measurable_calls+'</b><span>Measurable calls</span></div><div><b>'+s.quality_counts.Poor+'</b><span>Poor calls</span></div><div><b>'+s.quality_counts.Warning+'</b><span>Warning calls</span></div></div></section>'+
      '<section><h2>Quality Metrics</h2><p>'+esc(metricNarrative(s))+'</p><div class="report-metric-strip"><span><b>'+esc(Number.isFinite(s.avg_rtt)?Math.round(s.avg_rtt)+' ms':'—')+'</b>Avg RTT</span><span><b>'+esc(Number.isFinite(s.avg_jitter)?Math.round(s.avg_jitter*10)/10+' ms':'—')+'</b>Avg jitter</span><span><b>'+esc(Number.isFinite(s.avg_loss)?Math.round(s.avg_loss*100)/100+'%':'—')+'</b>Avg loss</span><span><b>'+esc(Number.isFinite(s.avg_mos)?Math.round(s.avg_mos*100)/100:'—')+'</b>Avg MOS</span></div></section><section><h2>Quality Progression</h2><p class="report-note">Percentage of measurable calls classified Warning or Poor by day.</p><div class="report-trend">'+renderTrend(calls)+'</div></section>'+
      (intervention()?'<section><h2>Recorded Intervention</h2>'+eventBlock()+'</section><section><h2>Before / After Comparison</h2>'+compareBlock(calls,exclude)+'</section>':'')+
      '<section><h2>Audio Path Findings</h2>'+pathBlock(calls)+'</section>'+
      '<section><h2>Fault Domain Distribution</h2>'+domainBlock(s)+'</section>'+
      '<section><h2>Investigation Findings</h2><p>'+esc($('#reportFindings').value.trim()||'Engineer findings have not yet been entered.')+'</p></section>'+
      '<section><h2>Actions / Changes</h2><p>'+esc($('#reportActions').value.trim()||'No investigation actions have been recorded.')+'</p></section>'+
      '<section><h2>Affected Call Examples</h2><table><thead><tr><th>Date / Time</th><th>Parties</th><th>Quality</th><th>Fault domain</th></tr></thead><tbody>'+poor.map(c=>'<tr><td>'+esc(local(c.date_time))+'</td><td>'+esc(c.party1.number)+' ↔ '+esc(c.party2.number)+'</td><td>'+esc(effectiveQuality(c,exclude))+'</td><td>'+esc(effectiveDomain(c,exclude))+'</td></tr>').join('')+'</tbody></table></section>'+
      '<footer>Diagnostic findings are based on available 3CX call-quality telemetry and should be correlated with reported symptoms and network evidence.</footer></article>';
    $('#reportPreview').classList.remove('hidden');
  }
  window.openReporting=()=>{if(!DATA?.calls?.length)return alert('Load a Call Monitor CSV before creating a report.');$('#reporting').classList.remove('hidden');const ds=DATA.calls.map(c=>dt(c.date_time)).filter(Boolean).sort((a,b)=>a-b);if(ds.length){const iso=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16)};if(!$('#reportStart').value)$('#reportStart').value=iso(ds[0]);if(!$('#reportEnd').value)$('#reportEnd').value=iso(ds.at(-1));}generate()};
  document.addEventListener('DOMContentLoaded',()=>{$('#openReporting')?.addEventListener('click',()=>window.openReporting());$('#reportGenerate')?.addEventListener('click',generate);$('#reportPrint')?.addEventListener('click',()=>{generate();window.print()});$('#reportClose')?.addEventListener('click',()=>$('#reporting').classList.add('hidden'))});
})();