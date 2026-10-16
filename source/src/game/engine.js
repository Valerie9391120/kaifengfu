// 江湖棋局的引擎（vendor/jianghu/，她仓库里原样拷来的）单独打成一包：build.mjs 另打 assets/jianghu-<指纹>.js，
// 开封府开门不碰它，头一回要调引擎的时候才取（App.jsx 的 loadEngine）。测试里直接 import 这一个。
export { newGame, roll, gameAction, getGameState, summarizeCollection, summarizeGame, chapterOverview } from "../../vendor/jianghu/engine/game.ts";
export { loadChapter, loadIdentities, loadItems } from "../../vendor/jianghu/engine/content.ts";
export { putState, takeState } from "../../vendor/jianghu/engine/store.ts";
