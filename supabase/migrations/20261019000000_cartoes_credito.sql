-- Cartões de crédito: limite por cartão e compras parceladas.
-- Rode este arquivo inteiro no SQL Editor do Supabase (depois do schema inicial).

create table public.cartoes (
  id bigint generated always as identity primary key,
  nome text not null,
  dono text references public.usuarios(id) on delete set null,
  limite numeric(12,2) not null default 0 check (limite >= 0),
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

create table public.compras_cartao (
  id bigint generated always as identity primary key,
  uid text unique,
  cartao_id bigint not null references public.cartoes(id) on delete cascade,
  mes date not null,                         -- 1º dia do mês da 1ª parcela
  descricao text not null default '',
  valor numeric(12,2) not null check (valor > 0),   -- valor total da compra
  parcelas int not null default 1 check (parcelas between 1 and 99),
  quem text references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index compras_cartao_cartao_idx on public.compras_cartao (cartao_id);

alter table public.cartoes enable row level security;
alter table public.compras_cartao enable row level security;
revoke all on public.cartoes, public.compras_cartao from anon, authenticated;

-- Os cartões de "Eu". Os da esposa são cadastrados pelo próprio app (Início → Cartões → + Cartão).
insert into public.cartoes (nome, dono, limite, ordem) values
  ('Nubank', 'Eu', 11990, 1),
  ('InfinitePay', 'Eu', 1100, 2),
  ('Banco Pan', 'Eu', 1050, 3);

create function public.apagar_cartao_(p_id bigint) returns void
language plpgsql security definer set search_path = public as $f$
begin
  delete from cartoes where id = p_id;  -- as compras do cartão vão junto (cascade)
end $f$;

create function public.apagar_compra_(p_id bigint) returns void
language plpgsql security definer set search_path = public as $f$
begin
  delete from compras_cartao where id = p_id;
end $f$;

create or replace function public.dados_()
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
    'cartoes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'dono', coalesce(dono, ''),
        'limite', limite) order by ordem, id) from cartoes), '[]'::jsonb),
    'compras', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'cartao', cartao_id, 'mes', to_char(mes, 'YYYY-MM'),
        'desc', descricao, 'valor', valor, 'parcelas', parcelas, 'quem', coalesce(quem, '')) order by mes, id)
      from compras_cartao), '[]'::jsonb),
    'url', ''
  )
$f$;

create or replace function public.api(acao text, token text default null, dados jsonb default '{}')
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
    elsif acao = 'cartao_salvar' then
      if trim(coalesce(a->>'nome', '')) = '' then raise exception 'Informe o nome do cartão.'; end if;
      if not (coalesce((a->>'limite')::numeric, -1) >= 0) or (a->>'limite')::numeric >= 100000000 then
        raise exception 'Limite inválido.';
      end if;
      if coalesce(a->>'dono', '') <> '' and not exists (select 1 from usuarios where id = a->>'dono') then
        raise exception 'Dono do cartão desconhecido.';
      end if;
      if coalesce(a->>'id', '') = '' then
        insert into cartoes (nome, dono, limite, ordem)
        values (left(trim(a->>'nome'), 60), nullif(a->>'dono', ''), round((a->>'limite')::numeric, 2),
                coalesce((select max(ordem) from cartoes), 0) + 1);
      else
        update cartoes set nome = left(trim(a->>'nome'), 60), dono = nullif(a->>'dono', ''),
               limite = round((a->>'limite')::numeric, 2)
         where id = (a->>'id')::bigint;
        if not found then raise exception 'Esse cartão não existe mais. Atualize e tente de novo.'; end if;
      end if;
    elsif acao = 'cartao_excluir' then
      perform apagar_cartao_((a->>'id')::bigint);
    elsif acao = 'compra_salvar' then
      if not exists (select 1 from cartoes where id = (a->>'cartao')::bigint) then raise exception 'Escolha um cartão.'; end if;
      if coalesce(a->>'mes', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Mês da 1ª parcela inválido.'; end if;
      if not (coalesce((a->>'valor')::numeric, 0) > 0) then raise exception 'Informe um valor maior que zero.'; end if;
      if (a->>'valor')::numeric >= 10000000 then raise exception 'Valor alto demais.'; end if;
      if coalesce(a->>'parcelas', '') !~ '^[0-9]{1,2}$' or (a->>'parcelas')::int < 1 then
        raise exception 'Parcelas precisa ser um número de 1 a 99.';
      end if;
      if coalesce(a->>'id', '') = '' then
        if coalesce(a->>'uid', '') <> '' and exists (select 1 from compras_cartao where uid = left(a->>'uid', 64)) then
          return jsonb_build_object('ok', true, 'dados', dados_());  -- reenvio da mesma compra
        end if;
        insert into compras_cartao (uid, cartao_id, mes, descricao, valor, parcelas, quem)
        values (nullif(left(a->>'uid', 64), ''), (a->>'cartao')::bigint, (a->>'mes' || '-01')::date,
                left(coalesce(a->>'desc', ''), 200), round((a->>'valor')::numeric, 2), (a->>'parcelas')::int, usuario);
      else
        update compras_cartao set cartao_id = (a->>'cartao')::bigint, mes = (a->>'mes' || '-01')::date,
               descricao = left(coalesce(a->>'desc', ''), 200), valor = round((a->>'valor')::numeric, 2),
               parcelas = (a->>'parcelas')::int, atualizado_em = now()
         where id = (a->>'id')::bigint;
        if not found then raise exception 'Essa compra não existe mais. Atualize e tente de novo.'; end if;
      end if;
    elsif acao = 'compra_excluir' then
      perform apagar_compra_((a->>'id')::bigint);
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

revoke all on function public.apagar_cartao_(bigint), public.apagar_compra_(bigint),
  public.dados_(), public.api(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.api(text, text, jsonb) to anon, authenticated;
