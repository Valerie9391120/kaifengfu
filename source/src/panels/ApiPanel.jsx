import { useEffect, useState } from "react";
import { modelLabel, money, usageKey } from "../models.js";
import { RECALL, DEFAULT_RECALL } from "../recap.js";
import { VOICE_STAB, DEFAULT_STAB } from "../voice.js";
import { PAUSES, pauseOf } from "../call/listen.js";
import { fmtChars } from "../util.js";
import { sepLabel } from "../days.js";
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

// 抄提要眼下怎么样（10 月 30 日添的，见开发说明“抄提要的流水账”那节）：
// 眼前这段对话抄到哪儿了、攒了多厚；最近几回试的结果（没成的写为什么）；上回没成的话几点以后再试；“现在抄一趟”。
// chat 眼前这段对话的编号；gauge 见 recap.js 的 gauge；retry 几点以后再试（0 是不用等）；log 流水账；
// trying 她点的那一趟（{ t0 } 正在抄，{ done, ok, text } 有结果了）；onNow 点“现在抄一趟”
const secs = (ms) => `${Math.max(1, Math.round(ms / 1000))} 秒`;
const kChars = (n) => fmtChars(n < 10000 ? Math.round(n / 100) * 100 : n);
function RecapCheck({ chat, gauge, retry, log, trying, onNow }) {
  const [, tick] = useState(0);
  const busy = !!(trying && !trying.done);
  // 正在抄的时候一秒一跳，写着等了多久
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const now = new Date();
  const g = gauge || { n: 0, recap: null, body: 0, trigger: 0, due: false };
  let state;
  if (!g.n) state = "这段对话还空着。";
  else {
    const head = g.recap
      ? `这段对话一共 ${g.n} 条，提要抄到${g.recap.ts ? sepLabel(g.recap.ts, now) : "某一条"}，${g.recap.parts.length} 段${g.recap.more ? "，还没抄完" : ""}。提要之后、`
      : `这段对话一共 ${g.n} 条，还没抄过提要。`;
    state = `${head}最后二三十条以前的原话攒了 ${kChars(g.body)}，攒到 ${kChars(g.trigger)}就抄${g.due ? "：够了，该抄了。" : "。"}`;
  }
  const recent = (log || []).slice(0, 3);
  const line = (x) =>
    `${sepLabel(x.at, now)}${x.manual ? "（你点的）" : ""}，${modelLabel(x.model)}，等了 ${secs(x.ms)}：${x.ok ? "抄成了" : `没抄成，${x.why || "不知道为什么"}`}${x.chat !== chat ? "（另一段对话）" : ""}`;
  return (
    <div className="kfs-recap-check" data-retry={retry || 0} style={{ ...glass(0.45, 14), borderRadius: 18, padding: "12px 14px", marginTop: 10 }}>
      <p className="kfs-recap-state" style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.65 }}>
        {state}
      </p>
      <div style={{ fontSize: 12, color: T.inkSoft, margin: "10px 0 4px" }}>最近几回抄提要</div>
      {recent.length ? (
        recent.map((x, i) => (
          <p key={i} className="kfs-recap-log" data-ok={x.ok ? "yes" : "no"} style={{ fontSize: 11.5, color: x.ok ? T.inkSoft : T.red, lineHeight: 1.6, marginTop: i ? 4 : 0 }}>
            {line(x)}
          </p>
        ))
      ) : (
        <p className="kfs-recap-log-none" style={{ fontSize: 11.5, color: T.inkFaint, lineHeight: 1.6 }}>
          这台手机上还没试过。
        </p>
      )}
      {retry > 0 && (
        <p className="kfs-recap-retry" style={{ fontSize: 11.5, color: T.inkFaint, lineHeight: 1.6, marginTop: 6 }}>
          这段对话上回没抄成，{sepLabel(retry, now)} 以后他回完话再自己试。等不及就点下面。
        </p>
      )}
      <div className="flex items-center flex-wrap" style={{ gap: 10, marginTop: 10 }}>
        <button onClick={onNow} disabled={busy || !g.n} className="kfs-tap kfs-recap-now" style={{ ...chip, opacity: busy || !g.n ? 0.5 : 1 }}>
          {busy ? "正在抄…" : "现在抄一趟"}
        </button>
        {busy && (
          <span className="kfs-recap-now-note" style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
            等了 {secs(Date.now() - trying.t0)}，别切走
          </span>
        )}
        {trying && trying.done && (
          <span className="kfs-recap-now-note" data-ok={trying.ok ? "yes" : "no"} style={{ fontSize: 12.5, color: trying.ok ? T.inkSoft : T.red, lineHeight: 1.5 }}>
            {trying.text}
          </span>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 8, lineHeight: 1.6 }}>
        照眼前这段对话抄一趟，不等他回完话。抄的时候别切走、别锁屏，切走这一趟就断了。抄一趟比他平常回一句贵几倍。
      </p>
    </div>
  );
}

