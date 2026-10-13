-- Knowledge Base: run once in Supabase → SQL Editor → New query → Run
create table if not exists public.kb_articles (
  id          bigint generated always as identity primary key,
  title       text not null,
  category    text not null default 'General',
  tags        text[] not null default '{}',
  content     text not null default '',   -- sanitised HTML (pictures embedded as compressed data: images)
  body_text   text not null default '',   -- plain text copy, used for search and snippets
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.kb_articles enable row level security;

drop policy if exists "kb read" on public.kb_articles;
create policy "kb read" on public.kb_articles for select to anon using (true);
drop policy if exists "kb add" on public.kb_articles;
create policy "kb add" on public.kb_articles for insert to anon with check (true);
drop policy if exists "kb edit" on public.kb_articles;
create policy "kb edit" on public.kb_articles for update to anon using (true) with check (true);
drop policy if exists "kb delete" on public.kb_articles;
create policy "kb delete" on public.kb_articles for delete to anon using (true);

grant select, insert, update, delete on public.kb_articles to anon;
grant usage on all sequences in schema public to anon;
