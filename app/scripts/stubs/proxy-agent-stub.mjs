/**
 * proxy-agent-stub — 打包期替换 proxy-agent / pac-proxy-agent 的空桩
 *
 * 根因续（见 quickjs-stub.mjs）：仅 stub QuickJS 后，pac-proxy-agent 的 loadResolver
 * 仍在宿主启动后立即触发，且其依赖链(degenerator 的 vm 执行 / undici 代理)在
 * nodejs-mobile 的 Node 18 上仍 SIGSEGV。移动端用 RN 网络栈 + gateway fetch，
 * 完全不需要任何 proxy-agent / PAC 自动配置，故把整条代理 agent 链桩为惰性抛错。
 *
 * ProxyAgent / PacProxyAgent 被构造时抛错——移动端代码路径不构造它们
 * (streamFn 走 gateway fetch)，零功能损失；若意外构造，明确报错而非 native 崩溃。
 */

function unsupported() {
  throw new Error(
    "[kids-mobile] proxy-agent/PAC 在移动端不支持（已 stub）。移动端用 RN 网络栈，不使用系统代理。",
  );
}

export class ProxyAgent {
  constructor() {
    unsupported();
  }
}
export class PacProxyAgent {
  constructor() {
    unsupported();
  }
}
export class HttpProxyAgent {
  constructor() {
    unsupported();
  }
}
export class HttpsProxyAgent {
  constructor() {
    unsupported();
  }
}
export function createPacResolver() {
  return unsupported();
}

export default { ProxyAgent, PacProxyAgent, HttpProxyAgent, HttpsProxyAgent };
