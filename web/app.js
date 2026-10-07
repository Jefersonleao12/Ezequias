(function(){
'use strict';
const VERSAO='3.0.0';
const SYNC_MS=30000;
const CFG=Object.assign({},window.FINANCAS_CONFIG);
const API_URL=CFG.supabaseUrl&&CFG.supabaseKey?CFG.supabaseUrl.replace(/\/+$/,'')+'/rest/v1/rpc/api':'';
const $=s=>document.querySelector(s);
const brl=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const brl0=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MES3=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const TIPOS=['Necessidade','Desejo','Poupança/Dívida'];
const TCOR={'Necessidade':'var(--need)','Desejo':'var(--want)','Poupança/Dívida':'var(--save)'};
const EMO={'Moradia':'🏠','Contas':'💡','Mercado':'🛒','Transporte':'🚗','Saúde':'💊','Educação':'📚','Lazer':'🎬','Restaurante':'🍽️','Compras':'🛍️','Vestuário':'👕','Assinaturas':'🔁','Poupança':'🐷','Investimento':'📈','Dívidas':'💳','Outros':'📦','Animais':'🐾'};
const PAL=['#3765CF','#C8407A','#C9920F','#12805F','#7A52C7','#D2672A','#1B8FA6','#A64D9B','#5E7F1F','#B5485A','#3E7C8C','#8C6A2E','#4E5FBF','#2F8E6E','#9A5A3A','#6B6B8F'];

/* ---------- armazenamento local (pode falhar em modo privado) ---------- */
const LS={
  get(k){try{return localStorage.getItem('mf:'+k);}catch(_){return null;}},
  set(k,v){try{v==null?localStorage.removeItem('mf:'+k):localStorage.setItem('mf:'+k,v);}catch(_){}},
  json(k){try{return JSON.parse(LS.get(k));}catch(_){return null;}}
};

let S={lanc:[],guia:[],cats:[],renda:0,metas:[.5,.3,.2],url:'',usuarios:[],mes:'',tab:'inicio',filtro:'',busca:'',pessoa:'',
  me:LS.json('me'),token:LS.get('token'),api:LS.get('api')==='demo'?'demo':API_URL,offline:false,sync:0,pronto:false};
const DEMO_MODE=()=>S.api==='demo';

/* ---------- API ---------- */
async function api(acao,dados){
  if(DEMO_MODE())return demoCall(acao,dados);
  let r;
  try{
    r=await fetch(S.api,{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json',apikey:CFG.supabaseKey},
      body:JSON.stringify({acao,token:S.token||null,dados:dados||{}})});
  }catch(_){
    throw new Error(navigator.onLine===false?'Sem internet no momento.':'Não consegui falar com o banco de dados. Confira a internet.');
  }
  if(!r.ok)throw new Error(r.status===401||r.status===403?'Chave do Supabase inválida (confira o config.js).':'O servidor respondeu com erro '+r.status+'.');
  let j;try{j=await r.json();}catch(_){throw new Error('Resposta inesperada do servidor.');}
  if(!j.ok){
    if(j.auth&&acao!=='login'){sair();throw new Error(j.erro);}
    throw new Error(j.erro||'Erro desconhecido.');
  }
  return j.dados;
}
function novoUid(){return (crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));}

/* ---------- dados ---------- */
function aplicar(d){
  S.lanc=d.lancamentos||[];S.guia=d.guia||[];S.renda=d.renda||0;S.url=d.url||'';
  S.usuarios=d.usuarios&&d.usuarios.length?d.usuarios:S.usuarios;
  S.metas=(d.metas&&d.metas.length===3&&d.metas.some(Boolean))?d.metas:[.5,.3,.2];
  const set=new Set();S.guia.forEach(g=>set.add(g.cat));(d.categorias||[]).forEach(c=>c&&set.add(c));S.lanc.forEach(l=>l.cat&&set.add(l.cat));
  S.cats=[...set];
  if(S.me){const u=S.usuarios.find(u=>u.id===S.me.id);if(u&&u.nome!==S.me.nome){S.me=u;LS.set('me',JSON.stringify(u));}}
  if(!S.mes){const hoje=mesDe(isoHoje());S.mes=S.lanc.some(l=>mesDe(l.data)===hoje)||!S.lanc.length?hoje:S.lanc.map(l=>mesDe(l.data)).sort().pop();}
  S.pronto=true;
}
function isoHoje(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
const mesDe=iso=>iso.slice(0,7);
function mesNome(m){const[y,mm]=m.split('-').map(Number);return MESES[mm-1]+' '+y;}
function somaMes(m,delta){let[y,mm]=m.split('-').map(Number);mm+=delta;while(mm<1){mm+=12;y--;}while(mm>12){mm-=12;y++;}return y+'-'+String(mm).padStart(2,'0');}
const doMes=m=>S.lanc.filter(l=>mesDe(l.data)===m);
const soma=L=>L.reduce((a,l)=>a+l.valor,0);
const tipoDe=cat=>{const g=S.guia.find(g=>g.cat===cat);return g&&TIPOS.includes(g.tipo)?g.tipo:'';};
const exemplosDe=cat=>{const g=S.guia.find(g=>g.cat===cat);return g?g.ex.split(',').map(s=>s.trim()).filter(Boolean):[];};
const corCat=cat=>PAL[Math.max(0,S.cats.indexOf(cat))%PAL.length];
const emo=cat=>EMO[cat]||'•';
function tipoReal(l){return TIPOS.includes(l.tipo)?l.tipo:(tipoDe(l.cat)||'');}
/* pessoas */
function pessoas(){return S.usuarios.map((u,i)=>({id:u.id,nome:u.nome,cor:'var(--p'+(i%2)+')'}));}
function pessoa(id){return pessoas().find(p=>p.id===id)||{id:'',nome:'Sem autor',cor:'var(--px)'};}
function ini(nome){return esc((nome||'?').trim().charAt(0).toUpperCase());}
function tag(id){const p=pessoa(id);return '<span class="who" style="--c:'+p.cor+'">'+esc(p.nome)+'</span>';}
function porPessoa(L){const r=pessoas().map(p=>Object.assign({},p,{v:soma(L.filter(l=>l.quem===p.id))}));
  const sem=soma(L.filter(l=>!r.some(p=>p.id===l.quem)));if(sem)r.push(Object.assign(pessoa(''),{v:sem}));return r;}
function chave(l){return l.linha+'|'+l.data+'|'+l.valor+'|'+l.quem;}

/* ---------- render ---------- */
function render(){
  document.body.classList.remove('gate');
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-current',t.dataset.tab===S.tab));
  const ativo=document.activeElement,id=ativo&&ativo.id,pos=ativo&&ativo.selectionStart;
  const v={inicio:vInicio,extrato:vExtrato,relatorios:vRel,ajustes:vAjustes}[S.tab]();
  $('#app').innerHTML=v;bind();
  if(id&&$('#'+id)){const n=$('#'+id);n.focus();if(pos!=null&&n.setSelectionRange)try{n.setSelectionRange(pos,pos);}catch(_){}}
}
function topo(titulo){
  return '<div class="top"><div class="hello">'+titulo+'</div>'+
  '<div class="month"><button data-m="-1" aria-label="Mês anterior">‹</button><b>'+mesNome(S.mes)+'</b><button data-m="1" aria-label="Próximo mês">›</button></div></div>'+
  (DEMO_MODE()?'<div class="banner">Modo demonstração com dados de exemplo. Nada é salvo de verdade.</div>':'')+
  (S.offline?'<div class="banner off">Sem conexão com o banco de dados. Mostrando os últimos dados salvos no aparelho.</div>':'');
}
function icone(cat){return '<div class="ico" style="background:color-mix(in srgb,'+corCat(cat)+' 16%,transparent)">'+emo(cat)+'</div>';}
function itemHtml(l){
  return '<button class="item" data-edit="'+l.linha+'">'+icone(l.cat)+'<div style="min-width:0"><div class="d">'+esc(l.desc||l.sub||l.cat)+'</div><div class="small muted sm">'+tag(l.quem)+' '+esc(l.cat)+(l.sub?' · '+esc(l.sub):'')+'</div></div><div class="val num">−'+brl(l.valor)+'</div></button>';
}
function vazio(msg){return '<div class="empty"><b>'+(msg||'Nenhum gasto neste mês')+'</b>Toque no + para registrar.</div>';}

function cardPessoas(L){
  const pp=porPessoa(L),tot=soma(L);
  let h='<div class="card ppl"><div class="split">'+(tot?pp.map(p=>'<i style="width:'+(p.v/tot*100)+'%;background:'+p.cor+'" title="'+esc(p.nome)+'"></i>').join(''):'')+'</div>';
  pp.forEach(p=>{h+='<div class="prow"><div class="av" style="--c:'+p.cor+'">'+ini(p.nome)+'</div><div><b>'+esc(p.nome)+'</b>'+(S.me&&p.id===S.me.id?' <span class="small muted">(você)</span>':'')+
    '<div class="small muted">'+(n=>n+' lançamento'+(n===1?'':'s'))(L.filter(l=>l.quem===p.id||(!p.id&&!pessoas().some(x=>x.id===l.quem))).length)+'</div></div><div class="val num">'+brl(p.v)+'<div class="small muted" style="font-weight:500">'+(tot?Math.round(p.v/tot*100):0)+'%</div></div></div>';});
  return h+'</div>';
}

function vInicio(){
  const L=doMes(S.mes),gasto=soma(L),sobra=S.renda-gasto;
  const pct=S.renda?Math.min(100,gasto/S.renda*100):0;
  let h=topo('Olá, '+esc(S.me?S.me.nome:'')+'!');
  h+='<div class="hero"><div class="lbl">'+(sobra>=0?'Sobra da casa no mês':'Faltando no mês')+'</div><div class="big num">'+brl(Math.abs(sobra))+'</div>'+
     '<div class="bar"><i style="width:'+pct+'%"></i></div>'+
     '<div class="row num"><span>Gasto '+brl(gasto)+'</span><span>Renda '+brl(S.renda)+'</span></div></div>';
  h+='<h2>Quem gastou</h2>'+cardPessoas(L);
  // 50-30-20
  h+='<h2>Regra 50-30-20</h2><div class="card rule">';
  TIPOS.forEach((t,i)=>{
    const v=soma(L.filter(l=>tipoReal(l)===t)),p=S.renda?v/S.renda:0,meta=S.metas[i]||0;
    const escala=Math.max(meta*1.6,p,.01);
    const acima=t!=='Poupança/Dívida'&&p>meta;
    h+='<div><div class="r-top"><b>'+t+'</b><span class="num"><b>'+Math.round(p*100)+'%</b> <span class="muted small">meta '+Math.round(meta*100)+'%</span></span></div>'+
       '<div class="track"><i style="width:'+Math.min(100,p/escala*100)+'%;background:'+TCOR[t]+'"></i><s style="left:'+Math.min(100,meta/escala*100)+'%"></s></div>'+
       '<div class="small '+(acima?'':'muted')+'" style="margin-top:4px;'+(acima?'color:var(--neg)':'')+'">'+brl(v)+(acima?' · acima da meta':'')+'</div></div>';
  });
  const semTipo=soma(L.filter(l=>!tipoReal(l)));
  if(semTipo)h+='<div class="small muted">'+brl(semTipo)+' sem tipo definido (fora da regra)</div>';
  h+='</div>';
  // categorias, com a barra dividida por pessoa
  const porCat={};L.forEach(l=>porCat[l.cat]=(porCat[l.cat]||0)+l.valor);
  const cats=Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
  h+='<h2>Por categoria</h2><div class="card">';
  if(!cats.length)h+=vazio();
  else{h+='<div class="cats">';const max=cats[0][1];
    cats.forEach(([c,v])=>{const pp=porPessoa(L.filter(l=>l.cat===c));
      h+='<div class="cat">'+icone(c)+'<div><div class="nm">'+esc(c)+'</div><div class="mini" style="width:'+(v/max*100)+'%">'+pp.map(p=>'<i style="width:'+(p.v/v*100)+'%;background:'+p.cor+'"></i>').join('')+'</div></div><div class="val num">'+brl(v)+'<div class="small muted" style="font-weight:500">'+(gasto?Math.round(v/gasto*100):0)+'%</div></div></div>';});
    h+='</div><div class="legend">'+porPessoa(L).map(p=>'<span style="--c:'+p.cor+'">'+esc(p.nome)+'</span>').join('')+'</div>';}
  h+='</div>';
  h+='<h2>Gasto por dia</h2><div class="card chart">'+graficoDias(L)+'</div>';
  const ult=[...L].sort((a,b)=>b.data.localeCompare(a.data)||b.linha-a.linha).slice(0,6);
  h+='<h2>Últimos lançamentos</h2><div class="card list">'+(ult.length?ult.map(itemHtml).join(''):vazio())+'</div>';
  return h;
}

function graficoDias(L){
  const[y,m]=S.mes.split('-').map(Number),n=new Date(y,m,0).getDate(),d=Array(n).fill(0);
  L.forEach(l=>{d[+l.data.slice(8,10)-1]+=l.valor;});
  const maior=Math.max(...d),max=Math.max(maior,1),W=320,H=120,bw=W/n,hojeIso=isoHoje();
  let s='<svg viewBox="0 0 '+W+' '+(H+18)+'" role="img" aria-label="Gasto por dia do mês">';
  d.forEach((v,i)=>{const h=v/max*(H-6);const dia=S.mes+'-'+String(i+1).padStart(2,'0');
    s+='<rect x="'+(i*bw+1).toFixed(1)+'" y="'+(H-Math.max(h,v?2:0)).toFixed(1)+'" width="'+(bw-2).toFixed(1)+'" height="'+Math.max(h,v?2:0).toFixed(1)+'" rx="2" fill="'+(dia===hojeIso?'var(--want)':'var(--brand)')+'"><title>Dia '+(i+1)+': '+brl(v)+'</title></rect>';});
  s+='<line x1="0" x2="'+W+'" y1="'+H+'" y2="'+H+'" stroke="var(--line)"/>';
  [1,8,15,22,29].filter(x=>x<=n).forEach(x=>{s+='<text x="'+((x-.5)*bw)+'" y="'+(H+14)+'" font-size="9" fill="var(--muted)" text-anchor="middle">'+x+'</text>';});
  return s+'</svg><div class="small muted">Maior gasto em um dia: <b class="num">'+brl(maior)+'</b></div>';
}

function vExtrato(){
  const M=doMes(S.mes);let L=M;
  if(S.pessoa)L=L.filter(l=>(l.quem||'-')===S.pessoa);
  if(S.filtro)L=L.filter(l=>l.cat===S.filtro);
  if(S.busca){const q=S.busca.toLowerCase();L=L.filter(l=>(l.desc+' '+l.sub+' '+l.cat).toLowerCase().includes(q));}
  L=[...L].sort((a,b)=>b.data.localeCompare(a.data)||b.linha-a.linha);
  const catsMes=[...new Set(M.map(l=>l.cat))];
  let h=topo('Extrato');
  h+='<input class="search" id="busca" type="search" placeholder="Buscar lançamento" value="'+esc(S.busca)+'" style="margin-top:8px">';
  const pp=pessoas();if(M.some(l=>!pp.some(p=>p.id===l.quem)))pp.push({id:'-',nome:'Sem autor'});
  h+='<div class="chips" aria-label="Filtrar por pessoa"><button class="chip" data-p="" aria-pressed="'+(!S.pessoa)+'">Todos</button>'+pp.map(p=>'<button class="chip" data-p="'+esc(p.id)+'" aria-pressed="'+(S.pessoa===p.id)+'">'+esc(p.nome)+'</button>').join('')+'</div>';
  h+='<div class="chips" aria-label="Filtrar por categoria" style="padding-top:0"><button class="chip" data-f="" aria-pressed="'+(!S.filtro)+'">Todas</button>'+catsMes.map(c=>'<button class="chip" data-f="'+esc(c)+'" aria-pressed="'+(S.filtro===c)+'">'+emo(c)+' '+esc(c)+'</button>').join('')+'</div>';
  h+='<div class="small muted" style="margin:0 4px 4px">'+L.length+' lançamento'+(L.length===1?'':'s')+' · total <b class="num">'+brl(soma(L))+'</b></div>';
  if(!L.length)return h+'<div class="card">'+vazio(M.length?'Nada encontrado com esse filtro':'')+'</div>';
  h+='<div class="card list">';let dia='';
  L.forEach(l=>{if(l.data!==dia){dia=l.data;const[yy,mm,dd]=dia.split('-').map(Number);const dt=new Date(yy,mm-1,dd);
    h+='<div class="day">'+dt.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'short'})+' · '+brl(soma(L.filter(x=>x.data===dia)))+'</div>';}
    h+=itemHtml(l);});
  return h+'</div>';
}

