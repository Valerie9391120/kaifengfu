import { modelLabel, money, usageKey } from "../models.js";
import { T, glass, chip } from "../ui/style.js";

export function ApiPanel({ settings, onChange, onTest, testNote, testing, usage, monthUsage }) {
  const lengths = [
    { v: 1024, t: "短" },
    { v: 2048, t: "适中" },
    { v: 4096, t: "长" },
  ];
  const cur = settings.maxTokens || 2048;
  const row = (k, v) => (
    <div key={k} className="flex items-center justify-between" style={{ fontSize: 13, color: T.ink, padding: "5px 0", gap: 12 }}>
      <span style={{ color: T.inkSoft, flexShrink: 0 }}>{k}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{v}</span>
    </div>
  );
  const month = monthUsage && monthUsage.month === usageKey() ? monthUsage : null;
  return (
    <div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6, marginBottom: 14 }}>
        你的 key 锁在 Supabase 的保险柜里，手机上没有。开封府每次说话，都是先在门口核对是你，再替你转给 Anthropic。
      </p>
      <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
        <button onClick={onTest} disabled={testing} className="kfs-tap" style={{ ...chip, opacity: testing ? 0.5 : 1 }}>
          {testing ? "正在测试…" : "测试连接"}
        </button>
        {testNote && <span style={{ fontSize: 12.5, color: T.inkSoft }}>{testNote}</span>}
      </div>

      <div style={{ fontSize: 12, color: T.inkSoft, margin: "22px 0 8px" }}>回复最长多少</div>
      <div className="flex" style={{ ...glass(0.4, 12), borderRadius: 999, padding: 4 }}>
        {lengths.map((l) => (
          <button
            key={l.v}
            onClick={() => onChange({ maxTokens: l.v })}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 999,
              fontSize: 13.5,
              color: cur === l.v ? "#fff" : T.inkSoft,
              background: cur === l.v ? T.daiGrad : "transparent",
              transition: "background .2s ease",
            }}
          >
            {l.t}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>只是上限，平时聊天用不满。写长信、讲故事时可以调长。</p>

      <div style={{ fontSize: 12, color: T.inkSoft, margin: "22px 0 8px" }}>用量</div>
      <div style={{ ...glass(0.45, 14), borderRadius: 18, padding: "10px 14px" }}>
        {row("本月", month && month.replies ? `约 ${money(month.cost)}，${month.replies} 次` : "还没花钱")}
        {usage
          ? [
              row("上一条", `约 ${money(usage.cost)}，${modelLabel(usage.model)}`),
              row("从缓存读", (usage.cache_read_input_tokens || 0).toLocaleString()),
              row("写进缓存", (usage.cache_creation_input_tokens || 0).toLocaleString()),
              row("新读", (usage.input_tokens || 0).toLocaleString()),
              row("写出", (usage.output_tokens || 0).toLocaleString()),
            ]
          : row("上一条", "这次打开还没说话")}
      </div>
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
        单位是 token，钱是照官方价格估的，以 Anthropic 后台的账单为准。从缓存读的部分只收原价的一成甚至更少，所以聊得越连贯越省。
      </p>
    </div>
  );
}
