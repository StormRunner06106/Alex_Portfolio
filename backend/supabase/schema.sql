create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null,
  published_at date not null,
  read_time smallint not null check (read_time between 1 and 60),
  tags text[] not null check (cardinality(tags) between 1 and 6),
  accent text not null default 'mint' check (
    accent in ('blue', 'lavender', 'peach', 'yellow', 'mint')
  ),
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists articles_published_at_idx
  on public.articles (published_at desc);

alter table public.articles add column if not exists banner jsonb;
alter table public.articles add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.articles enable row level security;

-- Articles are exposed only through FastAPI. The server-side secret key maps to
-- service_role and bypasses RLS; browser roles receive no table privileges.
revoke all on table public.articles from anon, authenticated;
grant select, insert, update, delete on table public.articles to service_role;

-- Upload records also exist before an article is published. The article's banner
-- and attachments JSON include storage='dropbox' and the Dropbox file ID.
create table if not exists public.article_media (
  upload_id text primary key check (upload_id ~ '^[a-f0-9]{32}$'),
  metadata jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.article_media enable row level security;
revoke all on table public.article_media from anon, authenticated;
grant select, insert, update, delete on table public.article_media to service_role;
