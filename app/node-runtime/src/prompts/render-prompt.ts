/**
 * render-prompt — 提示词模板渲染
 *
 * 模板使用 {{key}} 占位符；未提供值时保留占位符文本（便于排查）。
 */

export interface PromptTemplateVars {
  readonly petIdentity: string;
  readonly childSection: string;
  readonly recentSummary: string;
  readonly language: string;
  readonly platform: string;
  readonly currentTime: string;
}

export function renderPromptTemplate(
  template: string,
  vars: Partial<PromptTemplateVars>,
): string {
  return template
    .replace(/{{\s*petIdentity\s*}}/g, vars.petIdentity ?? "{{petIdentity}}")
    .replace(/{{\s*childSection\s*}}/g, vars.childSection ?? "{{childSection}}")
    .replace(/{{\s*recentSummary\s*}}/g, vars.recentSummary ?? "{{recentSummary}}")
    .replace(/{{\s*language\s*}}/g, vars.language ?? "zh-CN")
    .replace(/{{\s*platform\s*}}/g, vars.platform ?? "kids-mobile")
    .replace(/{{\s*currentTime\s*}}/g, vars.currentTime ?? new Date().toISOString())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