function vRel(){
  let h=topo('Relatórios');
  const L=doMes(S.mes),sem=[0,0,0,0,0];
  L.forEach(l=>{const d=+l.data.slice(8,10);sem[Math.min(4,Math.floor((d-1)/7))]+=l.valor;});
  const ms=Math.max(...sem,1);
  h+='<h2>Gasto por semana</h2><div class="card cats">';
  ['1 a 7','8 a 14','15 a 21','22 a 28','29 a 31'].forEach((r,i)=>{h+='<div class="cat" style="grid-template-columns:70px 1fr auto"><div class="small muted">Dias '+r+'</div><div class="mini" style="height:10px;margin:0"><i style="width:'+(sem[i]/ms*100)+'%;background:var(--brand)"></i></div><div class="val num">'+brl0(sem[i])+'</div></div>';});
  h+='</div>';
  // comparação, total e por pessoa
  const ant=somaMes(S.mes,-1),A=doMes(ant),g=soma(L),ga=soma(A);
  const varia=(a,b)=>{const d=b?(a-b)/b*100:null;return '<b class="num" style="color:'+(d===null?'var(--muted)':d>0?'var(--neg)':'var(--pos)')+'">'+(d===null?'sem dados':(d>0?'+':'')+d.toFixed(1).replace('.',',')+'%')+'</b>';};
  h+='<h2>Comparado a '+MESES[+ant.slice(5)-1]+'</h2><div class="card"><div class="kv"><span>Este mês</span><b class="num">'+brl(g)+'</b></div><div class="kv"><span>Mês anterior</span><b class="num">'+brl(ga)+'</b></div><div class="kv"><span>Variação da casa</span>'+varia(g,ga)+'</div>'+
    pessoas().map(p=>{const a=soma(L.filter(l=>l.quem===p.id)),b=soma(A.filter(l=>l.quem===p.id));return '<div class="kv"><span>'+tag(p.id)+' '+brl(a)+' <span class="muted small">(antes '+brl0(b)+')</span></span>'+varia(a,b)+'</div>';}).join('')+'</div>';
  // 6 meses empilhado por tipo
  const meses=[];for(let i=5;i>=0;i--)meses.push(somaMes(S.mes,-i));
  const dados=meses.map(m=>TIPOS.map(t=>soma(doMes(m).filter(l=>tipoReal(l)===t))));
  const mx=Math.max(...dados.map(x=>x.reduce((a,b)=>a+b,0)),S.renda,1);
  const W=320,H=150,bw=W/6;
  let s='<svg viewBox="0 0 '+W+' '+(H+20)+'" role="img" aria-label="Gastos dos últimos 6 meses">';
  if(S.renda){const yr=H-S.renda/mx*(H-8);s+='<line x1="0" x2="'+W+'" y1="'+yr+'" y2="'+yr+'" stroke="var(--pos)" stroke-dasharray="4 4"/><text x="'+W+'" y="'+(yr-4)+'" font-size="9" text-anchor="end" fill="var(--pos)">renda</text>';}
  dados.forEach((d,i)=>{let y=H;d.forEach((v,j)=>{const hh=v/mx*(H-8);y-=hh;if(hh>0)s+='<rect x="'+(i*bw+bw*.22)+'" y="'+y+'" width="'+bw*.56+'" height="'+hh+'" fill="'+TCOR[TIPOS[j]]+'"><title>'+TIPOS[j]+': '+brl(v)+'</title></rect>';});
    s+='<text x="'+(i*bw+bw/2)+'" y="'+(H+14)+'" font-size="10" text-anchor="middle" fill="'+(meses[i]===S.mes?'var(--ink)':'var(--muted)')+'" font-weight="'+(meses[i]===S.mes?700:400)+'">'+MES3[+meses[i].slice(5)-1]+'</text>';});
  s+='</svg>';
  h+='<h2>Últimos 6 meses</h2><div class="card chart">'+s+'<div class="legend">'+TIPOS.map(t=>'<span style="--c:'+TCOR[t]+'">'+t+'</span>').join('')+'</div></div>';
  // por pessoa nos 6 meses
  h+='<h2>Por pessoa, mês a mês</h2><div class="card">'+meses.slice().reverse().map(m=>{const M=doMes(m);
    return '<div class="kv"><span style="text-transform:capitalize">'+MES3[+m.slice(5)-1]+' '+m.slice(0,4)+'</span><span class="num small">'+porPessoa(M).map(p=>'<span style="color:'+p.cor+';font-weight:700">'+brl0(p.v)+'</span>').join(' · ')+'</span></div>';}).join('')+
    '<div class="legend">'+pessoas().map(p=>'<span style="--c:'+p.cor+'">'+esc(p.nome)+'</span>').join('')+'</div></div>';
  const sub={};L.forEach(l=>{const k=(l.sub||l.desc||l.cat);sub[k]=(sub[k]||0)+l.valor;});
  const top=Object.entries(sub).sort((a,b)=>b[1]-a[1]).slice(0,5);
  h+='<h2>Onde mais gastou</h2><div class="card">'+(top.length?top.map(([k,v],i)=>'<div class="kv"><span>'+(i+1)+'. '+esc(k)+'</span><b class="num">'+brl(v)+'</b></div>').join(''):vazio())+'</div>';
  return h;
}

