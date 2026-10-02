-- =====================================================
-- 开封府 · 通知的登记簿
-- 每台开了通知的设备一行：推送服务给这台设备的“门牌号”（endpoint），
-- 和给它加密用的两把公开钥匙（p256dh、auth）。push 那个小后端照着这本簿子发通知。
-- 这里不存聊天内容。规则和库房一样写死：只有登录后的你本人，能读写你自己的那几行。
-- 可以放心重复运行：表在就不会重建，里面的登记不会丢。
-- =====================================================

-- 1. 建表
create table if not exists public.push_subs (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text        not null,
  p256dh      text        not null,
  auth        text        not null,
  page        text        not null default '',   -- 点了通知回到哪（这台设备是从哪个入口装的）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(), -- 这台设备上一次来登记是什么时候
  last_at     timestamptz,                        -- 上一回往这台设备发通知是什么时候
  last_status integer,                            -- 推送服务回的状态码（201 是收下了，0 是没连上）
  last_note   text,                               -- 没发成的话，推送服务说的原因
  primary key (user_id, endpoint),
  constraint push_subs_endpoint_ok check (endpoint ~ '^https://' and length(endpoint) <= 1024),
  constraint push_subs_keys_ok check (length(p256dh) between 80 and 100 and length(auth) between 16 and 40),
  constraint push_subs_page_ok check (length(page) <= 300),
  constraint push_subs_note_ok check (last_note is null or length(last_note) <= 200)
);

-- 2. 每一行都认人（RLS）
alter table public.push_subs enable row level security;

drop policy if exists "push_subs_select_own" on public.push_subs;
create policy "push_subs_select_own" on public.push_subs
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "push_subs_insert_own" on public.push_subs;
create policy "push_subs_insert_own" on public.push_subs
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "push_subs_update_own" on public.push_subs;
create policy "push_subs_update_own" on public.push_subs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "push_subs_delete_own" on public.push_subs;
create policy "push_subs_delete_own" on public.push_subs
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 3. 开门：只给登录后的人开，没登录的什么都碰不到
revoke all on table public.push_subs from anon;
revoke all on table public.push_subs from public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.push_subs to authenticated;

-- 4. 让接口马上认得这张新表（不然要等一会儿）
notify pgrst, 'reload schema';

-- 5. 看到这一行就是建好了
select '通知的登记簿建好了' as 开封府;
