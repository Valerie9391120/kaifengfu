-- =====================================================
-- 开封府 · 信箱
-- 你发完话切走了，push 那个小后端替你等他回完，把回话封好放在这里；
-- 你回到开封府，手机自己来取，取走就删。
-- 封好的回话只有你的设备打得开：这里存的和库房一样，只是乱码。
-- 规则也一样写死：只有登录后的你本人，能读写你自己的那几行。
-- 可以放心重复运行：表在就不会重建，里面的信不会丢。
-- =====================================================

-- 1. 建表
create table if not exists public.mailbox (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  job        text        not null,                    -- 这一回传话的编号（手机起的，随机的）
  state      text        not null default 'working',  -- working 还在等他回；done 回话已经封好放进来了
  note       text        not null,                    -- 手机封好的一张条子：哪段对话、接在哪句后面、开这封信的钥匙。云端看不懂
  sealed     text,                                    -- 封好的回话
  created_at timestamptz not null default now(),
  beat_at    timestamptz not null default now(),      -- 小后端还在等的时候隔几秒来摸一下，手机靠它看这一回还活着没有
  done_at    timestamptz,
  primary key (user_id, job),
  constraint mailbox_job_ok check (job ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint mailbox_state_ok check (state in ('working', 'done')),
  constraint mailbox_note_ok check (length(note) between 1 and 4000),
  constraint mailbox_sealed_ok check (sealed is null or length(sealed) <= 4000000)
);

-- 2. 每一行都认人（RLS）
alter table public.mailbox enable row level security;

drop policy if exists "mailbox_select_own" on public.mailbox;
create policy "mailbox_select_own" on public.mailbox
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "mailbox_insert_own" on public.mailbox;
create policy "mailbox_insert_own" on public.mailbox
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "mailbox_update_own" on public.mailbox;
create policy "mailbox_update_own" on public.mailbox
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "mailbox_delete_own" on public.mailbox;
create policy "mailbox_delete_own" on public.mailbox
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 3. 开门：只给登录后的人开，没登录的什么都碰不到
revoke all on table public.mailbox from anon;
revoke all on table public.mailbox from public;
revoke all on table public.mailbox from authenticated;   -- Supabase 默认把所有权限都给了登录用户（连清空整张表都在内），先全收回，下面只给用得着的四样
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.mailbox to authenticated;

-- 4. 让接口马上认得这张新表（不然要等一会儿）
notify pgrst, 'reload schema';

-- 5. 看到这一行就是建好了
select '信箱建好了' as 开封府;