function vAjustes(){
  const me=pessoa(S.me&&S.me.id);
  let h='<div class="top"><div class="hello">Ajustes</div></div>';
  h+='<div class="card prow"><div class="av" style="--c:'+me.cor+'">'+ini(me.nome)+'</div><div><b>'+esc(me.nome)+'</b><div class="small muted">Seus lançamentos aparecem com o seu nome para os dois.</div></div><button class="btn ghost" id="aj-sair" style="flex:0 0 auto;padding:10px 14px">Sair</button></div>';
  h+='<h2>Renda e metas da casa</h2><div class="card"><label class="lab" for="aj-renda" style="margin-top:0">Renda mensal (somando os dois)</label><input class="inp num" id="aj-renda" inputmode="decimal" value="'+String(S.renda).replace('.',',')+'">'+
     '<label class="lab">Metas da regra (em %)</label><div class="seg">'+
     TIPOS.map((t,i)=>'<div><div class="small muted" style="margin-bottom:4px">'+t+'</div><input class="inp num" id="aj-m'+i+'" inputmode="numeric" value="'+Math.round((S.metas[i]||0)*100)+'"></div>').join('')+'</div>'+
     '<div class="err" id="aj-err"></div><div class="actions"><button class="btn" id="aj-salvar">Salvar ajustes</button></div></div>';
  h+='<h2>Sobre</h2><div class="card small"><p style="margin-top:0">Os lançamentos ficam no banco de dados do Supabase, com o nome de quem lançou. O app atualiza sozinho a cada 30 segundos e quando você volta para ele.</p>'+
     '<button class="btn ghost" id="aj-atual" style="width:100%">Atualizar agora</button>'+
     '<p class="muted" style="margin-bottom:0">Versão '+VERSAO+(S.sync?' · atualizado às '+new Date(S.sync).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'')+'</p></div>';
  return h;
}

