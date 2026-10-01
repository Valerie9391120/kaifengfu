// =====================================================
// Anthropic 回来的报错翻成人话：出了什么事、去哪儿改
// 认不出来的照原样给，方便查
// =====================================================

export function explainError(status, err) {
  const type = String((err && err.type) || "");
  const msg = String((err && err.message) || "");
  const m = msg.toLowerCase();
  // 新版 Console 建 key 时没选工作区，这种 key 每次都得带上工作区 ID
  if (m.includes("not scoped to a workspace") || m.includes("anthropic-workspace-id")) {
    return "这把 key 没绑定工作区。去 Claude Console 新建一把，建的时候选一个工作区，再换进 Supabase 的密钥柜";
  }
  if (type === "authentication_error" || m.includes("invalid x-api-key") || m.includes("invalid api key")) {
    return "key 不对，或者过期、被停用了。去 Claude Console 新建一把，换进 Supabase 的密钥柜";
  }
  if (m.includes("credit balance")) return "Anthropic 账上的余额不够了，去 Claude Console 的 Billing 充一点";
  if (type === "rate_limit_error" || status === 429) return "说得太快，Anthropic 让歇一会儿，过一分钟再试";
  if (type === "overloaded_error" || status === 529) return "Anthropic 那边这会儿太挤，过一会儿再试";
  if (type === "not_found_error" && m.includes("model")) return "Anthropic 不认这个模型名，换一个模型试试";
  if (type === "permission_error") return "这把 key 没有这个权限（模型或工作区），去 Claude Console 看看 key 的设置";
  return msg || `出错了（${status}）`;
}
