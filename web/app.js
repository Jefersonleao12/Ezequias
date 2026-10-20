(function(){
'use strict';
const VERSAO='3.5.2';
const SYNC_MS=30000;
const CFG=Object.assign({},window.FINANCAS_CONFIG);
const API_URL=CFG.supabaseUrl&&CFG.supabaseKey?CFG.supabaseUrl.replace(/\/+$/,'')+'/rest/v1/rpc/api':'';
const $=s=>document.querySelector(s);
/* com "ocultar valores" ligado, todo valor exibido vira R$ •••• (os campos de digitação não usam estas funções) */
const brl=v=>S.oculto?'R$ ••••':v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const brl0=v=>S.oculto?'R$ ••••':v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
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

let S={lanc:[],guia:[],cartoes:[],compras:[],temCartoes:false,cats:[],renda:0,metas:[.5,.3,.2],url:'',usuarios:[],mes:'',tab:'inicio',filtro:'',busca:'',pessoa:'',
  me:LS.json('me'),token:LS.get('token'),oculto:LS.get('oculto')==='1',tema:LS.get('tema')||'auto',api:LS.get('api')==='demo'?'demo':API_URL,offline:false,sync:0,pronto:false};
const DEMO_MODE=()=>S.api==='demo';

/* ---------- tema: 'auto' segue o celular; 'claro'/'escuro' fixam ---------- */
const ESCURO_SO=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
function escuroAgora(){return S.tema==='escuro'||(S.tema==='auto'&&!!(ESCURO_SO&&ESCURO_SO.matches));}
function aplicarTema(){
  const r=document.documentElement;
  if(S.tema==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',S.tema==='escuro'?'dark':'light');
  const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=escuroAgora()?'#0E1513':'#0E6B55';
}
function definirTema(t){S.tema=t;LS.set('tema',t==='auto'?null:t);aplicarTema();if(S.pronto)render();}
aplicarTema();
if(ESCURO_SO&&ESCURO_SO.addEventListener)ESCURO_SO.addEventListener('change',()=>{if(S.tema==='auto'){aplicarTema();if(S.pronto&&!F)render();}});

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
  S.temCartoes=Array.isArray(d.cartoes);S.cartoes=d.cartoes||[];S.compras=d.compras||[];
  S.metas=(d.metas&&d.metas.length===3&&d.metas.some(Boolean))?d.metas:[.5,.3,.2];
  const set=new Set();S.guia.forEach(g=>set.add(g.cat));(d.categorias||[]).forEach(c=>c&&set.add(c));S.lanc.forEach(l=>l.cat&&set.add(l.cat));S.compras.forEach(c=>c.cat&&set.add(c.cat));
  S.cats=[...set];
  if(S.me){const u=S.usuarios.find(u=>u.id===S.me.id);if(u&&u.nome!==S.me.nome){S.me=u;LS.set('me',JSON.stringify(u));}}
  if(!S.mes){const hoje=mesDe(isoHoje());S.mes=S.lanc.some(l=>mesDe(l.data)===hoje)||!S.lanc.length?hoje:S.lanc.map(l=>mesDe(l.data)).sort().pop();}
  S.pronto=true;
}
function isoHoje(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
const mesDe=iso=>iso.slice(0,7);
function mesNome(m){const[y,mm]=m.split('-').map(Number);return MESES[mm-1]+' '+y;}
function somaMes(m,delta){let[y,mm]=m.split('-').map(Number);mm+=delta;while(mm<1){mm+=12;y--;}while(mm>12){mm-=12;y++;}return y+'-'+String(mm).padStart(2,'0');}
/* gastos do mês: os à vista + a parcela do mês de cada compra no cartão */
const doMes=m=>S.lanc.filter(l=>mesDe(l.data)===m).concat(parcelasDoMes(m));
const dataCompra=x=>x.data||x.mes+'-01';
function parcelasDoMes(m){
  const[y,mm]=m.split('-').map(Number),fim=new Date(y,mm,0).getDate();
  return S.compras.map(c=>{const k=parcelaNoMes(c,m);if(k<0)return null;
    const dia=Math.min(fim,+dataCompra(c).slice(8,10)||1);
    return{linha:'c'+c.id,compra:c,data:m+'-'+String(dia).padStart(2,'0'),desc:(c.desc||'Compra no cartão')+(c.parcelas>1?' ('+(k+1)+'/'+c.parcelas+')':''),
      cat:c.cat||'Outros',sub:c.sub||'',tipo:c.tipo||'',valor:parcela(c,k),quem:c.quem};}).filter(Boolean);
}
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
/* cartões: cada compra é dividida em parcelas mensais a partir de c.mes */
const mesNum=m=>{const[y,mm]=m.split('-').map(Number);return y*12+mm-1;};
const parcBase=c=>Math.floor(c.valor*100/c.parcelas)/100;
function parcela(c,k){const b=parcBase(c);return k===0?Math.round((c.valor-b*(c.parcelas-1))*100)/100:b;}
function parcelaNoMes(c,m){const k=mesNum(m)-mesNum(c.mes);return k>=0&&k<c.parcelas?k:-1;}
const comprasDe=id=>S.compras.filter(c=>c.cartao===id);
function fatura(id,m){return comprasDe(id).reduce((a,c)=>{const k=parcelaNoMes(c,m);return a+(k<0?0:parcela(c,k));},0);}
/** limite ocupado: parcelas do mês m em diante */
function usado(id,m){return comprasDe(id).reduce((a,c)=>{let k=Math.max(0,mesNum(m)-mesNum(c.mes)),v=0;for(;k<c.parcelas;k++)v+=parcela(c,k);return a+v;},0);}
const cartao=id=>S.cartoes.find(c=>c.id===id);

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
  '<button class="tema" id="tema" aria-label="'+(escuroAgora()?'Usar tema claro':'Usar tema escuro')+'">'+(escuroAgora()?SOL:LUA)+'</button>'+
  '<div class="month"><button data-m="-1" aria-label="Mês anterior">‹</button><b>'+mesNome(S.mes)+'</b><button data-m="1" aria-label="Próximo mês">›</button></div></div>'+
  (DEMO_MODE()?'<div class="banner">Modo demonstração com dados de exemplo. Nada é salvo de verdade.</div>':'')+
  (S.offline?'<div class="banner off">Sem conexão com o banco de dados. Mostrando os últimos dados salvos no aparelho.</div>':'');
}
/* ícones de linha (24×24) por categoria; categorias novas caem no emoji */
const SVG=(d,w)=>'<svg viewBox="0 0 24 24" width="'+(w||20)+'" height="'+(w||20)+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
const P=d=>'<path d="'+d+'"/>';
const ICON={
  'Moradia':P('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'),
  'Contas':P('M13 2 4 14h7l-1 8 9-12h-7z'),
  'Mercado':'<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>'+P('M2.5 3h2.2l2.4 11.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 1.9-1.5L21 7H5.6'),
  'Transporte':P('M5 17H3v-5l2-5h14l2 5v5h-2')+'<circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>'+P('M9.5 17h5M3 12h18'),
  'Saúde':P('M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z'),
  'Educação':P('M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'),
  'Lazer':'<circle cx="12" cy="12" r="9.5"/>'+P('M10 8.5 15.5 12 10 15.5z'),
  'Restaurante':P('M4 2v7a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V2M7 2v20M20 15V2a4 4 0 0 0-4 4v7a2 2 0 0 0 2 2h2zm0 0v7'),
  'Compras':P('M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0'),
  'Vestuário':P('M20.4 6.6 16 3a4 4 0 0 1-8 0L3.6 6.6 6 11l2-1v11h8V10l2 1z'),
  'Assinaturas':P('M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3'),
  'Poupança':P('M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3h-4a2 2 0 0 0 0 4h4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5'),
  'Investimento':P('M22 7l-8.5 8.5-5-5L2 17M16 7h6v6'),
  'Dívidas':'<rect x="2" y="5" width="20" height="14" rx="2.5"/>'+P('M2 10h20M6 15h4'),
  'Outros':P('M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8'),
  'Animais':'<circle cx="5" cy="10" r="2"/><circle cx="9.5" cy="5" r="2"/><circle cx="14.5" cy="5" r="2"/><circle cx="19" cy="10" r="2"/>'+P('M8.5 21c-1.8 0-2.8-1.3-2.8-2.8 0-2.6 3-6.2 6.3-6.2s6.3 3.6 6.3 6.2c0 1.5-1 2.8-2.8 2.8-1.2 0-2.2-.6-3.5-.6s-2.3.6-3.5.6z')
};
const icoCat=(cat,w)=>ICON[cat]?SVG(ICON[cat],w):'<span style="font-size:'+((w||20)*.9)+'px;line-height:1">'+emo(cat)+'</span>';
function icone(cat){const c=corCat(cat);return '<div class="ico" style="color:'+c+';background:color-mix(in srgb,'+c+' 13%,transparent)">'+icoCat(cat)+'</div>';}
const OLHO=SVG(P('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z')+'<circle cx="12" cy="12" r="3"/>',20);
const SOL=SVG('<circle cx="12" cy="12" r="4.5"/>'+P('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'),20);
const LUA=SVG(P('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'),20);
const OLHO_OFF=SVG(P('M9.9 4.2A10.6 10.6 0 0 1 12 4c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20'),20);
function itemHtml(l){
  const k=l.compra&&cartao(l.compra.cartao);
  return '<button class="item" '+(l.compra?'data-compra-ed="'+l.compra.id+'"':'data-edit="'+l.linha+'"')+'>'+icone(l.cat)+'<div style="min-width:0"><div class="d">'+esc(l.desc||l.sub||l.cat)+'</div><div class="small muted sm">'+tag(l.quem)+' '+(l.compra?esc(k?k.nome:'Cartão')+' · ':'')+esc(l.cat)+(l.sub?' · '+esc(l.sub):'')+'</div></div><div class="val num">−'+brl(l.valor)+'</div></button>';
}
function vazio(msg){return '<div class="empty"><b>'+(msg||'Nenhum gasto neste mês')+'</b>Toque no + para registrar.</div>';}

function vInicio(){
  const L=doMes(S.mes),gasto=soma(L),sobra=S.renda-gasto;
  const pct=S.renda?gasto/S.renda*100:0,pc=Math.min(100,pct);
  const R=34,C=2*Math.PI*R,cor=pct>90?'#FF7A6B':pct>70?'#FFB547':'#7BE0B5';
  let h=topo('Olá, '+esc(S.me?S.me.nome:'')+'!');
  h+='<div class="hero"><div class="hero-top"><div class="lbl">'+(sobra>=0?'Saldo da casa':'Faltando no mês')+'</div>'+
     '<button class="eye" id="olho" aria-label="'+(S.oculto?'Mostrar valores':'Ocultar valores')+'" aria-pressed="'+!!S.oculto+'">'+(S.oculto?OLHO_OFF:OLHO)+'</button></div>'+
     '<div class="hero-mid"><div style="min-width:0;flex:1"><div class="big num">'+(sobra<0&&!S.oculto?'−':'')+brl(Math.abs(sobra))+'</div>'+
     '<div class="bar"><i style="width:'+pc+'%;background:'+cor+'"></i></div></div>'+
     '<svg class="ring" viewBox="0 0 84 84" role="img" aria-label="'+Math.round(pct)+'% da renda gasto"><circle cx="42" cy="42" r="'+R+'" stroke="rgba(255,255,255,.18)"/>'+
     '<circle cx="42" cy="42" r="'+R+'" stroke="'+cor+'" stroke-dasharray="'+(C*pc/100).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 42 42)"/>'+
     '<text x="42" y="47" text-anchor="middle">'+Math.round(pct)+'%</text></svg></div>'+
     '<div class="row num"><div><small>Gasto no mês</small><b>'+brl(gasto)+'</b> <em>'+(S.renda?pct.toFixed(1).replace('.',','):'0')+'%</em></div><div style="text-align:right"><small>Renda</small><b>'+brl(S.renda)+'</b></div></div></div>';
  h+=cardCartoes();
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
  // categorias
  const porCat={};L.forEach(l=>porCat[l.cat]=(porCat[l.cat]||0)+l.valor);
  const cats=Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
  h+='<h2>Por categoria</h2><div class="card">';
  if(!cats.length)h+=vazio();
  else{h+='<div class="cats">';const max=cats[0][1];
    cats.forEach(([c,v])=>{
      h+='<div class="cat">'+icone(c)+'<div><div class="nm">'+esc(c)+'</div><div class="mini" style="width:'+(v/max*100)+'%"><i style="width:100%;background:'+corCat(c)+'"></i></div></div><div class="val num">'+brl(v)+'<div class="small muted" style="font-weight:500">'+(gasto?Math.round(v/gasto*100):0)+'%</div></div></div>';});
    h+='</div>';}
  h+='</div>';
  h+='<h2>Gasto por dia</h2><div class="card chart">'+graficoDias(L)+'</div>';
  const ult=[...L].sort((a,b)=>b.data.localeCompare(a.data)||(+b.linha||0)-(+a.linha||0)).slice(0,6);
  h+='<h2>Últimos lançamentos</h2><div class="card list">'+(ult.length?ult.map(itemHtml).join(''):vazio())+'</div>';
  return h;
}

/* visual de cada banco pelo nome do cartão: fundo do cartão, cor do selo e a marca */
const BANCOS=[
  [/nu ?bank|^nu\b/i,'linear-gradient(135deg,#8A05BE,#5B0C8C)','#820AD1','<b style="font:800 15px/1 var(--b);letter-spacing:-.5px">nu</b>'],
  [/infinit/i,'linear-gradient(135deg,#2A2A2A,#0B0B0B)','#111',SVG(P('M8.5 15.5c-2 0-3.5-1.6-3.5-3.5S6.5 8.5 8.5 8.5c3.5 0 3.5 7 7 7 2 0 3.5-1.6 3.5-3.5s-1.5-3.5-3.5-3.5c-3.5 0-3.5 7-7 7z'),22)],
  [/\bpan\b/i,'linear-gradient(135deg,#1A8FE0,#0062B5)','#fff','<b style="font:800 20px/1 var(--b);color:#0A73C9;position:relative">P<i style="position:absolute;top:-3px;left:-4px;width:6px;height:6px;border-radius:50%;background:#F7941D"></i></b>'],
  [/inter\b/i,'linear-gradient(135deg,#FF8A00,#E25B00)','#FF7A00','<b style="font:800 14px/1 var(--b)">inter</b>'],
  [/ita[uú]/i,'linear-gradient(135deg,#F28500,#D45F00)','#003A8F','<b style="font:800 13px/1 var(--b);color:#FFD200">itaú</b>'],
  [/bradesco/i,'linear-gradient(135deg,#D3112B,#9E0B20)','#CC092F','<b style="font:800 18px/1 var(--b)">b</b>'],
  [/santander/i,'linear-gradient(135deg,#EC1C24,#B5121A)','#EC0000','<b style="font:800 18px/1 var(--b)">s</b>'],
  [/\bc6\b/i,'linear-gradient(135deg,#3A3A3A,#121212)','#1E1E1E','<b style="font:800 15px/1 var(--b)">C6</b>'],
  [/caixa/i,'linear-gradient(135deg,#1C6DB8,#0B4C8C)','#005CA9','<b style="font:800 18px/1 var(--b);color:#F7941D">X</b>'],
  [/mercado ?pago/i,'linear-gradient(135deg,#00A8E8,#0079C1)','#00B1EA','<b style="font:800 13px/1 var(--b)">MP</b>'],
  [/picpay/i,'linear-gradient(135deg,#21C25E,#119647)','#21C25E','<b style="font:800 13px/1 var(--b)">pic</b>'],
  [/banco do brasil|\bbb\b/i,'linear-gradient(135deg,#2B5CB8,#163C85)','#FCF000','<b style="font:800 14px/1 var(--b);color:#2B5CB8">BB</b>']
];
function banco(c,i){const b=BANCOS.find(b=>b[0].test(c.nome));if(b)return{fundo:b[1],selo:b[2],marca:b[3]};
  const cor=PAL[i%PAL.length];return{fundo:'linear-gradient(135deg,'+cor+',color-mix(in srgb,'+cor+' 70%,#000))',selo:'rgba(255,255,255,.18)',marca:'<b style="font:800 17px/1 var(--b)">'+ini(c.nome)+'</b>'};}

function cardCartoes(){
  let h='<div class="h2row"><h2>Cartões de crédito</h2>'+(S.temCartoes?'<button class="link" id="cc-novo">+ Cartão</button>':'')+'</div>';
  if(!S.temCartoes)return h+'<div class="card small muted">Para usar os cartões, rode no SQL Editor do Supabase o arquivo <b>supabase/migrations/20261019000000_cartoes_credito.sql</b> (veja o README).</div>';
  if(!S.cartoes.length)return h+'<div class="card"><div class="empty"><b>Nenhum cartão cadastrado</b>Toque em “+ Cartão” para adicionar.</div></div>';
  const fat=S.cartoes.map(c=>fatura(c.id,S.mes)),tf=fat.reduce((a,b)=>a+b,0);
  const lim=S.cartoes.reduce((a,c)=>a+c.limite,0),us=S.cartoes.reduce((a,c)=>a+usado(c.id,S.mes),0);
  h+='<div class="card"><div class="kv" style="padding-top:0"><span>Faturas de '+MESES[+S.mes.slice(5)-1]+'</span><b class="num">'+brl(tf)+'</b></div>'+
     '<div class="kv"><span>Limite livre (todos)</span><b class="num" style="color:'+(lim-us<0?'var(--neg)':'var(--pos)')+'">'+brl(lim-us)+'</b></div><div class="ccs">';
  S.cartoes.forEach((c,i)=>{const u=usado(c.id,S.mes),livre=c.limite-u,p=c.limite?Math.min(100,u/c.limite*100):(u?100:0),b=banco(c,i);
    const alerta=p>=90?'#FF8A80':p>=70?'#FFD166':'#fff';
    h+='<button class="ccard" data-cartao="'+c.id+'" style="background:'+b.fundo+'"><div class="logo" style="background:'+b.selo+'">'+b.marca+'</div>'+
      '<div style="min-width:0"><div class="cn"><span>'+esc(c.nome)+'</span>'+(c.dono?'<span class="own">'+esc(pessoa(c.dono).nome)+'</span>':'')+'</div>'+
      '<div class="cbar"><i style="width:'+p+'%;background:'+alerta+'"></i></div>'+
      '<div class="cu num">Livre <b>'+brl0(livre)+'</b> de '+(S.oculto?'••••':c.limite.toLocaleString('pt-BR',{maximumFractionDigits:0}))+'</div></div>'+
      '<div class="cf num">'+brl(fat[i])+'<small>fatura</small></div></button>';});
  return h+'</div><button class="btn ghost lancar" id="cc-lancar">'+SVG(ICON['Dívidas'],20)+' Lançar compra no cartão</button></div>';
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
  L=[...L].sort((a,b)=>b.data.localeCompare(a.data)||(+b.linha||0)-(+a.linha||0));
  const catsMes=[...new Set(M.map(l=>l.cat))];
  let h=topo('Extrato');
  h+='<input class="search" id="busca" type="search" placeholder="Buscar lançamento" value="'+esc(S.busca)+'" style="margin-top:8px">';
  const pp=pessoas();if(M.some(l=>!pp.some(p=>p.id===l.quem)))pp.push({id:'-',nome:'Sem autor'});
  h+='<div class="chips" aria-label="Filtrar por pessoa"><button class="chip" data-p="" aria-pressed="'+(!S.pessoa)+'">Todos</button>'+pp.map(p=>'<button class="chip" data-p="'+esc(p.id)+'" aria-pressed="'+(S.pessoa===p.id)+'">'+esc(p.nome)+'</button>').join('')+'</div>';
  h+='<div class="chips" aria-label="Filtrar por categoria" style="padding-top:0"><button class="chip" data-f="" aria-pressed="'+(!S.filtro)+'">Todas</button>'+catsMes.map(c=>'<button class="chip" data-f="'+esc(c)+'" aria-pressed="'+(S.filtro===c)+'"><span style="display:inline-flex;vertical-align:-3px;margin-right:4px">'+icoCat(c,15)+'</span>'+esc(c)+'</button>').join('')+'</div>';
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
  let h='<div class="top"><div class="hello">Ajustes</div><button class="tema" id="tema" aria-label="'+(escuroAgora()?'Usar tema claro':'Usar tema escuro')+'">'+(escuroAgora()?SOL:LUA)+'</button></div>';
  h+='<div class="card prow"><div class="av" style="--c:'+me.cor+'">'+ini(me.nome)+'</div><div><b>'+esc(me.nome)+'</b><div class="small muted">Seus lançamentos aparecem com o seu nome para os dois.</div></div><button class="btn ghost" id="aj-sair" style="flex:0 0 auto;padding:10px 14px">Sair</button></div>';
  h+='<h2>Aparência</h2><div class="card"><div class="seg" id="aj-tema">'+[['auto','Automático'],['claro','Claro'],['escuro','Escuro']].map(([v,n])=>'<button type="button" data-tema="'+v+'" aria-pressed="'+(S.tema===v)+'"'+(S.tema===v?' style="background:var(--brand)"':'')+'>'+n+'</button>').join('')+'</div>'+
     '<div class="small muted" style="margin-top:8px">Automático segue o tema do celular. Também dá para trocar pelo botão '+(escuroAgora()?'do sol':'da lua')+' no topo das telas.</div></div>';
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
  document.querySelectorAll('[data-compra-ed]').forEach(b=>b.onclick=()=>abrirCompra(S.compras.find(x=>x.id===+b.dataset.compraEd),null));
  document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{S.filtro=b.dataset.f;render();});
  document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{S.pessoa=b.dataset.p;render();});
  const bu=$('#busca');if(bu)bu.oninput=()=>{S.busca=bu.value;render();};
  const on=(id,fn)=>{const e=$(id);if(e)e.onclick=fn;};
  on('#aj-salvar',salvarAjustes);on('#aj-atual',()=>carregar({aviso:true}));on('#aj-sair',sair);
  document.querySelectorAll('[data-cartao]').forEach(b=>b.onclick=()=>abrirCartao(cartao(+b.dataset.cartao)));
  on('#cc-novo',()=>abrirCartao(null));on('#cc-lancar',()=>abrirForm(null,{cartao:S.cartoes[0]&&S.cartoes[0].id}));
  on('#tema',()=>definirTema(escuroAgora()?'claro':'escuro'));
  document.querySelectorAll('[data-tema]').forEach(b=>b.onclick=()=>definirTema(b.dataset.tema));
  on('#olho',()=>{S.oculto=!S.oculto;LS.set('oculto',S.oculto?'1':null);render();});
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
/** l = gasto à vista para editar; o.compra = compra no cartão para editar; o.cartao = já abrir no modo cartão com esse cartão */
function abrirForm(l,o){
  o=o||{};
  if(S.offline&&!DEMO_MODE()){toast('Sem conexão. Tente de novo quando a internet voltar.');return;}
  const x=o.compra||null,temCC=S.temCartoes&&S.cartoes.length>0;
  F={orig:l||null,compra:x,pag:x||o.cartao?'cartao':'avista',cat:l?l.cat:x?x.cat||'':'',tipo:l?tipoReal(l):x?x.tipo||tipoDe(x.cat)||'':'',uid:novoUid(),
    cartao:x?x.cartao:(o.cartao||(temCC?S.cartoes[0].id:null)),porParcela:false,voltar:o.voltar||null};
  const hoje=isoHoje(),dataPadrao=l?l.data:x?dataCompra(x):(mesDe(hoje)===S.mes?hoje:S.mes+'-01');
  const editando=!!(l||x),quem=l?l.quem:x?x.quem:S.me&&S.me.id;
  let h='<div class="grab"></div><h3 id="sheetTitle">'+(l?'Editar lançamento':x?'Editar compra no cartão':'Novo gasto')+'</h3>'+
    '<div class="small muted">'+(editando?'Lançado por ':'Lançando como ')+tag(quem)+'</div>'+
    (temCC&&!editando?'<div class="seg" id="f-pag" style="grid-template-columns:1fr 1fr;margin-top:12px"><button type="button" data-g="avista">💵 À vista / Pix</button><button type="button" data-g="cartao">💳 Cartão de crédito</button></div>':'')+
    '<div id="f-ccmodo" class="seg" style="grid-template-columns:1fr 1fr;margin-top:12px"><button type="button" data-v="0">Valor total</button><button type="button" data-v="1">Valor da parcela</button></div>'+
    '<div class="amount"><span>R$</span><input id="f-valor" inputmode="decimal" placeholder="0,00" autocomplete="off" value="'+(l?l.valor.toFixed(2).replace('.',','):x?x.valor.toFixed(2).replace('.',','):'')+'" aria-label="Valor a lançar"></div>'+
    '<div id="f-cc">'+
      '<span class="lab">Cartão</span><div class="chips" id="f-cartao" style="flex-wrap:wrap;padding-top:0">'+S.cartoes.map(c=>'<button type="button" class="chip" data-k="'+c.id+'">💳 '+esc(c.nome)+'</button>').join('')+'</div>'+
      '<label class="lab" for="f-parc" style="margin-top:4px">Em quantas vezes</label><div style="display:grid;grid-template-columns:48px 1fr 48px;gap:8px">'+
      '<button type="button" class="btn ghost" id="f-menos" style="padding:10px" aria-label="Menos parcelas">−</button><input class="inp num" id="f-parc" inputmode="numeric" style="text-align:center;font-weight:700" value="'+(x?x.parcelas:1)+'"><button type="button" class="btn ghost" id="f-mais" style="padding:10px" aria-label="Mais parcelas">+</button></div>'+
      '<div class="small muted num" id="f-prev" style="margin-top:6px"></div>'+
    '</div>'+
    '<label class="lab" for="f-desc">Descrição</label><input class="inp" id="f-desc" maxlength="200" placeholder="Ex.: compras do mês" value="'+esc(l?l.desc:x?x.desc:'')+'">'+
    '<span class="lab">Categoria</span><div class="catgrid" id="f-cats">'+S.cats.map(c=>'<button type="button" class="cg" data-c="'+esc(c)+'" aria-pressed="'+(F.cat===c)+'">'+icoCat(c,22)+esc(c)+'</button>').join('')+'</div>'+
    '<label class="lab" for="f-sub">Subcategoria</label><input class="inp" id="f-sub" list="f-subs" maxlength="100" placeholder="Opcional" value="'+esc(l?l.sub:x?x.sub||'':'')+'"><datalist id="f-subs"></datalist>'+
    '<span class="lab">Tipo</span><div class="seg" id="f-tipo">'+TIPOS.map(t=>'<button type="button" data-t="'+t+'">'+t+'</button>').join('')+'</div>'+
    '<label class="lab" for="f-data" id="f-datalab">Data</label><input class="inp" id="f-data" type="date" value="'+dataPadrao+'">'+
    '<div id="f-mesbox"><label class="lab" for="f-mes">Mês da 1ª parcela (fatura)</label><input class="inp" id="f-mes" type="month" value="'+(x?x.mes:S.mes)+'"></div>'+
    '<div class="err" id="f-err"></div>'+
    '<div class="actions">'+(editando?'<button class="btn danger" id="f-del">Excluir</button>':'<button class="btn ghost" id="f-cancel">Cancelar</button>')+'<button class="btn" id="f-ok"></button></div>';
  abrirSheet(h);
  syncTipo();syncSubs();syncPag();prevParc();
  if($('#f-pag'))$('#f-pag').onclick=e=>{const b=e.target.closest('[data-g]');if(!b)return;F.pag=b.dataset.g;syncPag();prevParc();};
  $('#f-ccmodo').onclick=e=>{const b=e.target.closest('[data-v]');if(!b)return;
    const v=parseValor($('#f-valor').value),n=lerParc(),novo=b.dataset.v==='1';
    if(novo!==F.porParcela&&v>0&&n){const t=novo?v/n:v*n;$('#f-valor').value=(Math.round(t*100)/100).toFixed(2).replace('.',',');}
    F.porParcela=novo;syncPag();prevParc();};
  $('#f-cartao').onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;F.cartao=+b.dataset.k;syncPag();};
  const passo=d=>{const n=lerParc()||1;$('#f-parc').value=Math.min(99,Math.max(1,n+d));prevParc();};
  $('#f-menos').onclick=()=>passo(-1);$('#f-mais').onclick=()=>passo(1);
  $('#f-valor').oninput=prevParc;$('#f-parc').oninput=prevParc;
  /* o mês da 1ª parcela acompanha a data da compra até a pessoa mexer nele */
  $('#f-data').onchange=()=>{const d=$('#f-data').value;if(!x&&!F.mesMexido&&/^\d{4}-\d{2}/.test(d))$('#f-mes').value=d.slice(0,7);};
  $('#f-mes').oninput=()=>{F.mesMexido=true;};
  $('#f-cats').onclick=e=>{const b=e.target.closest('[data-c]');if(!b)return;F.cat=b.dataset.c;const t=tipoDe(F.cat);if(t)F.tipo=t;document.querySelectorAll('.cg').forEach(x=>x.setAttribute('aria-pressed',x===b));syncTipo();syncSubs();};
  $('#f-tipo').onclick=e=>{const b=e.target.closest('[data-t]');if(!b)return;F.tipo=b.dataset.t;syncTipo();};
  $('#f-ok').onclick=salvarForm;
  if($('#f-cancel'))$('#f-cancel').onclick=voltarForm;
  if($('#f-del'))$('#f-del').onclick=excluir;
  setTimeout(()=>{if(!editando&&$('#f-valor'))$('#f-valor').focus();},260);
}
function lerParc(){const n=parseInt($('#f-parc').value,10);return n>=1&&n<=99?n:NaN;}
function totalForm(){const v=parseValor($('#f-valor').value);return F.pag==='cartao'&&F.porParcela?v*lerParc():v;}
function prevParc(){if(!F||F.pag!=='cartao')return;const v=totalForm(),n=lerParc();
  $('#f-prev').textContent=v>0&&n?(n>1?n+'× de '+brl(parcBase({valor:Math.round(v*100)/100,parcelas:n}))+' · total '+brl(v):'1× (à vista no cartão) · '+brl(v)):'';}
