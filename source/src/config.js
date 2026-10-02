// 开封府连到哪里。这两样本来就是公开的，放在网页里没关系。
// 测试时打包工具会换成本地的假服务器。
/* global __KFS_SUPABASE_URL__, __KFS_SUPABASE_KEY__ */
export const SUPABASE_URL =
  typeof __KFS_SUPABASE_URL__ !== "undefined" ? __KFS_SUPABASE_URL__ : "https://hrfjammapxnzmtlafykq.supabase.co";
export const SUPABASE_KEY =
  typeof __KFS_SUPABASE_KEY__ !== "undefined" ? __KFS_SUPABASE_KEY__ : "sb_publishable_SGVA4WEsdL2hQz7fjissdQ_4TYuVJNa";
export const FUNCTION_URL = SUPABASE_URL + "/functions/v1/claude";
export const PUSH_URL = SUPABASE_URL + "/functions/v1/push";