/* ---------- telas de entrada ---------- */
function gate(h){document.body.classList.add('gate');fecharForm();$('#app').innerHTML='<div class="gatebox">'+h+'</div>';}

function telaServidor(){
  gate('<div class="logo">💰</div><h1>Minhas Finanças</h1><p class="muted">O app ainda não está ligado ao banco de dados. Preencha <b>supabaseUrl</b> e <b>supabaseKey</b> no arquivo <b>web/config.js</b> (veja o README).</p>'+
    '<button class="link" id="g-demo">Só quero ver uma demonstração</button>');
  $('#g-demo').onclick=()=>{S.api='demo';LS.set('api','demo');S.me={id:'Eu',nome:'Eu'};S.token='demo';LS.set('me',JSON.stringify(S.me));LS.set('token','demo');iniciar();};
}

async function telaLogin(info){
  if(!info){
    gate('<div class="loading">Conectando…</div>');
    try{info=await api('ping');}
    catch(e){gate('<div class="empty"><b>Não consegui conectar</b>'+esc(e.message)+'</div><div class="actions"><button class="btn" id="g-re">Tentar de novo</button></div>');
      $('#g-re').onclick=()=>telaLogin();return;}
  }
  S.usuarios=info.usuarios.map(u=>({id:u.id,nome:u.nome}));
  let escolhido=null;
  gate('<div class="logo">💰</div><h1>Quem é você?</h1><p class="muted">Cada um entra com o seu PIN. Os dois veem todos os gastos da casa, com o nome de quem lançou.</p>'+
    '<div class="users">'+info.usuarios.map((u,i)=>'<button class="ubtn" data-u="'+esc(u.id)+'" aria-pressed="false" style="--c:var(--p'+(i%2)+')"><span class="av">'+ini(u.nome)+'</span>'+esc(u.nome)+(u.configurado?'':'<span class="small muted" style="font-weight:500">sem PIN</span>')+'</button>').join('')+'</div>'+
    '<label class="lab" for="g-pin">PIN</label><input class="inp pin" id="g-pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" placeholder="••••" disabled>'+
    '<div class="err" id="g-err"></div><div class="actions"><button class="btn" id="g-ok" disabled>Entrar</button></div>'+
    (API_URL?'':'<button class="link" id="g-api">Voltar</button>'));
  document.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>{
    escolhido=b.dataset.u;document.querySelectorAll('[data-u]').forEach(x=>x.setAttribute('aria-pressed',x===b));
    const u=info.usuarios.find(x=>x.id===escolhido);
    $('#g-err').textContent=u.configurado?'':'O PIN de '+u.nome+' ainda não foi criado. No Supabase, rode no SQL Editor: select definir_pin(\''+u.id+'\', \'1234\');';
    $('#g-pin').disabled=$('#g-ok').disabled=!u.configurado;if(u.configurado)$('#g-pin').focus();
  });
  if($('#g-api'))$('#g-api').onclick=telaServidor;
  const entrar=async()=>{
    const pin=$('#g-pin').value.trim();if(!escolhido||!pin)return;
    const b=$('#g-ok');b.disabled=true;b.textContent='Entrando…';
    try{const r=await api('login',{usuario:escolhido,pin});
      S.token=r.token;S.me=r.usuario;LS.set('token',r.token);LS.set('me',JSON.stringify(r.usuario));iniciar();}
    catch(e){$('#g-err').textContent=e.message;b.disabled=false;b.textContent='Entrar';$('#g-pin').select();}
  };
  $('#g-ok').onclick=entrar;$('#g-pin').onkeydown=e=>{if(e.key==='Enter')entrar();};
}