function syncPag(){
  const cc=F.pag==='cartao';
  document.querySelectorAll('#f-pag [data-g]').forEach(b=>{const on=b.dataset.g===F.pag;b.setAttribute('aria-pressed',on);b.style.background=on?'var(--brand)':'';});
  document.querySelectorAll('#f-ccmodo [data-v]').forEach(b=>{const on=(b.dataset.v==='1')===F.porParcela;b.setAttribute('aria-pressed',on);b.style.background=on?'var(--brand)':'';});
  document.querySelectorAll('#f-cartao [data-k]').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.k===F.cartao));
  $('#f-cc').style.display=$('#f-ccmodo').style.display=$('#f-mesbox').style.display=cc?'':'none';
  $('#f-datalab').textContent=cc?'Data da compra':'Data';
  $('#f-ok').textContent=F.orig||F.compra?'Salvar alterações':cc?'Lançar no cartão':'Salvar gasto';
}
function syncTipo(){document.querySelectorAll('#f-tipo [data-t]').forEach(b=>{const on=b.dataset.t===F.tipo;b.setAttribute('aria-pressed',on);b.style.background=on?TCOR[b.dataset.t]:'';});}
function syncSubs(){const ex=new Set(exemplosDe(F.cat));S.lanc.concat(S.compras).filter(l=>l.cat===F.cat&&l.sub).forEach(l=>ex.add(l.sub));$('#f-subs').innerHTML=[...ex].map(s=>'<option value="'+esc(s)+'">').join('');}
function fecharForm(){$('#scrim').classList.remove('on');$('#sheet').classList.remove('on');F=null;}
/** depois de salvar/cancelar uma compra aberta pela folha do cartão, volta para ela */
function voltarForm(){const k=F&&F.voltar&&cartao(F.voltar);if(k)abrirCartao(k);else fecharForm();}
function lerForm(){
  const v=totalForm();
  if(!(v>0))return'Informe o valor do gasto.';
  if(v>=1e7)return'Valor alto demais. Confira o número.';
  if(!F.cat)return'Escolha uma categoria.';
  if(!F.tipo)return'Escolha o tipo: necessidade, desejo ou poupança/dívida.';
  const d=$('#f-data').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return'Escolha a data.';
  const r={data:d,desc:$('#f-desc').value.trim(),cat:F.cat,sub:$('#f-sub').value.trim(),tipo:F.tipo,valor:Math.round(v*100)/100};
  if(F.pag!=='cartao')return r;
  if(!F.cartao)return'Escolha o cartão.';
  const n=lerParc();if(!n)return'Parcelas precisa ser um número de 1 a 99.';
  const mes=$('#f-mes').value;if(!/^\d{4}-\d{2}$/.test(mes))return'Escolha o mês da 1ª parcela.';
  return Object.assign(r,{cartao:F.cartao,parcelas:n,mes});
}
const antesDe=l=>({data:l.data,valor:l.valor,desc:l.desc,cat:l.cat});
async function salvarForm(){
  const r=lerForm();if(typeof r==='string'){$('#f-err').textContent=r;return;}
  const b=$('#f-ok');b.disabled=true;b.textContent='Salvando…';
  const editando=!!(F.orig||F.compra);
  try{
    let d;
    if(F.pag==='cartao')d=await api('compra_salvar',Object.assign({id:F.compra?F.compra.id:null,uid:F.uid},r));
    else d=editando?await api('editar',{linha:F.orig.linha,antes:antesDe(F.orig),novo:r}):await api('salvar',Object.assign({uid:F.uid},r));
    receber(d);
    if(r.cartao){if(F.voltar)F.voltar=F.cartao;S.mes=r.mes;voltarForm();}else{S.mes=mesDe(r.data);fecharForm();}
    render();toast(editando?'Alterações salvas':r.cartao?'Compra lançada no cartão':'Gasto salvo');
  }catch(e){if(!F)return;$('#f-err').textContent=e.message;b.disabled=false;b.textContent='Tentar de novo';}
}
async function excluir(){
  const b=$('#f-del');
  if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Confirmar';return;}
  b.disabled=true;
  const cc=!!F.compra;
  try{
    receber(cc?await api('compra_excluir',{id:F.compra.id}):await api('excluir',{linha:F.orig.linha,antes:antesDe(F.orig)}));
    cc?voltarForm():fecharForm();render();toast(cc?'Compra excluída':'Lançamento excluído');
  }catch(e){if(!F)return;$('#f-err').textContent=e.message;b.disabled=false;}
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
/* ---------- cartões de crédito ---------- */
function abrirSheet(h){$('#sheetIn').innerHTML=h;$('#scrim').classList.add('on');$('#sheet').classList.add('on');}
function abrirCartao(c){
  if(S.offline&&!DEMO_MODE()){toast('Sem conexão. Tente de novo quando a internet voltar.');return;}
  F={modo:'cartao',orig:c||null,dono:c?c.dono:(S.me?S.me.id:'')};
  const donos=pessoas().concat([{id:'',nome:'Sem dono',cor:'var(--px)'}]);
  let h='<div class="grab"></div><h3 id="sheetTitle">'+(c?esc(c.nome):'Novo cartão')+'</h3>'+
    '<label class="lab" for="k-nome">Nome do cartão</label><input class="inp" id="k-nome" maxlength="60" placeholder="Ex.: Nubank" value="'+esc(c?c.nome:'')+'">'+
    '<label class="lab" for="k-lim">Limite (R$)</label><input class="inp num" id="k-lim" inputmode="decimal" placeholder="0,00" value="'+(c?c.limite.toFixed(2).replace('.',','):'')+'">'+
    '<span class="lab">De quem é</span><div class="seg" id="k-dono">'+donos.map(p=>'<button type="button" data-d="'+esc(p.id)+'" data-cor="'+p.cor+'">'+esc(p.nome)+'</button>').join('')+'</div>';
  if(c){
    const u=usado(c.id,S.mes);
    h+='<div class="card" style="background:var(--bg);margin-top:14px"><div class="kv" style="padding-top:0"><span>Fatura de '+MESES[+S.mes.slice(5)-1]+'</span><b class="num">'+brl(fatura(c.id,S.mes))+'</b></div>'+
       '<div class="kv"><span>Limite usado</span><b class="num">'+brl(u)+'</b></div><div class="kv"><span>Limite livre</span><b class="num" style="color:'+(c.limite-u<0?'var(--neg)':'var(--pos)')+'">'+brl(c.limite-u)+'</b></div></div>';
    const ativas=comprasDe(c.id).filter(x=>mesNum(x.mes)+x.parcelas>mesNum(S.mes)).sort((a,b)=>b.mes.localeCompare(a.mes)||b.id-a.id);
    h+='<span class="lab">Compras com parcelas a pagar ('+ativas.length+')</span><div class="list">'+(ativas.length?ativas.map(x=>{const k=parcelaNoMes(x,S.mes);
      return '<button class="item" data-compra="'+x.id+'" style="grid-template-columns:1fr auto"><div style="min-width:0"><div class="d">'+esc(x.desc||'Compra')+'</div><div class="small muted sm">'+tag(x.quem)+' '+
        (k<0?'começa em '+MES3[+x.mes.slice(5)-1]+'/'+x.mes.slice(2,4):'parcela '+(k+1)+' de '+x.parcelas)+' · total '+brl(x.valor)+'</div></div>'+
        '<div class="val num">'+(x.parcelas>1?x.parcelas+'× ':'')+brl(parcBase(x))+'</div></button>';}).join(''):'<div class="small muted">Nenhuma parcela em aberto.</div>')+'</div>'+
      '<button class="btn ghost" id="k-compra" style="width:100%;margin-top:8px">+ Lançar compra neste cartão</button>';
  }
  h+='<div class="err" id="k-err"></div><div class="actions">'+(c?'<button class="btn danger" id="k-del">Excluir</button>':'<button class="btn ghost" id="k-cancel">Cancelar</button>')+'<button class="btn" id="k-ok">Salvar cartão</button></div>';
  abrirSheet(h);
  const syncDono=()=>document.querySelectorAll('#k-dono [data-d]').forEach(b=>{const on=b.dataset.d===F.dono;b.setAttribute('aria-pressed',on);b.style.background=on?b.dataset.cor:'';});
  syncDono();
  $('#k-dono').onclick=e=>{const b=e.target.closest('[data-d]');if(!b)return;F.dono=b.dataset.d;syncDono();};
  document.querySelectorAll('[data-compra]').forEach(b=>b.onclick=()=>abrirCompra(S.compras.find(x=>x.id===+b.dataset.compra),c.id));
  if($('#k-compra'))$('#k-compra').onclick=()=>abrirCompra(null,c.id);
  if($('#k-cancel'))$('#k-cancel').onclick=fecharForm;
  if($('#k-del'))$('#k-del').onclick=async()=>{const b=$('#k-del');
    if(b.dataset.conf!=='1'){b.dataset.conf='1';b.textContent='Apagar cartão e compras?';return;}
    b.disabled=true;
    try{receber(await api('cartao_excluir',{id:c.id}));fecharForm();render();toast('Cartão excluído');}
    catch(e){if(!F)return;$('#k-err').textContent=e.message;b.disabled=false;}};
  $('#k-ok').onclick=async()=>{
    const nome=$('#k-nome').value.trim(),lim=$('#k-lim').value.trim()===''?0:parseValor($('#k-lim').value);
    if(!nome){$('#k-err').textContent='Informe o nome do cartão.';return;}
    if(!(lim>=0)||lim>=1e8){$('#k-err').textContent='Confira o limite.';return;}
    const b=$('#k-ok');b.disabled=true;b.textContent='Salvando…';
    try{receber(await api('cartao_salvar',{id:c?c.id:null,nome,dono:F.dono,limite:Math.round(lim*100)/100}));fecharForm();render();toast('Cartão salvo');}
    catch(e){if(!F)return;$('#k-err').textContent=e.message;b.disabled=false;b.textContent='Tentar de novo';}
  };
}
function abrirCompra(x,cartaoId){abrirForm(null,{compra:x,cartao:cartaoId||(S.cartoes[0]&&S.cartoes[0].id),voltar:cartaoId});}
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
/* ---------- teclado: o campo em edição nunca fica escondido atrás dele ----------
   --kb = quanto do teclado ainda cobre a tela (se o Android já encolheu a tela, desconta). */
let alturaSemTeclado=window.innerHeight;
function mostrarFoco(){const el=document.activeElement;if(el&&/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))el.scrollIntoView({block:'center',behavior:'smooth'});}
function teclado(h){
  const cobre=h>0?Math.max(0,h-Math.max(0,alturaSemTeclado-window.innerHeight)):0;
  document.documentElement.style.setProperty('--kb',cobre+'px');
  document.body.classList.toggle('kb',h>0);
  if(h>0)setTimeout(mostrarFoco,60);
}
window.addEventListener('resize',()=>{if(!document.body.classList.contains('kb'))alturaSemTeclado=window.innerHeight;});
const Kb=Cap&&Cap.Plugins&&Cap.Plugins.Keyboard;
if(Kb){Kb.addListener('keyboardDidShow',i=>teclado(i.keyboardHeight||0));Kb.addListener('keyboardWillHide',()=>teclado(0));}
else if(window.visualViewport){const vv=window.visualViewport;
  vv.addEventListener('resize',()=>{const h=window.innerHeight-vv.height-vv.offsetTop;teclado(h>80?h:0);});}
