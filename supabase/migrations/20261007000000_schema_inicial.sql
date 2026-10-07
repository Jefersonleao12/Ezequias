-- Minhas Finanças: banco no Supabase.
-- As tabelas ficam fechadas (RLS ligado, sem policies): o app só fala com a função public.api(),
-- que confere o PIN/sessão antes de ler ou gravar qualquer coisa.

create extension if not exists pgcrypto with schema extensions;

create table public.usuarios (
  id text primary key,
  nome text not null,
  pin_hash text,
  falhas int not null default 0,
  bloqueado_ate timestamptz
);

create table public.sessoes (
  token_hash text primary key,
  usuario_id text not null references public.usuarios(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '90 days'
);

create table public.guia (
  cat text primary key,
  tipo text not null,
  exemplos text not null default '',
  ordem int not null default 0
);

create table public.lancamentos (
  id bigint generated always as identity primary key,
  uid text unique,
  data date not null,
  descricao text not null default '',
  categoria text not null,
  subcategoria text not null default '',
  tipo text not null default '',
  valor numeric(12,2) not null check (valor > 0),
  quem text references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index lancamentos_data_idx on public.lancamentos (data);

create table public.ajustes (
  id int primary key default 1 check (id = 1),
  renda numeric(12,2) not null default 0,
  metas numeric[] not null default '{0.5,0.3,0.2}'
);

alter table public.usuarios enable row level security;
alter table public.sessoes enable row level security;
alter table public.guia enable row level security;
alter table public.lancamentos enable row level security;
alter table public.ajustes enable row level security;
revoke all on public.usuarios, public.sessoes, public.guia, public.lancamentos, public.ajustes from anon, authenticated;

insert into public.usuarios (id, nome) values ('Eu', 'Eu'), ('Esposa', 'Esposa');
insert into public.ajustes (id) values (1);
insert into public.guia (cat, tipo, exemplos, ordem) values
  ('Moradia','Necessidade','Aluguel, Condomínio, IPTU',1),
  ('Contas','Necessidade','Água, Luz, Internet, Celular',2),
  ('Mercado','Necessidade','Supermercado, Feira, Açougue',3),
  ('Transporte','Necessidade','Combustível, Ônibus, App de transporte',4),
  ('Saúde','Necessidade','Plano de saúde, Farmácia, Consultas',5),
  ('Educação','Necessidade','Mensalidade, Cursos, Material',6),
  ('Animais','Necessidade','Ração, Veterinário, Pet shop',7),
  ('Lazer','Desejo','Cinema, Streaming, Passeios',8),
  ('Restaurante','Desejo','Delivery, Bar, Café',9),
  ('Compras','Desejo','Roupas, Eletrônicos, Presentes',10),
  ('Assinaturas','Desejo','Apps, Clubes, Serviços recorrentes',11),
  ('Poupança','Poupança/Dívida','Reserva de emergência, Objetivo',12),
  ('Investimento','Poupança/Dívida','Renda fixa, Ações, Fundos',13),
  ('Dívidas','Poupança/Dívida','Cartão, Empréstimo, Financiamento',14),
  ('Outros','-','Gastos não classificados',15);

-- Apagar fica em funções próprias (chamadas por definir_pin e api).
create function public.apagar_sessoes_(p_usuario text) returns void
language plpgsql security definer set search_path = public as $f$
begin
  delete from sessoes where expira_em < now() or usuario_id = p_usuario;
end $f$;

create function public.apagar_lancamento_(p_id bigint) returns void
language plpgsql security definer set search_path = public as $f$
begin
  delete from lancamentos where id = p_id;
end $f$;

-- Definir/trocar PIN: só pelo SQL Editor do Supabase (não é chamável pelo app).
--   select definir_pin('Eu', '1234', 'Jeferson');
--   select definir_pin('Esposa', '5678', 'Nome dela');
create function public.definir_pin(p_usuario text, p_pin text, p_nome text default null)
returns void language plpgsql security definer set search_path = public, extensions as $f$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then raise exception 'O PIN precisa ter de 4 a 8 números.'; end if;
  update usuarios set pin_hash = crypt(p_pin, gen_salt('bf')), falhas = 0, bloqueado_ate = null,
         nome = coalesce(nullif(trim(p_nome), ''), nome)
   where id = p_usuario;
  if not found then raise exception 'Usuário % não existe.', p_usuario; end if;
  perform apagar_sessoes_(p_usuario);  -- trocar o PIN desconecta os aparelhos
end $f$;

create function public.dados_()
returns jsonb language sql stable security definer set search_path = public as $f$
  select jsonb_build_object(
    'lancamentos', coalesce((select jsonb_agg(jsonb_build_object(
        'linha', id, 'data', to_char(data, 'YYYY-MM-DD'), 'desc', descricao, 'cat', categoria,
        'sub', subcategoria, 'tipo', tipo, 'valor', valor, 'quem', coalesce(quem, '')) order by data, id)
      from lancamentos), '[]'::jsonb),
    'guia', coalesce((select jsonb_agg(jsonb_build_object('cat', cat, 'tipo', tipo, 'ex', exemplos) order by ordem)
      from guia), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(cat order by ordem) from guia), '[]'::jsonb),
    'renda', (select renda from ajustes where id = 1),
    'metas', (select to_jsonb(metas) from ajustes where id = 1),
    'usuarios', (select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by id desc) from usuarios),
    'url', ''
  )
