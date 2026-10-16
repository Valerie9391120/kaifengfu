// 藏音匣纸条上的字转成繁体（刻本是繁体，转过去字形才齐，见开发说明“藏音匣”那节）。
// 用 OpenCC 的标准繁体（s2t：纔、喫、裏……跟刻本一路；卿卿在原型上看的就是这一种，点了头）。
// 只拿 s2t 用得着的那几本词典（OpenCC 的 cn2t 那一包把转台湾、香港、日本的词典也带着，两兆多）；
// 还是有一兆上下（词组那本最大），build.mjs 另打成 assets/s2t-<指纹>.js：藏音匣里有还没转过的那几条，点开的时候才取。
// 词典是 OpenCC 的（Apache-2.0），转换的代码是 opencc-js（MIT），打包时注释留在包的末尾
import { ConverterFactory } from "opencc-js/core";
import CJKCompat from "opencc-js/dict/CJK_Compatibility_Ideographs";
import STPhrases from "opencc-js/dict/STPhrases";
import STPhrasesRegional from "opencc-js/dict/STPhrases_GeneratedFromRegionalPhrases";
import STCharacters from "opencc-js/dict/STCharacters";

const conv = ConverterFactory([CJKCompat], [STPhrases, STPhrasesRegional, STCharacters]);
export const toTrad = (s) => conv(String(s || ""));