document.addEventListener('focusin',e=>{if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))setTimeout(mostrarFoco,350);});

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
    usuarios:[{id:'Eu',nome:'Eu'},{id:'Esposa',nome:'Esposa'}],
    cartoes:[{id:1,nome:'Nubank',dono:'Eu',limite:11990},{id:2,nome:'InfinitePay',dono:'Eu',limite:1100},{id:3,nome:'Banco Pan',dono:'Eu',limite:1050},{id:4,nome:'Cartão da esposa',dono:'Esposa',limite:0}],
    compras:[{id:1,cartao:1,mes:somaMes(mesDe(hoje),-2),desc:'Geladeira',cat:'Compras',tipo:'Desejo',valor:3600,parcelas:10,quem:'Eu'},{id:2,cartao:1,mes:mesDe(hoje),desc:'Mercado',cat:'Mercado',tipo:'Necessidade',valor:480.5,parcelas:1,quem:'Esposa'},
      {id:3,cartao:2,mes:somaMes(mesDe(hoje),-1),desc:'Celular',cat:'Compras',tipo:'Desejo',valor:900,parcelas:3,quem:'Eu'},{id:4,cartao:3,mes:mesDe(hoje),desc:'Farmácia',cat:'Saúde',tipo:'Necessidade',valor:120,parcelas:2,quem:'Eu'}]};
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
  const novoId=L=>L.reduce((m,x)=>Math.max(m,x.id),0)+1;
  if(acao==='cartao_salvar'){const c={nome:a.nome,dono:a.dono||'',limite:a.limite};
    if(a.id)Object.assign(DEMO.cartoes.find(x=>x.id===a.id),c);else DEMO.cartoes.push(Object.assign({id:novoId(DEMO.cartoes)},c));}
  if(acao==='cartao_excluir'){DEMO.cartoes=DEMO.cartoes.filter(x=>x.id!==a.id);DEMO.compras=DEMO.compras.filter(x=>x.cartao!==a.id);}
  if(acao==='compra_salvar'){const c={cartao:a.cartao,mes:a.mes,data:a.data,desc:a.desc,cat:a.cat,sub:a.sub,tipo:a.tipo,valor:a.valor,parcelas:a.parcelas};
    if(a.id)Object.assign(DEMO.compras.find(x=>x.id===a.id),c);else DEMO.compras.push(Object.assign({id:novoId(DEMO.compras),quem:S.me.id},c));}
  if(acao==='compra_excluir'){DEMO.compras=DEMO.compras.filter(x=>x.id!==a.id);}
  return JSON.parse(JSON.stringify(DEMO));
}

iniciar();
})();
