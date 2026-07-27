const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// pnpm workspace（monorepo）根，供 metro 监听并解析 workspace 包（@lumo/core 等）
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  // 监听 monorepo 根，使 workspace 包（pet-core）变更能被 metro 感知
  watchFolders: [workspaceRoot],
  resolver: {
    // 先查 app 自身，再回退 monorepo 根 node_modules（pnpm 提升层）
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // pnpm 用 symlink 组织依赖，metro 0.80+ 默认支持，显式开启以防回退
    unstable_enableSymlinks: true,
    unstable_enablePackageExports: true,
    // pet-core 是 ESM（"type":"module"）并全量用 NodeNext 风格 `.js` 后缀 import
    // 指向 TS 源。metro 不做 `.js`→`.ts` 回退（当字面文件名找），故解析失败。
    // 这里拦截：带 `.js` 后缀解析失败时，去掉后缀交给 metro 默认 sourceExts（.ts/.tsx）
    // 重解析。先试原样、失败再降级，真实 .js（vendor）不受影响。零源码侵入。
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName.endsWith('.js')) {
        try {
          return context.resolveRequest(context, moduleName, platform);
        } catch (e) {
          return context.resolveRequest(
            context,
            moduleName.replace(/\.js$/, ''),
            platform,
          );
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