function sair(){
  S.token=null;S.me=null;S.pronto=false;S.lanc=[];
  LS.set('token',null);LS.set('me',null);LS.set('cache',null);
  if(DEMO_MODE()){S.api=API_URL;LS.set('api',null);DEMO=null;}
  S.api?telaLogin():telaServidor();
}

/* ---------- eventos ---------- */
function bind(){
  document.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{S.mes=somaMes(S.mes,+b.dataset.m);S.filtro='';render();});
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>abrirForm(S.lanc.find(l=>l.linha==b.dataset.edit)));
  document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{S.filtro=b.dataset.f;render();});
  document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{S.pessoa=b.dataset.p;render();});
  const bu=$('#busca');if(bu)bu.oninput=()=>{S.busca=bu.value;render();};
  const on=(id,fn)=>{const e=$(id);if(e)e.onclick=fn;};
  on('#aj-salvar',salvarAjustes);on('#aj-atual',()=>carregar({aviso:true}));on('#aj-sair',sair);
}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{S.tab=t.dataset.tab;render();window.scrollTo(0,0);});
$('#fab').onclick=()=>{if(S.pronto)abrirForm(null);};
$('#scrim').onclick=fecharForm;
document.addEventListener('keydown',e=>{if(e.key==='Escape')fecharForm();});

