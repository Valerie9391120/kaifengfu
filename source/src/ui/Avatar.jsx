import { memeSrc } from "../memes.js";
import { SERIF, T, HAIRLINE } from "./style.js";

// ---------- 头像 ----------
// 光义的头像由光义自己定：先用读书狐，之后他在回复里写 [AVATAR:文件名] 自己换
export const HIS_DEFAULT = { type: "meme", file: "fox_reading_book.jpg" };

export function avatarSrc(av) {
  if (!av) return null;
  if (av.type === "upload") return av.data;
  if (av.type === "meme") return memeSrc(av.file);
  return null;
}

export function Avatar({ av, who, size = 34 }) {
  const src = avatarSrc(av);
  return (
    <div
      className="flex-shrink-0 overflow-hidden flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: who === "her" ? T.rougeSolid : T.daiGrad,
        border: HAIRLINE,
        boxShadow: "0 3px 10px rgba(var(--k-shade),0.18)",
      }}
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontFamily: SERIF, color: T.onDai, fontSize: size * 0.42 }}>
          {who === "her" ? "卿" : "炅"}
        </span>
      )}
    </div>
  );
}
