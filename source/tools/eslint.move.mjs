// 搬家检查用的 eslint 配置：只查“用了没引”这一样，别的一概不管。
// 两条规矩缺一不可：no-undef 管平常的名字（T、pad 这种），react/jsx-no-undef 管尖括号里的组件名（<Icon />）。
// 尖括号里的名字 eslint 自己不当“用了”，只开头一条的话，漏引的组件一个都查不出来。
import react from "eslint-plugin-react";
import globals from "globals";

export default [
  {
    files: ["src/**/*.js", "src/**/*.jsx"],
    ignores: ["src/sw.js"], // 服务工作线程是另一个环境，全局不一样，这回也不搬它
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react },
    rules: { "no-undef": "error", "react/jsx-no-undef": "error" },
  },
];
