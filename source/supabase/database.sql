-- =====================================================
-- 开封府 · 库房
-- 只有一张表：每条记录是一把“钥匙”对应一份内容。
-- 内容在你手机上就已经加密成乱码，这里存的只是乱码。
-- 规则写死：只有登录后的你本人，能读写你自己的记录。
-- =====================================================

-- 1. 建表
create table if not exists public.kv (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,
  value      text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 2. 每一行都认人（RLS）
alter table public.kv enable row level security;

drop policy if exists "kv_select_own" on public.kv;
create policy "kv_select_own" on public.kv
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "kv_insert_own" on public.kv;
create policy "kv_insert_own" on public.kv
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "kv_update_own" on public.kv;
create policy "kv_update_own" on public.kv
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "kv_delete_own" on public.kv;
create policy "kv_delete_own" on public.kv
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 3. 开门：只给登录后的人开，没登录的什么都碰不到
revoke all on table public.kv from anon;
revoke all on table public.kv from public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.kv to authenticated;

-- 4. 每次存东西自动记下时间（同步时用）
create or replace function public.kv_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists kv_touch on public.kv;
create trigger kv_touch
  before insert or update on public.kv
  for each row execute function public.kv_touch();

create index if not exists kv_user_updated_idx on public.kv (user_id, updated_at);

-- 5. 看到这一行就是建好了
select '库房建好了' as 开封府;
