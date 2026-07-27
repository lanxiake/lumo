/**
 * axios-stub — 打包期替换 axios 的空桩（msedge-tts 依赖）
 *
 * msedge-tts 只在 getVoices()（拉取音色列表）用 axios.get；语音合成走 ws WebSocket，
 * 完全不碰 axios。而 axios 的 fetch adapter 含 `new ReadableStream(...)`（Node20+ 全局），
 * 在 nodejs-mobile 的 Node18 上是隐患（虽属函数体内死代码，但 undici File 的教训表明
 * 不该把不可达的 Node20+ API 留进 bundle）。
 *
 * 移动端 kids-mobile 不调 getVoices（音色写死 zh-CN-XiaoxiaoNeural），故整条 axios
 * 桩为惰性抛错：require 顶层不抛（msedge-tts 顶层 require 得到对象），只有真正调用
 * .get/.post 等时才抛错——零功能损失，且彻底把 axios(含 ReadableStream 死代码)挡在 bundle 外。
 *
 * 若将来需要动态 getVoices，解除此 alias 并改用 ws 或原生 fetch 重写取列表逻辑。
 */

function unsupported() {
  throw new Error(
    "[kids-mobile] axios 在移动端已 stub（仅 msedge-tts getVoices 用到，本端不调用）。",
  );
}

const handler = {
  get(_target, prop) {
    // 允许属性读取返回可调用桩（axios.get / axios.create().get 等），
    // 调用时才抛错，避免 msedge-tts 顶层 require 阶段就崩。
    if (prop === "create") return () => axiosStub;
    return unsupported;
  },
};

const axiosStub = new Proxy(function () {}, handler);

export default axiosStub;
