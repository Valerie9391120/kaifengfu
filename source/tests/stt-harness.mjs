// 测试用：假的 ElevenLabs 实时听写（Scribe v2 Realtime 那条 WebSocket，见 src/call/hear.js）。
// 假 Supabase 里的 voice 函数照真的给通行证，交回网页的地址换成这里（ws://127.0.0.1:端口/__stt）。
// 网页连上来，一块一块送她的声音（input_audio_chunk）；测试叫 /__debug/stt-say?text=… 的时候，
// 给眼下连着的那一条回一句“听到一半的字”（partial_transcript）；网页送来 commit: true，回“这一句定了”
// （committed_transcript，字是最后那一句听到一半的）。WebSocket 的握手、拆帧自己写（只认这几样：文字帧、关、ping）。
import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function frame(op, data) {
  const len = data.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | op;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | op;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, data]);
}

function readFrame(buf) {
  if (buf.length < 2) return null;
  const fin = !!(buf[0] & 0x80);
  const op = buf[0] & 0x0f;
  const masked = !!(buf[1] & 0x80);
  let len = buf[1] & 0x7f;
  let at = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    at = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    at = 10;
  }
  let mask = null;
  if (masked) {
    if (buf.length < at + 4) return null;
    mask = buf.subarray(at, at + 4);
    at += 4;
  }
  if (buf.length < at + len) return null;
  const data = Buffer.from(buf.subarray(at, at + len));
  if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
  return { fin, op, data, used: at + len };
}

export function createFakeStt() {
  const state = { conns: [], used: new Set(), next: null };
  const send = (c, obj) => {
    if (c.closed) return;
    try {
      c.socket.write(frame(1, Buffer.from(JSON.stringify(obj))));
    } catch (e) {}
  };
  const close = (c, code = 1000) => {
    if (c.closed) return;
    c.closed = true;
    try {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(code, 0);
      c.socket.write(frame(8, b));
      c.socket.end();
    } catch (e) {}
  };
  function onMessage(c, text) {
    let m = null;
    try {
      m = JSON.parse(text);
    } catch (e) {
      return;
    }
    if (!m || m.message_type !== "input_audio_chunk") return;
    c.chunks += 1;
    c.bytes += Buffer.from(String(m.audio_base_64 || ""), "base64").length;
    if (m.commit) {
      c.commits += 1;
      const said = c.partial;
      c.partial = "";
      send(c, { message_type: "committed_transcript", text: said });
    }
  }
  function accept(req, socket) {
    const url = new URL(req.url, "http://x");
    const key = req.headers["sec-websocket-key"];
    if (!key) return socket.destroy();
    socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", "Sec-WebSocket-Accept: " + crypto.createHash("sha1").update(key + GUID).digest("base64"), "", ""].join("\r\n"));
    const params = Object.fromEntries(url.searchParams);
    const c = { socket, params, chunks: 0, bytes: 0, commits: 0, partial: "", closed: false, at: Date.now() };
    state.conns.push(c);
    socket.on("close", () => (c.closed = true));
    socket.on("error", () => (c.closed = true));
    // 通行证：得是假的 voice 函数给的那种、没用过的（真的那边也是用一次就作废）
    const token = params.token || "";
    if (!/^sutkn_test_\d+$/.test(token) || state.used.has(token)) {
      send(c, { message_type: "auth_error", error: "Invalid or expired token" });
      return close(c, 1008);
    }
    state.used.add(token);
    if (state.next === "auth") {
      state.next = null;
      send(c, { message_type: "auth_error", error: "Invalid or expired token" });
      return close(c, 1008);
    }
    send(c, { message_type: "session_started", session_id: "fake-" + state.conns.length, config: { audio_format: params.audio_format, language_code: params.language_code, model_id: params.model_id, sample_rate: 16000 } });
    let buf = Buffer.alloc(0);
    let parts = [];
    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const f = readFrame(buf);
        if (!f) break;
        buf = buf.subarray(f.used);
        if (f.op === 8) return close(c);
        if (f.op === 9) {
          try {
            socket.write(frame(10, f.data));
          } catch (e) {}
          continue;
        }
        if (f.op === 1 || f.op === 0) {
          parts.push(f.data);
          if (f.fin) {
            const text = Buffer.concat(parts).toString("utf8");
            parts = [];
            onMessage(c, text);
          }
        }
      }
    });
  }
  const live = () => {
    for (let i = state.conns.length - 1; i >= 0; i--) if (!state.conns[i].closed) return state.conns[i];
    return null;
  };
  return {
    accept,
    // 她说了这么一句（还没说完的样子）：眼下连着的那一条回一句听到一半的字
    say(text) {
      const c = live();
      if (!c) return false;
      c.partial = text;
      send(c, { message_type: "partial_transcript", text });
      return true;
    },
    // 那边自己断了（kind=close）、下一回连上来通行证不认（kind=auth）
    fail(kind) {
      if (kind === "close") {
        const c = live();
        if (c) close(c, 1011);
        return !!c;
      }
      state.next = kind || null;
      return true;
    },
    reset() {
      state.conns.forEach((c) => close(c));
      state.conns.length = 0;
      state.used.clear();
      state.next = null;
    },
    view() {
      return state.conns.map((c) => ({ params: c.params, chunks: c.chunks, bytes: c.bytes, commits: c.commits, closed: c.closed, partial: c.partial }));
    },
  };
}