$f$;

create function public.validar_(d jsonb) returns void language plpgsql set search_path = public as $f$
begin
  if d is null or coalesce(d->>'data', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data inválida.'; end if;
  if not (coalesce((d->>'valor')::numeric, 0) > 0) then raise exception 'Informe um valor maior que zero.'; end if;
  if (d->>'valor')::numeric >= 10000000 then raise exception 'Valor alto demais.'; end if;
  if coalesce(d->>'cat', '') = '' then raise exception 'Escolha uma categoria.'; end if;
end $f$;

create function public.api(acao text, token text default null, dados jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public, extensions as $f$
declare
  u usuarios%rowtype;
  usuario text;
  t text;
  n bigint;
  l lancamentos%rowtype;
  a jsonb := coalesce(dados, '{}');
  m numeric[];
begin
  begin
    if acao = 'ping' then
      return jsonb_build_object('ok', true, 'dados', jsonb_build_object('app', 'Minhas Finanças',
        'usuarios', (select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'configurado', pin_hash is not null) order by id desc) from usuarios)));
    end if;

    if acao = 'login' then
      select * into u from usuarios where id = a->>'usuario';
      if not found then raise exception 'AUTH:Usuário desconhecido.'; end if;
      if u.pin_hash is null then raise exception 'AUTH:O PIN de % ainda não foi criado.', u.nome; end if;
      if u.bloqueado_ate is not null and u.bloqueado_ate > now() then
        raise exception 'AUTH:Muitas tentativas erradas. Espere 15 minutos.';
      end if;
      if crypt(coalesce(a->>'pin', ''), u.pin_hash) <> u.pin_hash then
        update usuarios set
          bloqueado_ate = case when falhas + 1 >= 8 then now() + interval '15 minutes' else bloqueado_ate end,
          falhas = case when falhas + 1 >= 8 then 0 else falhas + 1 end
         where id = u.id;
        return jsonb_build_object('ok', false, 'auth', true, 'erro', 'PIN incorreto.');  -- sem raise, para o contador não ser desfeito
      end if;
      update usuarios set falhas = 0, bloqueado_ate = null where id = u.id;
      perform apagar_sessoes_(null);
      t := encode(gen_random_bytes(24), 'hex');
      insert into sessoes (token_hash, usuario_id) values (encode(digest(t, 'sha256'), 'hex'), u.id);
      return jsonb_build_object('ok', true, 'dados', jsonb_build_object('token', t,
        'usuario', jsonb_build_object('id', u.id, 'nome', u.nome)));
    end if;

    select s.usuario_id into usuario from sessoes s
     where s.token_hash = encode(digest(coalesce(token, ''), 'sha256'), 'hex') and s.expira_em > now();
    if usuario is null then raise exception 'AUTH:Sessão expirada. Entre de novo.'; end if;

    if acao = 'salvar' then
      perform validar_(a);
      if coalesce(a->>'uid', '') <> '' and exists (select 1 from lancamentos where uid = left(a->>'uid', 64)) then
        return jsonb_build_object('ok', true, 'dados', dados_());  -- reenvio do mesmo gasto
      end if;
      insert into lancamentos (uid, data, descricao, categoria, subcategoria, tipo, valor, quem)
      values (nullif(left(a->>'uid', 64), ''), (a->>'data')::date, left(coalesce(a->>'desc', ''), 200), left(a->>'cat', 60),
              left(coalesce(a->>'sub', ''), 100), left(coalesce(a->>'tipo', ''), 30), round((a->>'valor')::numeric, 2), usuario);
    elsif acao in ('editar', 'excluir') then
      n := (a->>'linha')::bigint;
      select * into l from lancamentos where id = n for update;
      if not found
         or (a->'antes'->>'data') is distinct from to_char(l.data, 'YYYY-MM-DD')
         or round(coalesce((a->'antes'->>'valor')::numeric, 0) * 100) <> round(l.valor * 100)
         or trim(coalesce(a->'antes'->>'desc', '')) <> trim(l.descricao)
         or trim(coalesce(a->'antes'->>'cat', '')) <> trim(l.categoria) then
        raise exception 'Esse lançamento foi alterado por outra pessoa. Atualize e tente de novo.';
      end if;
      if acao = 'excluir' then
        perform apagar_lancamento_(n);
      else
        perform validar_(a->'novo');
        update lancamentos set data = (a->'novo'->>'data')::date, descricao = left(coalesce(a->'novo'->>'desc', ''), 200),
               categoria = left(a->'novo'->>'cat', 60), subcategoria = left(coalesce(a->'novo'->>'sub', ''), 100),
               tipo = left(coalesce(a->'novo'->>'tipo', ''), 30), valor = round((a->'novo'->>'valor')::numeric, 2),
               atualizado_em = now()
         where id = n;
      end if;
    elsif acao = 'ajustes' then
      if not (coalesce((a->>'renda')::numeric, -1) >= 0) then raise exception 'Renda inválida.'; end if;
      select array_agg(x::numeric) into m from jsonb_array_elements_text(a->'metas') x;
      if m is null or array_length(m, 1) <> 3 or exists (select 1 from unnest(m) v where not (v >= 0 and v <= 1))
         or round((select sum(v) from unnest(m) v) * 100) <> 100 then
        raise exception 'As metas precisam somar 100%%.';
      end if;
      update ajustes set renda = round((a->>'renda')::numeric, 2), metas = m where id = 1;
    elsif acao <> 'carregar' then
      raise exception 'Ação desconhecida.';
    end if;

    return jsonb_build_object('ok', true, 'dados', dados_());
  exception when others then
    if sqlerrm like 'AUTH:%' then
      return jsonb_build_object('ok', false, 'auth', true, 'erro', substr(sqlerrm, 6));
    end if;
    return jsonb_build_object('ok', false, 'erro', sqlerrm);
  end;
end $f$;
revoke all on function public.apagar_sessoes_(text), public.apagar_lancamento_(bigint), public.definir_pin(text, text, text),
  public.dados_(), public.validar_(jsonb), public.api(text, text, jsonb) from public, anon, authenticated;
-- Única porta de entrada do app: POST /rest/v1/rpc/api
grant execute on function public.api(text, text, jsonb) to anon, authenticated;