/** "1.500" = mil e quinhentos; "1,5" e "1.5" = um e meio; "1.234,56" = mil duzentos... */
function parseValor(t){
  t=String(t).trim().replace(/[R$\s]/g,'');
  if(t.includes(','))t=t.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(t))t=t.replace(/\./g,'');
  return t===''?NaN:Number(t);
}

let F=null;
function abrirForm(l){
  if(S.offline&&!DEMO_MODE()){toast('Sem conexão. Tente de novo quando a internet voltar.');return;}
  F={orig:l||null,cat:l?l.cat:'',tipo:l?tipoReal(l):'',uid:novoUid()};
  const hoje=isoHoje(),dataPadrao=l?l.data:(mesDe(hoje)===S.mes?hoje:S.mes+'-01');
  let h='<div class="grab"></div><h3 id="sheetTitle">'+(l?'Editar lançamento':'Novo gasto')+'</h3>'+
    '<div class="small muted">'+(l?'Lançado por '+tag(l.quem):'Lançando como '+tag(S.me&&S.me.id))+'</div>'+
    '<div class="amount"><span>R$</span><input id="f-valor" inputmode="decimal" placeholder="0,00" autocomplete="off" value="'+(l?l.valor.toFixed(2).replace('.',','):'')+'" aria-label="Valor"></div>'+
    '<label class="lab" for="f-desc">Descrição</label><input class="inp" id="f-desc" maxlength="200" placeholder="Ex.: compras do mês" value="'+esc(l?l.desc:'')+'">'+
    '<span class="lab">Categoria</span><div class="catgrid" id="f-cats">'+S.cats.map(c=>'<button type="button" class="cg" data-c="'+esc(c)+'" aria-pressed="'+(F.cat===c)+'"><span>'+emo(c)+'</span>'+esc(c)+'</button>').join('')+'</div>'+
    '<label class="lab" for="f-sub">Subcategoria</label><input class="inp" id="f-sub" list="f-subs" maxlength="100" placeholder="Opcional" value="'+esc(l?l.sub:'')+'"><datalist id="f-subs"></datalist>'+
    '<span class="lab">Tipo</span><div class="seg" id="f-tipo">'+TIPOS.map(t=>'<button type="button" data-t="'+t+'">'+t+'</button>').join('')+'</div>'+
    '<label class="lab" for="f-data">Data</label><input class="inp" id="f-data" type="date" value="'+dataPadrao+'">'+
    '<div class="err" id="f-err"></div>'+
    '<div class="actions">'+(l?'<button class="btn danger" id="f-del">Excluir</button>':'<button class="btn ghost" id="f-cancel">Cancelar</button>')+'<button class="btn" id="f-ok">'+(l?'Salvar alterações':'Salvar gasto')+'</button></div>';
  $('#sheetIn').innerHTML=h;
  syncTipo();syncSubs();
  $('#f-cats').onclick=e=>{const b=e.target.closest('[data-c]');if(!b)return;F.cat=b.dataset.c;const t=tipoDe(F.cat);if(t)F.tipo=t;document.querySelectorAll('.cg').forEach(x=>x.setAttribute('aria-pressed',x===b));syncTipo();syncSubs();};
  $('#f-tipo').onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;F.tipo=b.dataset.t;syncTipo();};
  $('#f-ok').onclick=salvarForm;
  if($('#f-cancel'))$('#f-cancel').onclick=fecharForm;
  if($('#f-del'))$('#f-del').onclick=excluir;
  $('#scrim').classList.add('on');$('#sheet').classList.add('on');
  setTimeout(()=>{if(!l&&$('#f-valor'))$('#f-valor').focus();},260);
}
function syncTipo(){document.querySelectorAll('#f-tipo [data-t]').forEach(b=>{const on=b.dataset.t===F.tipo;b.setAttribute('aria-pressed',on);b.style.background=on?TCOR[b.dataset.t]:'';});}
function syncSubs(){const ex=new Set(exemplosDe(F.cat));S.lanc.filter(l=>l.cat===F.cat&&l.sub).forEach(l=>ex.add(l.sub));$('#f-subs').innerHTML=[...ex].map(s=>'<option value="'+esc(s)+'">').join('');}
function fecharForm(){$('#scrim').classList.remove('on');$('#sheet').classList.remove('on');F=null;}
function lerForm(){
  const v=parseValor($('#f-valor').value);
  if(!(v>0))return'Informe o valor do gasto.';
  if(v>=1e7)return'Valor alto demais. Confira o número.';
  if(!F.cat)return'Escolha uma categoria.';
  if(!F.tipo)return'Escolha o tipo: necessidade, desejo ou poupança/dívida.';
  const d=$('#f-data').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return'Escolha a data.';
  return{data:d,desc:$('#f-desc').value.trim(),cat:F.cat,sub:$('#f-sub').value.trim(),tipo:F.tipo,valor:Math.round(v*100)/100};
}
const antesDe=l=>({data:l.data,valor:l.valor,desc:l.desc,cat:l.cat});
async function salvarForm(){
  const r=lerForm();if(typeof r==='string'){$('#f-err').textContent=r;return;}
  const b=$('#f-ok');b.disabled=true;b.textContent='Salvando…';
  const editando=!!F.orig;
  try{
    const d=editando?await api('editar',{linha:F.orig.linha,antes:antesDe(F.orig),novo:r}):await api('salvar',Object.assign({uid:F.uid},r));
    receber(d);S.mes=mesDe(r.data);fecharForm();render();toast(editando?'Alterações salvas':'Gasto salvo');
  }catch(e){if(!F)return;$('#f-err').textContent=e.message;b.disabled=false;b.textContent='Tentar de novo';}
}
async function excluir(){
  const b=$('#f-del');
  if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Confirmar';return;}
  b.disabled=true;
  try{const d=await api('excluir',{linha:F.orig.linha,antes:antesDe(F.orig)});receber(d);fecharForm();render();toast('Lançamento excluído');}
  catch(e){if(!F)return;$('#f-err').textContent=e.message;b.disabled=false;}
}
async function salvarAjustes(){
  const renda=parseValor($('#aj-renda').value),m=[0,1,2].map(i=>parseFloat($('#aj-m'+i).value)/100);
  if(!(renda>=0)){$('#aj-err').textContent='Informe a renda em reais.';return;}
  if(m.some(x=>!(x>=0))){$('#aj-err').textContent='As metas precisam ser números.';return;}
  const total=Math.round(m.reduce((a,b)=>a+b,0)*100);
  if(total!==100){$('#aj-err').textContent='As metas somam '+total+'%. Ajuste para somar 100%.';return;}
  const b=$('#aj-salvar');b.disabled=true;b.textContent='Salvando…';
  try{receber(await api('ajustes',{renda,metas:m}));render();toast('Ajustes salvos');}
  catch(e){$('#aj-err').textContent=e.message;b.disabled=false;b.textContent='Salvar ajustes';}
}
let tt;function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('on'),2800);}

