import { memeSrc } from "../memes.js";
import { SERIF, T } from "./style.js";

// ---------- 头像 ----------
export const HER_PRESETS = [
  { label: "白兔", file: "bunny_couple_hate_you.jpg" },
  { label: "小老鼠", file: "mouse_caught.jpg" },
  { label: "吃东西鼠", file: "mouse_eating.jpg" },
  { label: "坏猫", file: "cat_angry_face.jpg" },
];
// 光义的头像由光义自己定：先用读书狐，之后他在回复里写 [AVATAR:文件名] 自己换
export const HIS_DEFAULT = { type: "meme", file: "fox_reading_book.jpg" };

function avatarSrc(av) {
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
        border: "1.5px solid rgba(255,255,255,0.9)",
        boxShadow: "0 3px 10px rgba(var(--k-shade),0.18)",
      }}
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontFamily: SERIF, color: "#fff", fontSize: size * 0.42 }}>
          {who === "her" ? "卿" : "炅"}
        </span>
      )}
    </div>
  );
}
