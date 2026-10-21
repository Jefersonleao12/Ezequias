# Escala Técnica — gestão de equipes de suporte e backbone

Sistema para organizar as duplas de **Suporte Técnico** e **Infraestrutura Backbone** de um provedor de internet:
escala 6x1 e transição para 5x2, plantão de fim de semana com compensação, feriados, ausências, banco de horas
e painel de cobertura.

> **Importante:** este código roda na plataforma **[Floot](https://floot.com)** (projeto `Gestão de Equipes Técnicas`).
> Ele usa o roteamento, a conexão com o banco e o kit de componentes do Floot, então não sobe sozinho em outro servidor
> sem adaptação. O motor de regras (`helpers/scheduleEngine.tsx`) é TypeScript puro e pode ser reaproveitado em qualquer projeto.

## Telas

| Rota | Arquivo | O que faz |
|---|---|---|
| `/` | `pages/_index.tsx` | Painel: duplas em campo hoje, cobertura dos próximos 14 dias, plantão do fim de semana, alertas e sugestões |
| `/escala` | `pages/escala.tsx` | Grade mensal por dupla; clique para registrar ausência ou mover folga |
| `/plantao` | `pages/plantao.tsx` | Regras do plantão, rodízio automático, compensação e banco de horas |
| `/feriados` | `pages/feriados.tsx` | Cadastro e importação de feriados, plantão no feriado e folga no dia útil seguinte |
| `/planejamento` | `pages/planejamento.tsx` | Gerador de escala 6x1/5x2 e comparativo entre as duas |
| `/equipes` | `pages/equipes.tsx` | Cadastro de técnicos e duplas |
| `/ausencias` | `pages/ausencias.tsx` | Férias, atestados, folgas extras |

Cada página tem um `.module.css` e um `.pageLayout.tsx` (que envolve a tela no menu lateral `components/AppShell.tsx`).

## Estrutura

```
escala-tecnica/
├── schema.sql                 estrutura do banco PostgreSQL
├── base.css                   cores, fontes e espaçamentos (modo claro e escuro)
├── helpers/
│   ├── scheduleEngine.tsx     ★ motor de regras (escala, plantão, feriados, banco de horas)
│   ├── buildScheduleSnapshot  visão diária por setor + alertas + sugestões
│   ├── useAppData / useAppMutations   leitura e gravação via React Query
│   ├── labels.tsx             textos em português
│   ├── db.tsx / schema.tsx    conexão e tipos do banco (gerados pelo Floot)
│   └── toast.tsx, themeMode.tsx       avisos e tema claro/escuro (kit Floot)
├── endpoints/                 API (uma rota por arquivo: *_GET.ts / *_POST.ts + .schema.ts)
│   ├── data_GET               devolve todos os dados de uma vez
│   ├── team/ technician/ absence/ settings/ pattern/
│   ├── oncall/                plantões (salvar, excluir, gravar rodízio)
│   └── holiday/               feriados (salvar, excluir, importar nacionais)
├── components/
│   ├── AppShell, DayCell, DateField, PageHeader   componentes do sistema
│   └── Button, Select, Dialog, ...                kit de interface padrão do Floot
├── pages/                     telas (ver tabela acima)
└── docs/                      arquitetura e diretrizes visuais
```

## Regras implementadas

- **Escala-base:** 6x1 = segunda a sábado (sábado até 12h), folga no domingo. 5x2 = segunda a sexta, folga sábado e domingo.
  Em cada data vale a escala do setor com a data de início mais recente (`patternForDate`).
- **Plantão de fim de semana:** 1 dupla por setor; sábado 14h–18h, domingo 08h–12h e 14h–18h (12h).
  Rodízio justo: quem fez menos plantões entra primeiro, sem fins de semana seguidos (`generateOnCall`).
- **Compensação do plantão:** 6x1 → sexta + sábado seguintes; 5x2 → quinta + sexta seguintes.
  Se cair em feriado, passa para o próximo dia útil (`defaultCompDates`).
- **Feriados:** folga geral, coberta pela dupla de plantão; quem trabalha folga no próximo dia útil (`holidayCompDate`).
  Importação automática dos nacionais com Páscoa calculada (`brazilNationalHolidays`).
- **Banco de horas:** crédito = horas de plantão; débito = horas dos dias de folga que seriam trabalhados (`computeHourBank`).
- **Gerador de escala com rodízio de folgas** (modo alternativo): busca a melhor distribuição semanal respeitando
  cobertura mínima por dia e limite de dias seguidos (`generatePattern`).

## Dependências

React 19, React Router, @tanstack/react-query, Radix UI, lucide-react, react-day-picker, zod, superjson,
kysely + postgres (banco). Todas são fornecidas pelo Floot.
