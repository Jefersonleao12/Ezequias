-- Estrutura do banco (PostgreSQL) do sistema Escala Técnica.
-- Datas de escala ficam como texto 'YYYY-MM-DD' para não sofrer com fuso horário.

CREATE TYPE sector AS ENUM ('suporte', 'infraestrutura');
CREATE TYPE scale_type AS ENUM ('6x1', '5x2');
CREATE TYPE absence_kind AS ENUM ('ferias', 'atestado', 'folga_extra', 'treinamento', 'outro');
CREATE TYPE holiday_kind AS ENUM ('nacional', 'estadual', 'municipal', 'ponto_facultativo');

-- Duplas (equipes) de cada setor
CREATE TABLE teams (
  id serial PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL,
  sector sector NOT NULL,
  vehicle text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Técnicos (no máximo 2 por equipe — validado no endpoint technician/save)
CREATE TABLE technicians (
  id serial PRIMARY KEY,
  name text NOT NULL,
  phone text,
  role text,
  team_id integer REFERENCES teams(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX technicians_team_idx ON technicians(team_id);

-- Férias, atestados, folgas extras, treinamentos
CREATE TABLE absences (
  id serial PRIMARY KEY,
  technician_id integer NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  start_date text NOT NULL CHECK (start_date ~ '^\d{4}-\d{2}-\d{2}$'),
  end_date text NOT NULL CHECK (end_date ~ '^\d{4}-\d{2}-\d{2}$'),
  kind absence_kind NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX absences_tech_idx ON absences(technician_id);

-- Parâmetros por setor
CREATE TABLE sector_settings (
  sector sector PRIMARY KEY,
  min_coverage jsonb NOT NULL,                 -- 7 números: mínimo de duplas em campo seg..dom
  max_consecutive integer NOT NULL DEFAULT 6,  -- máximo de dias seguidos de trabalho
  hours_six_one numeric NOT NULL DEFAULT 8,    -- 6x1: horas de seg a sex
  hours_six_one_saturday numeric NOT NULL DEFAULT 4, -- 6x1: sábado meio período
  hours_five_two numeric NOT NULL DEFAULT 8.8,
  shift_start text NOT NULL DEFAULT '08:00',
  shift_end text NOT NULL DEFAULT '17:48',
  on_call_teams integer NOT NULL DEFAULT 1,    -- duplas de plantão por fim de semana
  on_call_saturday text NOT NULL DEFAULT '14:00-18:00',
  on_call_sunday text NOT NULL DEFAULT '08:00-12:00,14:00-18:00'
);

-- Escalas-base (6x1 / 5x2). Em cada data vale a do setor com maior start_date <= data.
CREATE TABLE schedule_patterns (
  id serial PRIMARY KEY,
  sector sector NOT NULL,
  scale_type scale_type NOT NULL,
  name text NOT NULL,
  start_date text NOT NULL CHECK (start_date ~ '^\d{4}-\d{2}-\d{2}$'), -- sempre uma segunda-feira
  cycle_weeks integer NOT NULL CHECK (cycle_weeks > 0),
  days_off jsonb NOT NULL, -- { "<id da equipe>": [ { "day": 0..(7*semanas-1), "kind": "regular"|"compensatoria" } ] }
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Plantões de fim de semana e suas folgas de compensação
CREATE TABLE on_call_shifts (
  id serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  weekend_start text NOT NULL CHECK (weekend_start ~ '^\d{4}-\d{2}-\d{2}$'), -- sábado
  comp_dates jsonb NOT NULL DEFAULT '[]'::jsonb, -- 6x1: sex+sáb seguintes; 5x2: qui+sex seguintes
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, weekend_start)
);
CREATE INDEX on_call_weekend_idx ON on_call_shifts(weekend_start);

-- Feriados (com plantão e folga no próximo dia útil)
CREATE TABLE holidays (
  id serial PRIMARY KEY,
  date text NOT NULL UNIQUE CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  name text NOT NULL,
  kind holiday_kind NOT NULL,
  day_off boolean NOT NULL DEFAULT true,          -- false = ponto facultativo trabalhado
  on_call_team_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  on_call_hours text NOT NULL DEFAULT '08:00-12:00,14:00-18:00',
  comp_date text CHECK (comp_date ~ '^\d{4}-\d{2}-\d{2}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
