-- Run once in the Supabase SQL editor.
create table if not exists publications (
  id                 text primary key,          -- uin_idt_uin from the AMF flux
  company            text not null,
  isin               text,                      -- null when the feed has the 999999999999 placeholder
  lei                text,
  published_at       timestamptz not null,      -- uin_dat_amf
  title              text not null,
  type               text,
  subtype            text,
  type_codes         text[] not null default '{}',
  language           text,
  pdf_url            text,
  cac40              boolean not null default false,
  distribution_count int not null default 0,
  score              int not null default 0,
  score_reasons      jsonb not null default '[]',
  selected           boolean not null default false,
  duplicate_of       text,
  ingested_at        timestamptz not null default now()
);
create index if not exists publications_published_at_idx on publications (published_at desc);
create index if not exists publications_company_idx on publications (company);
create index if not exists publications_subtype_idx on publications (subtype);

create table if not exists briefs (
  id             text primary key,
  publication_id text not null unique references publications(id) on delete cascade,
  status         text not null,                 -- verified | needs_review | unverifiable
  data           jsonb not null,                -- full Brief object (title, body, figures checks...)
  created_at     timestamptz not null default now()
);

-- The app talks to Postgres server-side with the service role key only; keep RLS on, no public policies.
alter table publications enable row level security;
alter table briefs enable row level security;

-- Day / month / year summaries (added with the "Synthèses" feature).
create table if not exists reports (
  id         text primary key,                    -- e.g. day:2026-11-02, month:2026-10, year:2026
  period     text not null,                       -- day | month | year
  key        text not null,
  data       jsonb not null,                      -- full Report object (events, cited sources, figure checks)
  created_at timestamptz not null default now()
);
alter table reports enable row level security;