/* ---------- sincronização ---------- */
function receber(d){
  aplicar(d);S.offline=false;S.sync=Date.now();
  if(!DEMO_MODE())LS.set('cache',JSON.stringify(d));
}
let carregando=false;
async function carregar(o){
  o=o||{};if(carregando)return;carregando=true;
  const antes=new Set(S.lanc.map(chave)),tinha=S.pronto;
  try{
    receber(await api('carregar'));
    if(o.silencioso&&tinha&&S.me){
      const novos=S.lanc.filter(l=>!antes.has(chave(l))&&l.quem&&l.quem!==S.me.id);
      if(novos.length===1)toast(pessoa(novos[0].quem).nome+' lançou '+brl(novos[0].valor)+' em '+novos[0].cat);
      else if(novos.length>1)toast(novos.length+' lançamentos novos de '+pessoa(novos[0].quem).nome);
    }
    if(!S.token)return;
    if(!F&&!(o.silencioso&&S.tab==='ajustes'))render();
    if(o.aviso)toast('Dados atualizados');
  }catch(e){
    if(!S.token)return;
    if(S.pronto){S.offline=true;if(!F&&S.tab!=='ajustes')render();if(o.aviso)toast(e.message);}
    else{$('#app').innerHTML='<div class="loading"><div class="empty"><b>Não consegui carregar os dados</b>'+esc(e.message)+'<div class="actions"><button class="btn" id="re">Tentar de novo</button></div></div></div>';$('#re').onclick=()=>carregar();}
  }finally{carregando=false;}
}
let timer=null;
function iniciarSync(){
  if(timer)return;
  timer=setInterval(()=>{if(S.token&&document.visibilityState==='visible'&&!F)carregar({silencioso:true});},SYNC_MS);
  document.addEventListener('visibilitychange',()=>{if(S.token&&document.visibilityState==='visible'&&!F)carregar({silencioso:true});});
  window.addEventListener('online',()=>{if(S.token)carregar({silencioso:true});});
}

