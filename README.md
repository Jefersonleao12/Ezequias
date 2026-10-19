# 💰 Minhas Finanças — Eu + Esposa

App de gastos da casa para duas pessoas. Cada um entra com o seu PIN, **os dois veem todos os lançamentos** e cada gasto mostra **quem lançou**. Os totais, a regra 50-30-20 e os relatórios somam a casa toda; o extrato filtra por pessoa.

Os dados ficam num banco **PostgreSQL no Supabase** e o site é publicado pelo **GitHub Pages**.

```
Celular dela ─┐                                  ┌─ Supabase (Postgres)
              ├─ App (GitHub Pages / APK) ─ RPC ─┤  função api()  ← única porta de entrada
Seu celular ──┘                                  └─ tabelas lancamentos, usuarios, guia, ajustes, sessoes
```

| Pasta | O que é |
|---|---|
| `web/` | O app (PWA). É o que o GitHub Pages publica e o que vai dentro do APK |
| `web/config.js` | URL do projeto Supabase e a chave *publishable* |
| `supabase/migrations/` | SQL que cria as tabelas e as funções do banco |
| `assets/` | Ícone usado para gerar os ícones do Android |
| `.github/workflows/` | `pages.yml` publica o site, `apk.yml` gera o APK |

---

## 1. Banco de dados (Supabase)

O projeto **`painel-financeiro`** (`eugdnwdhhzcqmdlszwzj`, região São Paulo) já está criado e com o esquema de [`supabase/migrations/20261007000000_schema_inicial.sql`](supabase/migrations/20261007000000_schema_inicial.sql) aplicado.
Se um dia precisar recriar em outro projeto, cole esse arquivo no **SQL Editor** e rode.

| Tabela | Conteúdo |
|---|---|
| `lancamentos` | data, descrição, categoria, subcategoria, tipo, valor e **quem** lançou |
| `usuarios` | `Eu` e `Esposa`: nome que aparece no app e o hash do PIN |
| `guia` | categorias, tipo (Necessidade / Desejo / Poupança/Dívida) e exemplos |
| `ajustes` | renda mensal e metas da regra 50-30-20 |
| `sessoes` | logins ativos (só o hash do token; expiram em 90 dias) |
| `cartoes` | cartões de crédito: nome, de quem é e limite |
| `compras_cartao` | compras no cartão: valor total, em quantas vezes, mês da 1ª parcela e categoria |

### Cartões de crédito (versão 3.1)

Rode uma vez no **SQL Editor** o arquivo [`supabase/migrations/20261019000000_cartoes_credito.sql`](supabase/migrations/20261019000000_cartoes_credito.sql).
Ele cria as tabelas, já cadastra os cartões de `Eu` (Nubank R$ 11.990, InfinitePay R$ 1.100, Banco Pan R$ 1.050) e acrescenta as ações de cartão à função `api()`.
Depois rode também [`supabase/migrations/20261019010000_compras_com_categoria.sql`](supabase/migrations/20261019010000_compras_com_categoria.sql) (versão 3.2), que dá às compras no cartão a data e as mesmas categorias dos gastos.

- **Lançar:** botão **+** → **💳 Cartão de crédito** → cartão, valor (total ou da parcela), em quantas vezes, categoria e mês da 1ª parcela.
- **Contas da casa:** a parcela de cada mês entra no gasto do mês, na categoria escolhida, na regra 50-30-20 e no extrato (com 💳 e "3/10").
- **Painel:** a seção **Cartões de crédito** do Início mostra a fatura do mês e o limite usado/livre. Tocando num cartão dá para editar nome, limite e dono e ver as compras parceladas.
- Os cartões da esposa se cadastram pelo próprio app, em **+ Cartão**.

### Criar os PINs (obrigatório, uma vez)

No painel do Supabase → **SQL Editor**, rode (troque PINs e nomes):

```sql
select definir_pin('Eu', '1234', 'Jeferson');
select definir_pin('Esposa', '5678', 'Nome dela');
```

- PIN de 4 a 8 números. O terceiro parâmetro (nome que aparece no app) é opcional.
- Para trocar um PIN, rode de novo. Trocar o PIN desconecta os aparelhos que usavam o antigo.
- Para mudar categorias, edite a tabela `guia` no **Table Editor**.

**Segurança:** as tabelas têm RLS ligado e nenhuma permissão para o público; a chave *publishable* em `config.js` só consegue chamar a função `api()`, que exige login. O PIN fica guardado só como hash bcrypt, o token de sessão só como SHA-256, e 8 tentativas erradas bloqueiam o usuário por 15 minutos. `definir_pin` **não** pode ser chamada pelo app, só pelo SQL Editor.
Nunca coloque no repositório a chave `service_role` / *secret* nem a senha do banco.

## 2. GitHub Pages

1. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Faça um push na branch padrão (ou **Actions → Publicar no GitHub Pages → Run workflow**).
3. O site fica em `https://<seu-usuario>.github.io/<repositório>/`.

Os workflows só publicam a partir da **branch padrão** do repositório.
O GitHub Pages gratuito exige repositório **público**; o código pode ser público sem problema, porque os dados só abrem com PIN.

## 3. APK para Android (opcional)

**A) Instalar pelo navegador (mais simples).** Abra o site no Chrome do Android → menu ⋮ → **Instalar app**.

**B) Arquivo `.apk`.** A cada push o workflow **Gerar APK** compila o app com Capacitor e publica em **Releases → "apk"** (`.../releases/download/apk/MinhasFinancas.apk`).
Para versões novas instalarem por cima da antiga, crie uma chave fixa uma única vez:

```bash
keytool -genkeypair -v -keystore debug.keystore -storepass android -alias androiddebugkey \
  -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Minhas Financas"
base64 -w0 debug.keystore   # copie a saída
```

Cole a saída em **Settings → Secrets and variables → Actions** como `ANDROID_KEYSTORE_BASE64`.

## Testar sem banco

`npm run serve` e abra `http://localhost:8080`. Sem `supabaseUrl` no `config.js`, a primeira tela oferece **"Só quero ver uma demonstração"** com dados de exemplo.

---

## O que mudou da versão com Google Sheets

| Antes (Apps Script + planilha) | Agora (Supabase) |
|---|---|
| `Codigo.gs` com `doPost` | Função Postgres `public.api(acao, token, dados)` chamada por `POST /rest/v1/rpc/api` (mesmas ações: `ping`, `login`, `carregar`, `salvar`, `editar`, `excluir`, `ajustes`) |
| Linha da planilha identificava o lançamento | `id` do lançamento no banco |
| PIN em *Script Properties* (SHA-256 + segredo) | PIN em `usuarios.pin_hash` (bcrypt) |
| Token HMAC sem validade | Token aleatório por login, guardado como hash, expira em 90 dias |
| `LockService` contra gravação simultânea | Transações do Postgres (`select … for update` ao editar/excluir) |
| Reenvio duplicado barrado por 10 min no cache | Coluna `uid` única: o mesmo gasto nunca é gravado duas vezes |
| Renda/metas nas células K26 e M29:M31 | Tabela `ajustes` |
