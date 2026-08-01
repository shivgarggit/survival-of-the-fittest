/* ==========================================================================
   Survival of the Fittest - public site
   Runs entirely from published INDEX levels. No ticker price is ever loaded
   by the browser, because none is ever published.

   value(t) = units(t) * index(t),  units += contribution / index
   That identity is what lets any starting amount and any contribution
   schedule be reconstructed client-side from an index series alone.
   ========================================================================== */
(function(){
"use strict";
var $=function(s){return document.querySelector(s)},
    $$=function(s){return [].slice.call(document.querySelectorAll(s))};
var MQ=window.matchMedia('(max-width: 760px)');
var MOB=MQ.matches;
function onMQ(e){ MOB=e.matches; document.body.classList.toggle('mob',MOB);
  if(R){closeSheet();render();renderRibbon();} }
if(MQ.addEventListener)MQ.addEventListener('change',onMQ);
else if(MQ.addListener)MQ.addListener(onMQ);
function setTxt(sel,v){var e=$(sel); if(e)e.textContent=v}
function setHtml(sel,v){var e=$(sel); if(e)e.innerHTML=v}
var NS='http://www.w3.org/2000/svg';
function el(n,a){var e=document.createElementNS(NS,n);for(var k in a)e.setAttribute(k,a[k]);return e}
var BN={Strategy:'Strategy',SPY:'S&P 500',QQQ:'Nasdaq 100',SPMO:'S&P Momentum',
        XLG:'S&P Top 50',MAGS:'Magnificent 7',RSP:'S&P Equal Weight'};
var BC={Strategy:'#B0215B',SPY:'#5A6B85',QQQ:'#0E7C8A',SPMO:'#A85B24',
        XLG:'#5B4B8A',MAGS:'#3F7A5B',RSP:'#8A6D1F'};
var D=null,N=0,LAST='',R=null;
var state={period:'MAX',from:'',to:'',initial:100000,dca:0,freq:'none',
           rf:0.02,ref:'SPY',show:{SPY:1,QQQ:1,SPMO:0,XLG:0,MAGS:0,RSP:0},log:true};

function money(v){return v===null||!isFinite(v)?'\u2014':(v<0?'\u2212$':'$')+Math.round(Math.abs(v)).toLocaleString('en-US')}
function pc(v,d){return v===null||v===undefined||!isFinite(v)?'\u2014':(v>=0?'+':'\u2212')+(Math.abs(v)*100).toFixed(d===undefined?1:d)+'%'}
function pc0(v,d){return v===null||!isFinite(v)?'\u2014':(v*100).toFixed(d===undefined?1:d)+'%'}
function num(v,d){return v===null||v===undefined||!isFinite(v)?'\u2014':v.toFixed(d===undefined?2:d)}
function sg(v){return v>0?'pos':v<0?'neg':''}
function compact(v){
  if(v===null||v===undefined||!isFinite(v))return '\u2014';
  var a=Math.abs(v), s=v<0?'\u2212':'+';
  if(a>=1e6)return s+'$'+(a/1e6).toFixed(a>=1e7?0:1)+'M';
  if(a>=1000)return s+'$'+(a/1000).toFixed(a>=10000?0:1)+'k';
  return s+'$'+Math.round(a);
}
function days(a,b){return Math.round((Date.parse(b)-Date.parse(a))/864e5)}
function dur(d){
  if(d===null)return '\u2014';
  if(d<60)return d+'d';
  if(d<365)return (d/30.44).toFixed(0)+'mo';
  return (d/365.25).toFixed(1)+'y';
}
function fidx(s){for(var i=0;i<=N;i++)if(D.dates[i]>=s)return i;return N}
function lidx(s){for(var i=N;i>=0;i--)if(D.dates[i]<=s)return i;return 0}

/* ---------------- contribution schedule ---------------- */
function contribDates(i0,i1,freq){
  if(freq==='none')return {};
  var out={};
  if(freq==='daily'){for(var i=i0+1;i<=i1;i++)out[i]=1;return out}
  function key(s){
    var y=+s.slice(0,4),m=+s.slice(5,7),dd=+s.slice(8,10);
    if(freq==='monthly')return y*12+m;
    if(freq==='quarterly')return y*4+Math.ceil(m/3);
    if(freq==='semiannually')return y*2+(m>6?1:0);
    if(freq==='annually')return y;
    var t=Date.UTC(y,m-1,dd)/864e5;
    if(freq==='weekly')return Math.floor(t/7);
    if(freq==='biweekly')return Math.floor(t/14);
    return y*12+m;
  }
  var seen={};seen[key(D.dates[i0])]=1;
  for(var j=i0+1;j<=i1;j++){var k=key(D.dates[j]);if(!seen[k]){seen[k]=1;out[j]=1}}
  return out;
}

/* ---------------- simulate from an index series ---------------- */
function sim(key,o){
  var ix=D.series[key];if(!ix)return null;
  var i0=o.i0;
  while(i0<=o.i1&&(ix[i0]===null||ix[i0]===undefined||!(ix[i0]>0)))i0++;
  if(i0>o.i1)return null;
  var cd=contribDates(i0,o.i1,o.freq);
  var units=o.initial/ix[i0],nav=[],flows=[{i:i0,amt:o.initial}],cumIn=o.initial,last=ix[i0];
  for(var k=o.i0;k<i0;k++)nav.push(null);
  for(var j=i0;j<=o.i1;j++){
    var v=ix[j];if(v===null||v===undefined||!(v>0))v=last;else last=v;
    if(j>i0&&cd[j]){units+=o.dca/v;cumIn+=o.dca;flows.push({i:j,amt:o.dca})}
    nav.push(units*v);
  }
  return {nav:nav,flows:flows,cumIn:cumIn,startIdx:i0,late:i0!==o.i0,ix:ix};
}

/* ---------------- metrics ---------------- */
function mean(a){var s=0,n=0;a.forEach(function(v){if(v!==null&&isFinite(v)){s+=v;n++}});return n?s/n:0}
function sd(a){var m=mean(a),s=0,n=0;a.forEach(function(v){if(v!==null&&isFinite(v)){s+=(v-m)*(v-m);n++}});return n>1?Math.sqrt(s/(n-1)):0}
function idxRet(ix,i0,i1){var r=[],last=null;
  for(var i=i0;i<=i1;i++){var v=ix[i];
    if(v===null||v===undefined||!(v>0)){r.push(null);continue}
    r.push(last===null?null:v/last-1);last=v}
  return r}
function drawdown(nav){var pk=-Infinity,dd=[],mn=0,mi=0;
  for(var i=0;i<nav.length;i++){var v=nav[i];if(v===null){dd.push(null);continue}
    if(v>pk)pk=v;var d=v/pk-1;dd.push(d);if(d<mn){mn=d;mi=i}}
  return {dd:dd,max:mn,troughIdx:mi}}
function xirr(flows,dates,fin,li){
  var t0=Date.parse(dates[flows[0].i]);
  var cf=flows.map(function(f){return{t:(Date.parse(dates[f.i])-t0)/864e5/365.25,a:-f.amt}});
  cf.push({t:(Date.parse(dates[li])-t0)/864e5/365.25,a:fin});
  var f=function(r){var s=0;cf.forEach(function(c){s+=c.a/Math.pow(1+r,c.t)});return s};
  var lo=-0.95,hi=10;if(f(lo)*f(hi)>0)return null;
  for(var k=0;k<200;k++){var m=(lo+hi)/2;if(f(lo)*f(m)<=0)hi=m;else lo=m}
  return (lo+hi)/2}

function metrics(key,res,o,refRet,refCagr,cmpEnd){
  var m={},i0=res.startIdx,i1=o.i1;
  var yrs=(Date.parse(D.dates[i1])-Date.parse(D.dates[i0]))/864e5/365.25;
  var ix=res.ix,r=idxRet(ix,i0,i1).filter(function(v){return v!==null&&isFinite(v)});
  m.twr=ix[i1]/ix[i0]-1;
  m.cagr=yrs>0?Math.pow(1+m.twr,1/yrs)-1:0;
  m.vol=sd(r)*Math.sqrt(252);
  var dn=r.filter(function(v){return v<0});m.dvol=sd(dn)*Math.sqrt(252);
  m.sharpe=m.vol?(m.cagr-o.rf)/m.vol:0;
  m.sortino=m.dvol?(m.cagr-o.rf)/m.dvol:0;
  var d=drawdown(res.nav);m.maxdd=d.max;m.ddInfo=d;
  m.calmar=d.max?m.cagr/Math.abs(d.max):0;
  m.final=res.nav[res.nav.length-1];
  m.invested=res.cumIn;m.profit=m.final-m.invested;
  m.irr=xirr(res.flows,D.dates,m.final,i1);m.years=yrs;
  var srt=r.slice().sort(function(a,b){return a-b});
  m.var95=srt.length?srt[Math.floor(srt.length*0.05)]:0;
  m.best=srt.length?srt[srt.length-1]:0;m.worst=srt.length?srt[0]:0;
  m.pos=r.filter(function(v){return v>0}).length/Math.max(1,r.length);
  if(refRet){
    var cs=Math.max(i0,o.i0),ce=cmpEnd;
    var a=idxRet(ix,cs,ce),b=refRet.slice(cs-o.i0,ce-o.i0+1);
    var A=[],B=[];
    for(var i=0;i<Math.min(a.length,b.length);i++)
      if(a[i]!==null&&b[i]!==null&&isFinite(a[i])&&isFinite(b[i])){A.push(a[i]);B.push(b[i])}
    if(A.length>20){
      var ma=mean(A),mb=mean(B),cov=0,va=0,vb=0;
      for(var k=0;k<A.length;k++){cov+=(A[k]-ma)*(B[k]-mb);va+=(A[k]-ma)*(A[k]-ma);vb+=(B[k]-mb)*(B[k]-mb)}
      cov/=(A.length-1);va/=(A.length-1);vb/=(A.length-1);
      m.beta=vb?cov/vb:0;m.corr=(va&&vb)?cov/Math.sqrt(va*vb):0;
      m.alpha=m.cagr-(o.rf+m.beta*(refCagr-o.rf));
      var df=A.map(function(v,i2){return v-B[i2]});
      m.te=sd(df)*Math.sqrt(252);m.ir=m.te?(m.cagr-refCagr)/m.te:0;
      var up=0,ub=0,dw=0,db=0;
      for(var j=0;j<A.length;j++){if(B[j]>0){up+=A[j];ub+=B[j]}else if(B[j]<0){dw+=A[j];db+=B[j]}}
      m.upcap=ub?up/ub:0;m.downcap=db?dw/db:0;
    }
  }
  return m;
}
function monthly(ix,i0,i1){
  var out={},last=null;
  for(var i=i0;i<=i1;i++){var v=ix[i];
    if(v===null||v===undefined||!(v>0))continue;
    if(last!==null){var mk=D.dates[i].slice(0,7);
      out[mk]=(out[mk]===undefined?1:out[mk])*(v/last)}
    last=v}
  var res={};for(var k in out)res[k]=out[k]-1;return res;
}

/* ---------------- compute ---------------- */
function windowIdx(){
  var y=+LAST.slice(0,4),md=LAST.slice(4);
  var map={YTD:LAST.slice(0,4)+'-01-01','1Y':(y-1)+md,'3Y':(y-3)+md,'5Y':(y-5)+md,MAX:D.dates[0]};
  if(state.period==='CUSTOM')return [fidx(state.from),lidx(state.to)];
  return [fidx(map[state.period]||D.dates[0]),N];
}
function compute(){
  var w=windowIdx(),i0=w[0],i1=w[1];
  if(i1<=i0)i1=Math.min(N,i0+1);
  var o={i0:i0,i1:i1,initial:state.initial,dca:state.dca,freq:state.freq,rf:state.rf};
  var refK=state.ref,refRes=sim(refK,o);
  var lr=D.lastReal[refK]!==undefined?D.lastReal[refK]:i1;
  var cmpEnd=Math.min(i1,lr);
  var refRet=refRes?idxRet(D.series[refK],i0,i1):null;
  var refCagr=0;
  if(refRes){var yy=(Date.parse(D.dates[cmpEnd])-Date.parse(D.dates[refRes.startIdx]))/864e5/365.25;
    refCagr=yy>0?Math.pow(D.series[refK][cmpEnd]/D.series[refK][refRes.startIdx],1/yy)-1:0}
  var rows=[];
  var s=sim('Strategy',o);
  rows.push({k:'Strategy',res:s,m:metrics('Strategy',s,o,refRet,refCagr,cmpEnd)});
  Object.keys(state.show).forEach(function(k){
    if(!state.show[k]||!D.series[k])return;
    var b=sim(k,o);if(!b)return;
    var ce=Math.min(cmpEnd,D.lastReal[k]!==undefined?D.lastReal[k]:cmpEnd);
    rows.push({k:k,res:b,m:metrics(k,b,o,refRet,refCagr,ce)});
  });
  R={o:o,i0:i0,i1:i1,rows:rows,strat:rows[0],refK:refK,cmpEnd:cmpEnd,gapped:cmpEnd<i1};
  render();
}

/* ---------------- charts ---------------- */
var W=1000,H=380,ML,MR,MT,MB,PW,PH;
function geo(){
  // The viewBox is a fixed 1000 wide but renders ~350px on a phone, so every
  // length here has to grow by roughly 3x on mobile just to stay legible.
  ML = MOB?150:62; MR = MOB?26:18; MT = MOB?22:16; MB = MOB?58:28;
  PW = W-ML-MR; PH = H-MT-MB;
}
geo();
function drawGrowth(){
  geo();
  var svg=$('#growth');if(!svg)return;svg.innerHTML='';
  var n=R.i1-R.i0+1;
  function X(k){return ML+(n<2?0:k/(n-1))*PW}
  var lo=Infinity,hi=-Infinity;
  R.rows.forEach(function(s){s.res.nav.forEach(function(v){
    if(v!==null&&isFinite(v)&&v>0){if(v<lo)lo=v;if(v>hi)hi=v}})});
  if(!isFinite(lo)){lo=1;hi=2}
  lo*=0.94;hi*=1.06;
  var lg=state.log&&lo>0;
  function Y(v){return lg?MT+PH-((Math.log(v)-Math.log(lo))/(Math.log(hi)-Math.log(lo)))*PH
                         :MT+PH-((v-lo)/(hi-lo))*PH}
  var ticks=[];
  if(lg){var s0=Math.pow(10,Math.floor(Math.log10(lo)));
    var mult=MOB?[1,2,5]:[1,1.5,2,3,5,7];
    for(var m=s0;m<=hi*1.6;m*=10)mult.forEach(function(f){var v=m*f;if(v>=lo&&v<=hi)ticks.push(v)})}
  else{var st=(hi-lo)/(MOB?3:5),p=Math.pow(10,Math.floor(Math.log10(st)));st=Math.ceil(st/p)*p;
    for(var v2=Math.ceil(lo/st)*st;v2<=hi;v2+=st)ticks.push(v2)}
  ticks.forEach(function(v){var y=Y(v);
    svg.appendChild(el('line',{x1:ML,x2:W-MR,y1:y.toFixed(1),y2:y.toFixed(1),class:'gl'}));
    var t=el('text',{x:ML-9,y:(y+3.5).toFixed(1),class:'ax','text-anchor':'end'});
    t.textContent=v>=1e6?'$'+(v/1e6).toFixed(1)+'M':v>=1000?'$'+Math.round(v/1000)+'k':'$'+Math.round(v);
    svg.appendChild(t)});
  var seen={},step=Math.max(1,Math.round(n/(MOB?4:9)));
  for(var k2=0;k2<n;k2+=step){var d=D.dates[R.i0+k2],lab=n>500?d.slice(0,4):d.slice(0,7);
    if(seen[lab])continue;seen[lab]=1;
    var tx=el('text',{x:X(k2).toFixed(1),y:H-8,class:'ax','text-anchor':'middle'});
    tx.textContent=lab;svg.appendChild(tx)}
  if(!MOB)D.quarters.forEach(function(q){var i=D.dates.indexOf(q.start)-R.i0;
    if(i>0&&i<n)svg.appendChild(el('line',{x1:X(i),x2:X(i),y1:MT,y2:MT+PH,class:'qt'}))});
  R.rows.forEach(function(s){
    var lastGood=(D.lastReal[s.k]!==undefined?Math.min(R.i1,D.lastReal[s.k]):R.i1)-R.i0;
    var dd='',started=false;
    for(var i=0;i<=Math.min(lastGood,n-1);i++){var v=s.res.nav[i];
      if(v===null||!isFinite(v)||v<=0)continue;
      dd+=(started?'L':'M')+X(i).toFixed(2)+' '+Y(v).toFixed(2);started=true}
    if(dd)svg.appendChild(el('path',{d:dd,class:'ln',stroke:BC[s.k],'stroke-width':s.k==='Strategy'?2.2:1.35}));
    if(lastGood<n-1){var A=s.res.nav[lastGood],B=s.res.nav[n-1];
      if(A&&B)svg.appendChild(el('path',{d:'M'+X(lastGood).toFixed(2)+' '+Y(A).toFixed(2)+'L'+X(n-1).toFixed(2)+' '+Y(B).toFixed(2),
        class:'ln dsh',stroke:BC[s.k],'stroke-width':s.k==='Strategy'?2.2:1.35}))}
  });
  var ch=el('line',{class:'xh',x1:0,x2:0,y1:MT,y2:MT+PH,opacity:0});svg.appendChild(ch);
  var dots=el('g');svg.appendChild(dots);
  var hit=el('rect',{x:ML,y:MT,width:PW,height:PH,fill:'transparent',style:'cursor:crosshair'});svg.appendChild(hit);
  var ro=$('#ro');
  function mv(ev){
    var rr=svg.getBoundingClientRect(),cx=ev.touches?ev.touches[0].clientX:ev.clientX;
    var i=Math.round(((cx-rr.left)/rr.width*W-ML)/PW*(n-1));i=Math.max(0,Math.min(n-1,i));
    if(isNaN(i))return;
    ch.setAttribute('x1',X(i));ch.setAttribute('x2',X(i));ch.setAttribute('opacity',1);dots.innerHTML='';
    var h='<div class="rd">'+D.dates[R.i0+i]+'</div>';
    R.rows.forEach(function(s){var v=s.res.nav[i];if(v===null||!isFinite(v))return;
      dots.appendChild(el('circle',{cx:X(i),cy:Y(v),r:3,fill:BC[s.k],stroke:'#fff','stroke-width':1.4}));
      h+='<div class="rr"><span style="color:'+BC[s.k]+'">'+BN[s.k]+'</span><b>'+money(v)+'</b></div>'});
    ro.innerHTML=h;ro.classList.add('on');
    ro.style.left=(X(i)/W*rr.width>rr.width*0.55)?'8px':(rr.width-ro.offsetWidth-8)+'px';
  }
  hit.addEventListener('mousemove',mv);
  hit.addEventListener('touchmove',function(e){mv(e);e.preventDefault()},{passive:false});
  hit.addEventListener('mouseleave',function(){ch.setAttribute('opacity',0);dots.innerHTML='';ro.classList.remove('on')});
}
function drawDD(){
  geo();
  var svg=$('#ddc');if(!svg)return;svg.innerHTML='';
  var n=R.i1-R.i0+1,h=MOB?170:130,mt=6,mb=MOB?46:18,ph=h-mt-mb;
  svg.setAttribute('viewBox','0 0 1000 '+h);
  function X(k){return ML+(n<2?0:k/(n-1))*PW}
  var lo=0;R.rows.forEach(function(s){var d=drawdown(s.res.nav);if(d.max<lo)lo=d.max});
  if(lo===0)lo=-0.01;
  function Y(v){return mt+(v/lo)*ph}
  [0,lo/2,lo].forEach(function(v){var y=Y(v);
    svg.appendChild(el('line',{x1:ML,x2:W-MR,y1:y.toFixed(1),y2:y.toFixed(1),class:'gl'}));
    var t=el('text',{x:ML-9,y:(y+3.5).toFixed(1),class:'ax','text-anchor':'end'});
    t.textContent=(v*100).toFixed(0)+'%';svg.appendChild(t)});
  R.rows.forEach(function(s){var dd=drawdown(s.res.nav).dd,d='',started=false;
    for(var i=0;i<dd.length;i++){var v=dd[i];if(v===null)continue;
      d+=(started?'L':'M')+X(i).toFixed(2)+' '+Y(v).toFixed(2);started=true}
    if(!d)return;
    if(s.k==='Strategy')svg.appendChild(el('path',{d:d+'L'+X(dd.length-1)+' '+Y(0)+'L'+X(0)+' '+Y(0)+'Z',fill:BC[s.k],opacity:.10}));
    svg.appendChild(el('path',{d:d,fill:'none',stroke:BC[s.k],'stroke-width':s.k==='Strategy'?1.6:1.1,opacity:s.k==='Strategy'?.9:.6}))});
}

/* ---------------- panels ---------------- */
function renderHead(){
  var m=R.strat.m;
  var c=[['Ending value',money(m.final),R.o.dca?'after '+money(m.invested)+' in':'from '+money(R.o.initial),'acc'],
         ['Profit',money(m.profit),pc(m.profit/m.invested,0)+' on money in',sg(m.profit)],
         ['Time-weighted',pc(m.cagr),'a year \u00b7 '+pc(m.twr,0)+' total',''],
         ['Money-weighted',pc(m.irr),'IRR on your cash flows',''],
         ['Deepest fall',pc(m.maxdd),D.dates[R.i0+m.ddInfo.troughIdx],'neg'],
         ['Volatility',pc0(m.vol),'Sharpe '+num(m.sharpe)+' \u00b7 Sortino '+num(m.sortino),''],
         ['Beta vs '+R.refK,num(m.beta),'alpha '+pc(m.alpha),''],
         ['Total contributed',money(m.invested),
          R.o.dca? money(R.o.initial)+' start + '+(R.strat.res.flows.length-1)+' \u00d7 '+money(R.o.dca)
                 : 'single payment, no top-ups','']];
  $('#head').innerHTML=c.map(function(x){
    return '<div class="stat"><div class="k">'+x[0]+'</div><div class="v '+x[3]+'">'+x[1]+'</div><div class="n">'+x[2]+'</div></div>'}).join('');
  $('#winTxt').textContent=D.dates[R.i0]+'  \u2192  '+D.dates[R.i1];
  $('#gapNote').style.display=R.gapped?'block':'none';
  if(R.gapped)$('#gapNote').innerHTML='Benchmark data runs to <b>'+D.dates[R.cmpEnd]+
    '</b>. Lines are dashed past that point and the relative statistics (beta, alpha, correlation, capture, tracking error) stop there.';
}
function metricDefs(){
  return [['Ending value',function(m){return money(m.final)},''],
    ['Total return',function(m){return pc(m.twr,0)},'t'],['CAGR',function(m){return pc(m.cagr)},'t'],
    ['IRR',function(m){return pc(m.irr)},'t'],['Volatility',function(m){return pc0(m.vol)},''],
    ['Max drawdown',function(m){return pc(m.maxdd)},'neg'],['Sharpe',function(m){return num(m.sharpe)},''],
    ['Sortino',function(m){return num(m.sortino)},''],['Calmar',function(m){return num(m.calmar)},''],
    ['Beta',function(m){return num(m.beta)},''],['Alpha',function(m){return pc(m.alpha)},'t'],
    ['Correlation',function(m){return num(m.corr)},''],['Tracking error',function(m){return pc0(m.te)},''],
    ['Info ratio',function(m){return num(m.ir)},''],['Up capture',function(m){return pc0(m.upcap,0)},''],
    ['Down capture',function(m){return pc0(m.downcap,0)},''],['% days up',function(m){return pc0(m.pos,0)},''],
    ['Worst day',function(m){return pc(m.worst)},'neg'],['Daily VaR 95%',function(m){return pc(m.var95)},'neg']];
}
function cls(kind,v){
  if(kind==='neg')return 'neg';
  if(kind!=='t')return '';
  var c=String(v).charAt(0);
  return c==='\u2212'?'neg':(c==='+'?'pos':'');
}
function renderMetrics(){
  var cols=metricDefs();
  setTxt('#refNote','Beta, alpha, correlation, tracking error, information ratio and capture ratios are measured against '+BN[R.refK]+'.');
  if(MOB){
    // A 7-column table is unusable on a phone, so pivot: one block per series,
    // metrics stacked two-up inside it.
    var h='';
    R.rows.forEach(function(sname){
      h+='<div class="mcard"><div class="mchead"><span class="dot" style="background:'+BC[sname.k]+
         '"></span>'+BN[sname.k]+(sname.res.late?' <i>from '+D.dates[sname.res.startIdx]+'</i>':'')+'</div><div class="mgrid">';
      cols.forEach(function(c){
        var v=c[1](sname.m);
        h+='<div class="mi"><span>'+c[0]+'</span><b class="'+cls(c[2],v)+'">'+v+'</b></div>';
      });
      h+='</div></div>';
    });
    setHtml('#mtable','');
    setHtml('#mcards',h);
    return;
  }
  setHtml('#mcards','');
  var h='<thead><tr><th class="stk">Metric</th>'+R.rows.map(function(sn){
    return '<th><span class="dot" style="background:'+BC[sn.k]+'"></span>'+BN[sn.k]+
      (sn.res.late?'<i class="inc">from '+D.dates[sn.res.startIdx]+'</i>':'')+'</th>'}).join('')+'</tr></thead><tbody>';
  cols.forEach(function(c){h+='<tr><td class="stk">'+c[0]+'</td>';
    R.rows.forEach(function(sn){var v=c[1](sn.m);
      h+='<td class="'+cls(c[2],v)+'">'+v+'</td>'});h+='</tr>'});
  setHtml('#mtable',h+'</tbody>');
}

function divSeries(){
  var out=[],cum=0,nav=R.strat.res.nav;
  D.quarters.forEach(function(q){
    var qi=D.dates.indexOf(q.start);
    if(qi<R.i0||qi>R.i1)return;
    var cap=nav[qi-R.i0];
    if(cap===null||!isFinite(cap))return;
    var d=(q.dy||0)*cap;cum+=d;
    out.push({q:q.q,y:+q.q.split(' ')[1],qn:+q.q[1],amt:d,cum:cum,dy:q.dy||0});
  });
  return out;
}
function renderDiv(){
  var ds=divSeries();
  var wrap=$('#divWrap');
  if(!ds.length){if(wrap)wrap.style.display='none';return}
  if(wrap)wrap.style.display='';
  var svg=$('#divChart'); if(!svg)return;
  svg.innerHTML='';
  var h=MOB?300:240, ml=MOB?150:64, mr=MOB?120:58, mt=14, mb=MOB?58:34;
  var w=1000,pw=w-ml-mr,ph=h-mt-mb,m=ds.length;
  svg.setAttribute('viewBox','0 0 1000 '+h);
  var mx=Math.max.apply(null,ds.map(function(d){return d.amt}))||1;
  var cmx=ds[ds.length-1].cum||1,bw=pw/m*0.62;
  [0,mx/2,mx].forEach(function(v){var y=mt+ph-(v/mx)*ph;
    svg.appendChild(el('line',{x1:ml,x2:w-mr,y1:y.toFixed(1),y2:y.toFixed(1),class:'gl'}));
    var t=el('text',{x:ml-9,y:(y+3.5).toFixed(1),class:'ax','text-anchor':'end'});
    t.textContent='$'+Math.round(v).toLocaleString();svg.appendChild(t)});
  ds.forEach(function(d,i){var x=ml+(i+0.5)/m*pw,bh=(d.amt/mx)*ph;
    var r=el('rect',{x:(x-bw/2).toFixed(2),y:(mt+ph-bh).toFixed(2),width:bw.toFixed(2),
      height:Math.max(1,bh).toFixed(2),class:'dbar'});
    var ti=el('title',{}); ti.textContent=d.q+'  '+money(d.amt)+'   ('+(d.dy*100).toFixed(2)+'% of capital)';
    r.appendChild(ti); svg.appendChild(r);
    var showYr = d.qn===1 && (!MOB || d.y%2===0);
    if(showYr){var t=el('text',{x:x.toFixed(1),y:h-14,class:'ax','text-anchor':'middle'});
      t.textContent=MOB?("'"+String(d.y).slice(2)):d.y;svg.appendChild(t)}});
  var p='';ds.forEach(function(d,i){p+=(i?'L':'M')+(ml+(i+0.5)/m*pw).toFixed(2)+' '+(mt+ph-(d.cum/cmx)*ph).toFixed(2)});
  svg.appendChild(el('path',{d:p,class:'dcum'}));
  [0,cmx/2,cmx].forEach(function(v){var y=mt+ph-(v/cmx)*ph;
    var t=el('text',{x:w-mr+9,y:(y+3.5).toFixed(1),class:'ax','text-anchor':'start'});
    t.textContent='$'+Math.round(v/1000)+'k';svg.appendChild(t)});
  var lb=el('text',{x:w-mr+9,y:mt-2,class:'ax','text-anchor':'start'});lb.textContent='cumulative';svg.appendChild(lb);
  var tot=ds[ds.length-1].cum,inv=R.strat.m.invested;
  var last4=ds.slice(-4).reduce(function(a,b){return a+b.amt},0);
  setHtml('#divStats',
    '<div class="ds"><span>Collected in window</span><b>'+money(tot)+'</b></div>'+
    '<div class="ds"><span>Share of ending value</span><b>'+pc0(tot/R.strat.m.final,1)+'</b></div>'+
    '<div class="ds"><span>Last four quarters</span><b>'+money(last4)+'</b></div>'+
    '<div class="ds"><span>Yield on money invested</span><b>'+pc0(last4/inv,2)+'</b></div>');
  setTxt('#divBasisTxt', D.divBasis||'');
}

function componentPL(){
  var nav=R.strat.res.nav, byT={}, qs=[];
  var flowAt={}; R.strat.res.flows.forEach(function(f){flowAt[f.i]=(flowAt[f.i]||0)+f.amt});
  var list=[];
  D.quarters.forEach(function(q){
    var a=D.dates.indexOf(q.start), b=D.dates.indexOf(q.end);
    if(a<0||b<0||b<R.i0||a>R.i1)return;
    list.push({q:q,a:a,b:b});
  });
  list.forEach(function(x,k){
    var A=Math.max(x.a,R.i0);
    // Run each holding period through to the NEXT rebalance, not to the quarter's
    // last close. Otherwise the one-day move between a quarter closing and the next
    // opening belongs to no one, and the pieces stop adding up to the portfolio.
    var B=(k<list.length-1)? Math.min(list[k+1].a,R.i1) : Math.min(x.b,R.i1);
    if(B<=A)return;
    var open=nav[A-R.i0], close=nav[B-R.i0];
    if(open===null||close===null||!isFinite(open)||!isFinite(close))return;
    var contrib=0;
    for(var i=A+1;i<=B;i++) contrib+=(flowAt[i]||0);
    var q=x.q;
    var names=q.holdings.filter(function(t){return q.cret[t]!==undefined});
    var n=names.length||1, raw={}, sum=0;
    names.forEach(function(t){raw[t]=q.cret[t]/n; sum+=raw[t]});
    // Each name's own price move, then share out whatever the quarter actually
    // did beyond that - the handover day, dividends, mid-quarter contributions -
    // equally across the names held. Additive, so it cannot blow up when the
    // component returns happen to cancel out.
    var actual=close-open-contrib, cell={}, base=0;
    names.forEach(function(t){ cell[t]=open*raw[t]; base+=cell[t] });
    var resid=(actual-base)/n;
    names.forEach(function(t){ cell[t]+=resid });
    qs.push({q:q.q,start:q.start,end:q.end,names:names,cell:cell,cret:q.cret,
             open:open,close:close,gain:actual,contrib:contrib,
             ret:(close-contrib)/open-1,
             partial:(A!==x.a||B<x.b)});
    names.forEach(function(t){
      var d=byT[t]||(byT[t]={t:t,pl:0,held:0,wins:0});
      d.pl+=cell[t]; d.held++; if(q.cret[t]>0)d.wins++;
    });
  });
  var rows=Object.keys(byT).map(function(t){return byT[t]});
  rows.sort(function(x,y){return y.pl-x.pl});
  return {rows:rows,qs:qs};
}

function renderComponentPL(){
  var cp=componentPL(); R._cp=cp;
  if(!cp.rows.length){setHtml('#plTable','');return}
  var mx=Math.max.apply(null,cp.rows.map(function(r){return Math.abs(r.pl)}))||1;
  var tot=cp.rows.reduce(function(a,b){return a+b.pl},0);
  if(MOB){
    var mh='';
    cp.rows.forEach(function(r){
      mh+='<div class="lrow"><div class="lmain"><b>'+r.t+'</b>'+
        '<em class="'+sg(r.pl)+'">'+money(r.pl)+'</em></div>'+
        '<div class="lsub">'+r.held+' quarters \u00b7 '+Math.round(r.wins/r.held*100)+'% up \u00b7 '+
        money(r.pl/r.held)+' avg \u00b7 '+(tot>0?pc0(r.pl/tot,1):'\u2014')+' of total</div>'+
        '<div class="ltrack"><i style="width:'+(Math.abs(r.pl)/mx*100).toFixed(1)+'%;background:'+
        (r.pl>=0?'var(--gain)':'var(--loss)')+'"></i></div></div>';
    });
    mh+='<div class="lrow tot"><div class="lmain"><b>Total</b><em class="'+sg(tot)+'">'+money(tot)+'</em></div></div>';
    setHtml('#plTable','');setHtml('#plList',mh);
  }else{
  setHtml('#plList','');
  var h='<thead><tr><th>Name</th><th>Quarters held</th><th>Quarters up</th>'+
        '<th>Total P&amp;L</th><th>Avg per quarter</th><th>Share</th><th></th></tr></thead><tbody>';
  cp.rows.forEach(function(r){
    h+='<tr><td style="font-weight:600">'+r.t+'</td><td>'+r.held+'</td>'+
       '<td>'+Math.round(r.wins/r.held*100)+'%</td>'+
       '<td class="'+sg(r.pl)+'">'+money(r.pl)+'</td>'+
       '<td class="'+sg(r.pl)+'">'+money(r.pl/r.held)+'</td>'+
       '<td>'+(tot>0?pc0(r.pl/tot,1):'\u2014')+'</td>'+
       '<td class="barcell"><span class="bar" style="width:'+(Math.abs(r.pl)/mx*100).toFixed(1)+
         '%;background:'+(r.pl>=0?'var(--gain)':'var(--loss)')+'"></span></td></tr>';
  });
  h+='<tr class="tot"><td>Total</td><td></td><td></td><td class="'+sg(tot)+'">'+money(tot)+
     '</td><td></td><td>100%</td><td></td></tr>';
  setHtml('#plTable',h+'</tbody>');}
  var prof=R.strat.m.profit;
  setTxt('#plRecon','These add up to '+money(tot)+' against a portfolio profit of '+money(prof)+
    (Math.abs(tot-prof)>Math.max(1,Math.abs(prof)*0.005) ? ' \u2014 the difference is rounding.' : '.'));
}

function ddEpisodes(nav){
  var eps=[],peak=null,peakI=0,inEp=false,trough=0,troughI=0;
  for(var i=0;i<nav.length;i++){
    var v=nav[i]; if(v===null||!isFinite(v)||v<=0)continue;
    if(peak===null||v>=peak){
      if(inEp){eps.push({peakI:peakI,troughI:troughI,recI:i,depth:trough/peak-1});inEp=false}
      peak=v;peakI=i;
    }else{
      if(!inEp){inEp=true;trough=v;troughI=i}
      else if(v<trough){trough=v;troughI=i}
    }
  }
  if(inEp)eps.push({peakI:peakI,troughI:troughI,recI:null,depth:trough/peak-1});
  return eps.filter(function(e){return e.depth<-0.03})
            .sort(function(a,b){return a.depth-b.depth});
}
function renderDrawdowns(){
  var eps=ddEpisodes(R.strat.res.nav).slice(0,12);
  if(!eps.length){setHtml('#ddTable','');setHtml('#ddStats','');return}
  var mx=Math.abs(eps[0].depth);
  if(MOB){
    var mh='';
    eps.forEach(function(e){
      var pd=D.dates[R.i0+e.peakI], td=D.dates[R.i0+e.troughI];
      var rd=e.recI===null?null:D.dates[R.i0+e.recI];
      var fall=days(pd,td), rec=rd?days(td,rd):null;
      mh+='<div class="lrow"><div class="lmain"><b class="neg">'+pc(e.depth)+'</b>'+
        '<em>'+(rec===null?'not recovered':dur(fall+rec)+' round trip')+'</em></div>'+
        '<div class="lsub">'+pd+' \u2192 '+td+(rd?' \u2192 '+rd:'')+'</div>'+
        '<div class="lsub">fell over '+dur(fall)+' \u00b7 '+(rec===null?'still under water':'back in '+dur(rec))+'</div>'+
        '<div class="ltrack"><i style="width:'+(Math.abs(e.depth)/mx*100).toFixed(0)+
        '%;background:var(--loss)"></i></div></div>';
    });
    setHtml('#ddTable','');setHtml('#ddList',mh);
  }else{
  setHtml('#ddList','');
  var h='<thead><tr><th>Depth</th><th></th><th>Peak</th><th>Trough</th><th>Recovered</th>'+
        '<th>Fall</th><th>Recovery</th><th>Total</th></tr></thead><tbody>';
  eps.forEach(function(e){
    var pd=D.dates[R.i0+e.peakI], td=D.dates[R.i0+e.troughI];
    var rd=e.recI===null?null:D.dates[R.i0+e.recI];
    var fall=days(pd,td), rec=rd?days(td,rd):null;
    h+='<tr><td class="neg" style="font-weight:600">'+pc(e.depth)+'</td>'+
       '<td class="barcell"><span class="bar" style="width:'+(Math.abs(e.depth)/mx*100).toFixed(0)+
         '%;background:var(--loss)"></span></td>'+
       '<td class="dim">'+pd+'</td><td class="dim">'+td+'</td>'+
       '<td class="'+(rd?'dim':'neg')+'">'+(rd||'still under water')+'</td>'+
       '<td>'+dur(fall)+'</td><td>'+dur(rec)+'</td>'+
       '<td>'+(rec===null?'\u2014':dur(fall+rec))+'</td></tr>';
  });
  setHtml('#ddTable',h+'</tbody>');}
  var under=eps.filter(function(e){return e.recI===null}).length;
  var done=eps.filter(function(e){return e.recI!==null});
  var ar=done.length?done.reduce(function(a,e){
    return a+days(D.dates[R.i0+e.troughI],D.dates[R.i0+e.recI])},0)/done.length:null;
  setHtml('#ddStats',
    '<div class="ds"><span>Falls over 3%</span><b>'+eps.length+'</b></div>'+
    '<div class="ds"><span>Deepest</span><b class="neg">'+pc(eps[0].depth)+'</b></div>'+
    '<div class="ds"><span>Typical recovery</span><b>'+(ar?dur(Math.round(ar)):'\u2014')+'</b></div>'+
    '<div class="ds"><span>Under water now</span><b>'+(under?'yes':'no')+'</b></div>');
}

function renderBook(){
  var cp=R._cp; if(!cp||!cp.qs.length){setHtml('#bookWrap2','');return}
  if(R._bookIdx===undefined||R._bookIdx>=cp.qs.length)R._bookIdx=cp.qs.length-1;
  var i=R._bookIdx, q=cp.qs[i], prev=i>0?cp.qs[i-1]:null;
  var inn=prev?q.names.filter(function(t){return prev.names.indexOf(t)<0}):[];
  var out=prev?prev.names.filter(function(t){return q.names.indexOf(t)<0}):[];
  var head='<div class="bnav">'+
    '<button class="chip" id="bPrev"'+(i===0?' disabled':'')+'>\u25c0</button>'+
    '<div class="btitle"><b>'+q.q+'</b><span>'+q.start+' \u2013 '+q.end+
      (q.partial?' \u00b7 clipped to window':'')+'</span></div>'+
    '<button class="chip" id="bNext"'+(i===cp.qs.length-1?' disabled':'')+'>\u25b6</button>'+
    '<div class="bsum"><span>Opened</span><b>'+money(q.open)+'</b></div>'+
    '<div class="bsum"><span>Closed</span><b>'+money(q.close)+'</b></div>'+
    '<div class="bsum"><span>Return</span><b class="'+sg(q.ret)+'">'+pc(q.ret)+'</b></div></div>';
  var sorted=q.names.slice().sort(function(a,b){return q.cret[b]-q.cret[a]});
  var tiles=sorted.map(function(t){
    return '<div class="tile" style="background:'+ramp(q.cret[t])+'">'+
      (inn.indexOf(t)>=0?'<i class="badge">new</i>':'')+
      '<b>'+t+'</b><u>'+pc(q.cret[t])+'</u><s>'+compact(q.cell[t])+'</s></div>';
  }).join('');
  var chg=(out.length||inn.length)?'<div class="bchg">'+
      (out.length?'<span class="gone">Left: '+out.join(', ')+'</span>':'')+
      (inn.length?'<span class="came">Joined: '+inn.join(', ')+'</span>':'')+'</div>':'';
  var strip='<div class="qstrip">'+cp.qs.map(function(x,j){
    return '<i class="'+(j===i?'on':'')+'" data-j="'+j+'" title="'+x.q+'  '+pc(x.ret)+
      '" style="background:'+ramp(x.ret)+'"></i>'}).join('')+'</div>';
  setHtml('#bookWrap2', head+'<div class="tiles">'+tiles+'</div>'+chg+strip);
  var p=$('#bPrev'),n=$('#bNext');
  if(p)p.addEventListener('click',function(){if(R._bookIdx>0){R._bookIdx--;renderBook()}});
  if(n)n.addEventListener('click',function(){if(R._bookIdx<cp.qs.length-1){R._bookIdx++;renderBook()}});
  $$('#bookWrap2 .qstrip i').forEach(function(e){
    e.addEventListener('click',function(){R._bookIdx=+this.dataset.j;renderBook()})});
}


function ramp(v){
  var C=0.30, t=Math.max(-1,Math.min(1,v/C)), mid=[241,243,247];
  var end = t>=0?[20,102,59]:[179,38,30], a=Math.pow(Math.abs(t),0.72);
  return 'rgb('+mid.map(function(c,i){return Math.round(c+(end[i]-c)*a)}).join(',')+')';
}

function renderHeat(){
  var mo=monthly(D.series.Strategy,R.i0,R.i1),ks=Object.keys(mo).sort();
  if(!ks.length){setHtml('#heat','');return}
  var yrs=[];ks.forEach(function(k){var y=k.slice(0,4);if(yrs.indexOf(y)<0)yrs.push(y)});
  var mx=Math.max.apply(null,ks.map(function(k){return Math.abs(mo[k])}))||0.01;
  var MM=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var h='<thead><tr><th>Year</th>'+MM.map(function(m){
    return '<th>'+(MOB?m.charAt(0):m)+'</th>'}).join('')+'<th>Year</th></tr></thead><tbody>';
  var ys=[];
  yrs.forEach(function(y){h+='<tr><td class="yr">'+y+'</td>';var pr=1,any=false;
    for(var m=1;m<=12;m++){
      var k=y+'-'+(m<10?'0':'')+m,v=mo[k];
      if(v===undefined){h+='<td><span class="hc empty"></span></td>';continue}
      any=true;pr*=(1+v);var a=Math.pow(Math.abs(v)/mx,.65);
      var col=v>=0?'rgba(27,122,70,'+(0.10+0.62*a).toFixed(3)+')':'rgba(179,38,30,'+(0.10+0.62*a).toFixed(3)+')';
      h+='<td><span class="hc" style="background:'+col+'" title="'+k+'  '+pc(v,2)+'">'+
         (MOB?'':(v*100).toFixed(1))+'</span></td>'}
    ys.push({y:y,r:pr-1,any:any});
    h+='<td class="ycell" data-y="'+y+'"></td></tr>'});
  setHtml('#heat',h+'</tbody>');
  var ymx=Math.max.apply(null,ys.map(function(x){return Math.abs(x.r)}))||0.01;
  ys.forEach(function(x){
    var c=document.querySelector('#heat td.ycell[data-y="'+x.y+'"]'); if(!c)return;
    if(!x.any){c.innerHTML='';return}
    var w=Math.abs(x.r)/ymx*100, pos=x.r>=0;
    c.innerHTML='<div class="ybar"><span class="yv '+sg(x.r)+'">'+pc(x.r,1)+'</span>'+
      '<span class="ytrack"><i style="width:'+w.toFixed(1)+'%;background:'+
      (pos?'var(--gain)':'var(--loss)')+'"></i></span></div>';
  });
}

function renderRibbon(){
  var cp=R._cp; if(!cp||!cp.qs.length){setHtml('#ribbon','');return}
  var h='<thead><tr><th class="tt"></th>'+cp.qs.map(function(q){
    return '<th class="qh">'+q.q+'</th>'}).join('')+
    '<th class="tl">P&amp;L</th></tr></thead><tbody>';
  cp.rows.forEach(function(r){
    h+='<tr><th class="tt">'+r.t+'</th>';
    cp.qs.forEach(function(q){
      var v=q.cret[r.t];
      if(v===undefined){h+='<td class="rc"><div class="cb off"></div></td>';return}
      var tip=r.t+' \u00b7 '+q.q+' \u00b7 '+pc(v)+' \u00b7 '+money(q.cell[r.t]);
      h+='<td class="rc"><div class="cb on" style="background:'+ramp(v)+'" title="'+tip+'">'+
         (MOB?'':'<em>'+compact(q.cell[r.t])+'</em><i>'+pc(v,0)+'</i>')+'</div></td>';
    });
    h+='<td class="tl '+sg(r.pl)+'">'+(MOB?compact(r.pl):money(r.pl))+'</td></tr>';
  });
  setHtml('#ribbon',h+'</tbody>');
  var sc=$('#scale'); if(sc){var g='';
    for(var i=0;i<=20;i++)g+='<i style="background:'+ramp(-0.3+i*0.03)+'"></i>';
    sc.innerHTML=g}
}

function renderQ(){
  var qs=D.quarters.filter(function(q){return q.end>=D.dates[R.i0]&&q.start<=D.dates[R.i1]});
  if(MOB){
    var mh='',prev0=null;
    D.quarters.forEach(function(q){
      var inn=prev0?q.holdings.filter(function(t){return prev0.indexOf(t)<0}):[];
      var out=prev0?prev0.filter(function(t){return q.holdings.indexOf(t)<0}):[];
      var show=qs.indexOf(q)>=0; prev0=q.holdings; if(!show)return;
      var chg=(inn.length||out.length)
        ? (out.length?'<span class="gone">out '+out.join(', ')+'</span> ':'')+
          (inn.length?'<span class="came">in '+inn.join(', ')+'</span>':'')
        : '<span class="dim">roster unchanged</span>';
      mh+='<div class="lrow"><div class="lmain"><b>'+q.q+'</b><em class="'+sg(q.tot)+'">'+pc(q.tot)+'</em></div>'+
          '<div class="lsub">'+q.start+' \u2013 '+q.end+' \u00b7 '+q.n+' names</div>'+
          '<div class="lsub chg">'+chg+'</div></div>';
    });
    setHtml('#qtable','');setHtml('#qList',mh);return;
  }
  setHtml('#qList','');
  var h='<thead><tr><th>Quarter</th><th>Window</th><th>Return</th><th>Names</th><th>Roster change</th></tr></thead><tbody>';
  var prev=null;
  D.quarters.forEach(function(q){
    var inn=prev?q.holdings.filter(function(t){return prev.indexOf(t)<0}):[];
    var out=prev?prev.filter(function(t){return q.holdings.indexOf(t)<0}):[];
    var shown=qs.indexOf(q)>=0;prev=q.holdings;if(!shown)return;
    var chg=(inn.length||out.length)
      ?out.map(function(t){return '<s>'+t+'</s>'}).join(' ')+(out.length&&inn.length?' \u2192 ':'')+inn.map(function(t){return '<b>'+t+'</b>'}).join(' ')
      :'<span class="dim">no change</span>';
    h+='<tr><td class="qn">'+q.q+'</td><td class="dim">'+q.start+' \u2013 '+q.end+'</td><td class="'+sg(q.tot)+'">'+pc(q.tot)+
       '</td><td>'+q.n+'</td><td class="chg">'+chg+'</td></tr>'});
  setHtml('#qtable',h+'</tbody>');
}

function render(){summarise();renderHead();drawGrowth();drawDD();renderMetrics();renderDrawdowns();renderDiv();renderHeat();renderComponentPL();renderRibbon();renderBook();renderQ()}

/* ---------------- controls ---------------- */
function summarise(){
  var lab={YTD:'YTD','1Y':'1 year','3Y':'3 years','5Y':'5 years',MAX:'All time',CUSTOM:'Custom'};
  var fr={none:'',daily:'daily',weekly:'weekly',biweekly:'fortnightly',monthly:'monthly',
          quarterly:'quarterly',semiannually:'twice a year',annually:'yearly'};
  var t=(lab[state.period]||state.period)+' \u00b7 '+money(state.initial);
  if(state.dca>0&&state.freq!=='none')t+=' + '+money(state.dca)+' '+fr[state.freq];
  setTxt('#mbTxt',t);
}
function openSheet(){var p=$('#panelBody');if(p)p.classList.add('open');
  document.body.classList.add('noscroll');var b=$('#mobBar');if(b)b.setAttribute('aria-expanded','true')}
function closeSheet(){var p=$('#panelBody');if(p)p.classList.remove('open');
  document.body.classList.remove('noscroll');var b=$('#mobBar');if(b)b.setAttribute('aria-expanded','false')}

function build(){
  $('#benchChips').innerHTML=Object.keys(state.show).map(function(k){
    return '<button class="chip" data-b="'+k+'" aria-pressed="'+!!state.show[k]+'" style="color:'+BC[k]+
      '"><span class="sw"></span>'+k+'</button>'}).join('');
  $('#refSel').innerHTML=Object.keys(state.show).map(function(k){
    return '<option value="'+k+'"'+(k===state.ref?' selected':'')+'>'+BN[k]+'</option>'}).join('');
  $('#benchChips').addEventListener('click',function(e){var b=e.target.closest('button[data-b]');if(!b)return;
    var k=b.dataset.b;state.show[k]=!state.show[k];b.setAttribute('aria-pressed',state.show[k]);compute()});
  $$('#periodBtns .chip').forEach(function(b){b.addEventListener('click',function(){
    $$('#periodBtns .chip').forEach(function(x){x.setAttribute('aria-pressed','false')});
    b.setAttribute('aria-pressed','true');state.period=b.dataset.p;
    $('#customRow').style.display=state.period==='CUSTOM'?'flex':'none';compute()})});
  function bind(id,key,fn){var e=$(id);
    e.addEventListener('change',function(){state[key]=fn(e);compute()});
    e.addEventListener('input',function(){clearTimeout(window._t);
      window._t=setTimeout(function(){state[key]=fn(e);compute()},320)})}
  bind('#initial','initial',function(e){return Math.max(1,+e.value||0)});
  bind('#dca','dca',function(e){return Math.max(0,+e.value||0)});
  bind('#rf','rf',function(e){return (+e.value||0)/100});
  $('#freq').addEventListener('change',function(){state.freq=this.value;compute()});
  $('#refSel').addEventListener('change',function(){state.ref=this.value;compute()});
  $('#from').addEventListener('change',function(){state.from=this.value;compute()});
  $('#to').addEventListener('change',function(){state.to=this.value;compute()});
  $('#logBtn').addEventListener('click',function(){state.log=!state.log;
    this.setAttribute('aria-pressed',state.log);this.textContent=state.log?'Log scale':'Linear scale';drawGrowth()});
  var bar=$('#mobBar'); if(bar)bar.addEventListener('click',function(){
    var p=$('#panelBody'); if(p&&p.classList.contains('open'))closeSheet(); else openSheet()});
  var done=$('#sheetDone'); if(done)done.addEventListener('click',closeSheet);
  $('#from').min=$('#to').min=D.dates[0];$('#from').max=$('#to').max=LAST;
  $('#from').value=state.from=D.dates[0];$('#to').value=state.to=LAST;
  window.addEventListener('resize',function(){clearTimeout(window._rz);
    window._rz=setTimeout(function(){geo();drawGrowth();drawDD();renderDiv()},170)});
}

/* ---------------- boot ---------------- */
var LOADED=false;
fetch('portfolio.json?v='+Date.now()).then(function(r){
  if(!r.ok)throw new Error('HTTP '+r.status+' fetching portfolio.json');
  return r.json()
}).then(function(j){
  LOADED=true;
  D=j;N=D.dates.length-1;LAST=D.dates[N];
  Object.keys(state.show).forEach(function(k){if(!D.series[k])delete state.show[k]});
  if(!D.series[state.ref])state.ref=Object.keys(state.show)[0];
  document.body.classList.remove('loading');
  document.body.classList.toggle('mob',MOB);
  setTxt('#asOf', D.asOf);
  setTxt('#gen', String(D.generated).replace('T',' ').replace('Z',' UTC'));
  setTxt('#turn', D.avgTurnover);
  setTxt('#nq', D.nQuarters);
  setTxt('#nc', D.nComponents);
  build();compute();
}).catch(function(e){
  document.body.classList.remove('loading');
  console.error(e);
  var msg = LOADED
    ? '<b>The data loaded, but the page failed to draw it.</b><br>'+
      'Error: <code>'+e.message+'</code><br>This is a bug in app.js, not a data problem.'
    : '<b>Could not load the data file.</b><br>'+
      'portfolio.json did not load (<code>'+e.message+'</code>). If you are opening this page '+
      'directly from disk, browsers block local fetch requests \u2014 serve the folder over HTTP '+
      'instead, for example <code>python3 -m http.server</code> from this directory.';
  setHtml('#boot', '<div class="err">'+msg+'</div>');
});
})();