function iniciar(){
  if(!S.api)return telaServidor();
  if(!S.token||!S.me)return telaLogin();
  const cache=!DEMO_MODE()&&LS.json('cache');
  if(cache){aplicar(cache);render();}
  else $('#app').innerHTML='<div class="loading">Carregando suas finanças…</div>',document.body.classList.remove('gate');
  carregar({silencioso:!!cache});iniciarSync();
}

/* ---------- Android (APK): botão voltar ---------- */
const Cap=window.Capacitor;
const CapApp=Cap&&Cap.Plugins&&Cap.Plugins.App;
if(CapApp)CapApp.addListener('backButton',()=>{
  if(F)fecharForm();
  else if(S.token&&S.tab!=='inicio'){S.tab='inicio';render();}
  else CapApp.exitApp();
});
if('serviceWorker' in navigator&&!(Cap&&Cap.isNativePlatform&&Cap.isNativePlatform())&&location.protocol==='https:'){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}

/* ---------- demonstração ---------- */
let DEMO=null;
function demoInit(){
  const guia=[['Moradia','Necessidade','Aluguel, Condomínio, IPTU'],['Contas','Necessidade','Água, Luz, Internet, Celular'],['Mercado','Necessidade','Supermercado, Feira, Açougue'],['Transporte','Necessidade','Combustível, Ônibus, App de transporte'],['Saúde','Necessidade','Plano de saúde, Farmácia, Consultas'],['Educação','Necessidade','Mensalidade, Cursos, Material'],['Lazer','Desejo','Cinema, Streaming, Passeios'],['Restaurante','Desejo','Delivery, Bar, Café'],['Compras','Desejo','Roupas, Eletrônicos, Presentes'],['Vestuário','Desejo','Roupas, Calçados, Acessórios'],['Assinaturas','Desejo','Apps, Clubes, Serviços recorrentes'],['Poupança','Poupança/Dívida','Reserva de emergência, Objetivo'],['Investimento','Poupança/Dívida','Renda fixa, Ações, Fundos'],['Dívidas','Poupança/Dívida','Cartão, Empréstimo, Financiamento'],['Outros','-','Gastos não classificados']].map(g=>({cat:g[0],tipo:g[1],ex:g[2]}));
  const base=[[1,'Aluguel','Moradia','Aluguel',1500],[5,'Compras do mês','Mercado','Supermercado',720],[7,'Conta de luz','Contas','Luz',185],[8,'Internet fibra','Contas','Internet',99.9],[10,'Combustível','Transporte','Combustível',260],[12,'Farmácia','Saúde','Farmácia',74.5],[13,'Pizza sexta','Restaurante','Delivery',68],[15,'Reserva','Poupança','Reserva de emergência',500],[16,'Ração','Animais','Pet shop',140],[18,'Cinema','Lazer','Cinema',56],[20,'Feira','Mercado','Feira',92],[21,'Streaming','Assinaturas','Streaming',39.9],[23,'Tênis','Vestuário','Calçados',229],[25,'Parcela cartão','Dívidas','Cartão',410],[27,'Combustível','Transporte','Combustível',210],[28,'Café com amigos','Restaurante','Café',34]];
  const lanc=[];let linha=6;const hoje=isoHoje();
  for(let k=3;k>=0;k--){const m=somaMes(mesDe(hoje),-k);
    base.forEach((b,i)=>{const d=m+'-'+String(b[0]).padStart(2,'0');if(d>hoje)return;const f=1+((i*7+k*3)%9-4)/40;
      lanc.push({linha:linha++,data:d,desc:b[1],cat:b[2],sub:b[3],tipo:'',quem:(i*5+k)%3?'Eu':'Esposa',valor:Math.round(b[4]*(b[2]==='Moradia'?1:f)*100)/100});});}
  DEMO={lancamentos:lanc,guia,categorias:guia.map(g=>g.cat).concat('Animais'),renda:6000,metas:[.5,.3,.2],url:'',
    usuarios:[{id:'Eu',nome:'Eu'},{id:'Esposa',nome:'Esposa'}]};
  DEMO.lancamentos.forEach(l=>{const g=guia.find(g=>g.cat===l.cat);l.tipo=g&&TIPOS.includes(g.tipo)?g.tipo:'Necessidade';});
}
function demoCall(acao,a){
  if(!DEMO)demoInit();
  a=a||{};
  if(acao==='ping')return{app:'Minhas Finanças',usuarios:DEMO.usuarios.map(u=>Object.assign({configurado:true},u))};
  if(acao==='salvar'){const n=Object.assign({},a,{linha:1000+DEMO.lancamentos.length,quem:S.me.id});delete n.uid;DEMO.lancamentos.push(n);}
  if(acao==='editar'){const l=DEMO.lancamentos.find(l=>l.linha===a.linha);Object.assign(l,a.novo);}
  if(acao==='excluir'){DEMO.lancamentos=DEMO.lancamentos.filter(l=>l.linha!==a.linha);}
  if(acao==='ajustes'){DEMO.renda=a.renda;DEMO.metas=a.metas;}
  return JSON.parse(JSON.stringify(DEMO));
}

iniciar();
})();