// 三选一的那种滑块（“回复最长多少”“他记多长”都是它；账户面板里“他自己醒”的两道闸也借它，见 FoxSection.jsx）
export function Pick({ options, value, onPick, label }) {
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
            color: value === o.v ? T.onDai : T.inkSoft,
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
// recapCheck：抄提要眼下怎么样那一块（见上面 RecapCheck），没给就不摆
export function ApiPanel({ settings, onChange, onTest, testNote, testing, usage, monthUsage, recapUsage, fit, recapCheck, voiceCheck, onVoiceTest, voiceTestNote, voiceTesting, onEchoProbe }) {
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
      {recapCheck && <RecapCheck {...recapCheck} />}

      <div style={{ fontSize: 12, color: T.inkSoft, margin: "22px 0 8px" }}>语音条</div>
      <div className="kfs-voice-set" data-on={settings.voice ? "yes" : "no"} style={{ ...glass(0.45, 14), borderRadius: 18, padding: "12px 14px" }}>
        <div className="flex items-center justify-between" style={{ gap: 12 }}>
          <span style={{ fontSize: 14, color: T.ink }}>他能发语音</span>
          <Toggle on={!!settings.voice} onChange={(v) => onChange({ voice: v })} label="他能发语音" />
        </div>
        <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
          开着的时候，他想说的话可以发成一条语音，用 ElevenLabs 里他的声音念。念一条扣一回 ElevenLabs 的额度；你不在开封府的时候不念，回来点开才念。
        </p>
        <p className="kfs-voice-check" data-state={voiceCheck ? voiceCheck.state : "checking"} style={{ fontSize: 11.5, color: voiceCheck && voiceCheck.state !== "ok" ? T.red : T.inkSoft, marginTop: 6, lineHeight: 1.6 }}>
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

      {/* 他能打电话（她 10 月 14 日 17:35 定的，默认开着，见 call/incoming.js）：开着才教他打电话的记号 */}
      <div className="flex items-center justify-between" style={{ gap: 12, marginTop: 22 }}>
        <span style={{ fontSize: 14, color: T.ink }}>他能打电话</span>
        <Toggle on={settings.callable !== false} onChange={(v) => onChange({ callable: v })} label="他能打电话" />
      </div>
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
        开着的时候，他想给你打电话就打：你在开封府里，弹出他的来电；不在，手机上来一条来电通知。一分钟没接算没接，他会知道。他说的话用他的声音念，扣 ElevenLabs 的额度。
      </p>

      {/* 打电话（见 call/ 和开发说明“通话”那一节）：她停多久算说完。卿卿说“老公你决定就好”，默认 1.6 秒，能调 */}
      <div style={{ fontSize: 12, color: T.inkSoft, margin: "22px 0 8px" }}>打电话：停多久算你说完</div>
      <div className="kfs-call-pause">
        <Pick options={PAUSES.map((v) => ({ v, t: `${v / 1000} 秒` }))} value={pauseOf(settings.callPause)} onPick={(v) => onChange({ callPause: v })} label="停多久算你说完" />
      </div>
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
        打电话的时候，你停这么久就当你说完了，自动发出去。老被半路截断就调长，嫌等得久就调短。他说的每一句都用他的声音念，扣 ElevenLabs 的额度，跟语音条一样。
      </p>
      {/* 量一量回声（打断他用，她 10 月 14 日 17:26 定的“得先量回声”，见 call/echo.js） */}
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 10, lineHeight: 1.6 }}>
        打电话的时候打断他用：量一量他说话的声音有多少漏进麦克风。照着屏幕上说的做，量完截个图给我。头一回量要念一句话，扣一点 ElevenLabs 的额度。
      </p>
      <button onClick={onEchoProbe} className="kfs-tap kfs-echo-open" style={{ ...chip, marginTop: 8 }}>
        量一量回声
      </button>

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
        {(() => {
          // 这次打开还没抄过的：照流水账里最近一回花了钱的写（流水账记在这台手机上，重开了也在）
          const last = recapUsage || ((recapCheck && recapCheck.log) || []).find((x) => x.cost != null) || null;
          return last ? row("上一回抄提要", `约 ${money(last.cost)}，${modelLabel(last.model)}`) : null;
        })()}
      </div>
      {noCache && (
        <p className="kfs-no-cache" style={{ fontSize: 11.5, color: T.red, marginTop: 6, lineHeight: 1.6 }}>
          上一条没走缓存，是按原价算的。偶尔一回不要紧；回回都这样的话，截个图给我。
        </p>
      )}
      <p style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.6 }}>
        单位是 token，钱是照官方价格估的，以 Anthropic 后台的账单为准。从缓存读的部分只收原价的一成甚至更少，所以聊得越连贯越省。
      </p>
    </div>
  );
}
