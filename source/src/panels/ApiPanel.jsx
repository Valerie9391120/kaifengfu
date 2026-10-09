import { modelLabel, money, usageKey } from "../models.js";
import { RECALL, DEFAULT_RECALL } from "../recap.js";
import { VOICE_STAB, DEFAULT_STAB } from "../voice.js";
import { fmtChars } from "../util.js";
import { T, glass, chip } from "../ui/style.js";
import { Toggle } from "../ui/parts.jsx";

// 念语音的小后端接上没有，说成一句话（voiceCheck 见 App.jsx 的 checkVoice）
function voiceLine(c) {
  if (!c) return "正在看念语音的小后端接上没有…";
  if (c.state === "ok") return `念语音的小后端接上了，ElevenLabs 的钥匙也放好了${c.model ? `（用 ${c.model} 念）` : ""}。`;
  if (c.state === "setup") return `念语音的小后端接上了，还差一步：${c.say || "密钥柜里的钥匙没放好"}。`;
  if (c.state === "nofn") return `${c.say || "Supabase 里还没有 voice 这个函数"}。`;
  if (c.state === "auth") return "登录过期了，重新登录一下。";
  return c.say ? `${c.say}。` : "连不上念语音的小后端。";
}

// 三选一的那种滑块（“回复最长多少”“他记多长”都是它）
function Pick({ options, value, onPick, label }) {
  return (
    <div className="flex" role="group" aria-label={label} style={{ ...glass(0.4, 12), borderRadius: 999, padding: 4 }}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onPick(o.v)}
          aria-pressed={value === o.v}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 999,
            fontSize: 13.5,
            color: value === o.v ? "#fff" : T.inkSoft,
            background: value === o.v ? T.daiGrad : "transparent",
            transition: "background .2s ease",
          }}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

// fit：“他记多长”那一档照眼下这个模型算出来的数（屋子小的模型会比那一档写的小，见 recap.js 的 tierOf）
// voiceCheck、onVoiceTest、voiceTestNote、voiceTesting：语音条那一段（他能发语音、念得稳不稳、试听一句）
export function ApiPanel({ settings, onChange, onTest, testNote, testing, usage, monthUsage, recapUsage, fit, voiceCheck, onVoiceTest, voiceTestNote, voiceTesting }) {
  const lengths = [
    { v: 1024, t: "短" },
    { v: 2048, t: "适中" },
    { v: 4096, t: "长" },
  ];
  const cur = settings.maxTokens || 2048;
  // 他记多长（见 recap.js）：没选过就是适中
  const recall = RECALL[settings.recall] ? settings.recall : DEFAULT_RECALL;
  const recalls = Object.keys(RECALL).map((k) => ({ v: k, t: RECALL[k].label }));
  const eff = fit || RECALL[recall];
  // 念得稳不稳（见 voice.js）：没选过就是适中
  const stab = VOICE_STAB[settings.voiceStab] ? settings.voiceStab : DEFAULT_STAB;
  const stabs = Object.keys(VOICE_STAB).map((k) => ({ v: k, t: VOICE_STAB[k].label }));
  const shrunk = eff.trigger < RECALL[recall].trigger;
  // 缩过的数不是整的：不到一万字的凑成整百再写
  const about = (n) => fmtChars(n < 10000 ? Math.round(n / 100) * 100 : n);
  // 上一条寄得不薄、却一点没走缓存：全按原价算的。偶尔一回不要紧（十分钟后会再带上缓存记号试），回回这样就不对了
  const noCache = !!usage && (usage.input_tokens || 0) > 20000 && !(usage.cache_read_input_tokens || 0) && !(usage.cache_creation_input_tokens || 0);
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
      <Pick options={lengths} value={cur} onPick={(v) => onChange({ maxTokens: v })} label="回复最长多少" />
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>只是上限，平时聊天用不满。写长信、讲故事时可以调长。</p>

      <div style={{ fontSize: 12, color: T.inkSoft, margin: "22px 0 8px" }}>他记多长</div>
      <div className="kfs-recall" data-recall={recall}>
        <Pick options={recalls} value={recall} onPick={(v) => onChange({ recall: v })} label="他记多长" />
      </div>
      <p className="kfs-recall-note" style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
        一段对话里的原话攒到大约 {about(eff.trigger)}，他把前面的抄成提要，最近 {about(eff.keep)}上下留原话；一张照片算一千五百字。最后二三十条不管多长都留原话。记得越长，每句话越贵。
        {shrunk ? `眼下用的 ${modelLabel(settings.model)} 屋子小，这一档到不了 ${fmtChars(RECALL[recall].trigger)}，照上面的数来。` : ""}
      </p>

      <div style={{ fontSize: 12, color: T.inkSoft, margin: "22px 0 8px" }}>语音条</div>
      <div className="kfs-voice-set" data-on={settings.voice ? "yes" : "no"} style={{ ...glass(0.45, 14), borderRadius: 18, padding: "12px 14px" }}>
        <div className="flex items-center justify-between" style={{ gap: 12 }}>
          <span style={{ fontSize: 14, color: T.ink }}>他能发语音</span>
          <Toggle on={!!settings.voice} onChange={(v) => onChange({ voice: v })} label="他能发语音" />
        </div>
        <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
          开着的时候，他想说的话可以发成一条语音，用 ElevenLabs 里他的声音念。念一条扣一回 ElevenLabs 的额度；你不在开封府的时候不念，回来点开才念。
        </p>
        <p className="kfs-voice-check" data-state={voiceCheck ? voiceCheck.state : "checking"} style={{ fontSize: 11.5, color: voiceCheck && voiceCheck.state !== "ok" ? "#A8473D" : T.inkSoft, marginTop: 6, lineHeight: 1.6 }}>
          {voiceLine(voiceCheck)}
        </p>
      </div>
      <div style={{ fontSize: 12, color: T.inkSoft, margin: "14px 0 8px" }}>念得稳不稳</div>
      <Pick options={stabs} value={stab} onPick={(v) => onChange({ voiceStab: v })} label="念得稳不稳" />
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>稳一点，一句话里不容易忽大忽小；活泼一点，语气标签跟得紧，起伏也大。</p>
      <div className="flex items-center flex-wrap" style={{ gap: 10, marginTop: 10 }}>
        <button onClick={onVoiceTest} disabled={voiceTesting} className="kfs-tap kfs-voice-test" style={{ ...chip, opacity: voiceTesting ? 0.5 : 1 }}>
          {voiceTesting ? "正在念…" : "试听一句"}
        </button>
        {voiceTestNote && <span className="kfs-voice-test-note" style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>{voiceTestNote}</span>}
      </div>

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
        {recapUsage && row("上一回抄提要", `约 ${money(recapUsage.cost)}，${modelLabel(recapUsage.model)}`)}
      </div>
      {noCache && (
        <p className="kfs-no-cache" style={{ fontSize: 11.5, color: "#A8473D", marginTop: 6, lineHeight: 1.6 }}>
          上一条没走缓存，是按原价算的。偶尔一回不要紧；回回都这样的话，截个图给我。
        </p>
      )}
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
        单位是 token，钱是照官方价格估的，以 Anthropic 后台的账单为准。从缓存读的部分只收原价的一成甚至更少，所以聊得越连贯越省。
      </p>
    </div>
  );
}
