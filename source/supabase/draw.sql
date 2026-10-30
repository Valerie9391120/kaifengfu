-- =====================================================
-- 开封府 · 画画的登记（draw 函数用，10 月 30 日添的）
-- 一个人一行：在 ElevenLabs 登录换来的凭证、开封府在 ElevenLabs 那头的身份、画画用的那一张画布。
-- 这里不存聊天内容，也不存画出来的图（图在网页那头加密了存进库房，跟照片一个路子）。
-- 凭证只有 draw 函数自己碰得到：网页、没登录的、登录了的都读不到这张表（只给 service_role 开门）。
-- 可以放心重复运行：表在就不会重建，里面的登记不会丢。
-- =====================================================

-- 1. 建表
create table if not exists public.draw_link (
  user_id     uuid        not null primary key references auth.users (id) on delete cascade,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint draw_link_data_small check (pg_column_size(data) <= 32000)
);

-- 2. 每一行都上锁（RLS）：不写任何放行的规矩，网页那头的钥匙一律碰不到
alter table public.draw_link enable row level security;

-- 3. 开门：只给 draw 函数自己（service_role）开；没登录的、登录了的都不给
revoke all on table public.draw_link from anon;
revoke all on table public.draw_link from authenticated;
revoke all on table public.draw_link from public;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.draw_link to service_role;

-- 4. 让接口马上认得这张新表（不然要等一会儿）
notify pgrst, 'reload schema';

-- 5. 看到这一行就是建好了
select '画画的登记建好了' as 开封府;
