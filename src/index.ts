import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const require = createRequire(import.meta.url);
const upstreamPackageJson = require.resolve("obra-superpowers/package.json");
const upstreamRoot = dirname(upstreamPackageJson);
const skillsDir = join(upstreamRoot, "skills");
const bootstrapSkillName = "using-superpowers";

interface SkillInfo {
  name: string;
  path: string;
  content: string;
  description?: string;
}

type TierName = "cheap" | "default" | "heavy";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const thinkingLevels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

interface ModelInfo {
  provider?: string;
  id?: string;
  name?: string;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<ThinkingLevel, unknown | null>>;
}

interface AdapterConfig {
  models?: Partial<Record<TierName, string>>;
  reasoning?: Partial<Record<TierName, string>>;
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end === -1) return {};
  const frontmatter = content.slice(4, end).split("\n");
  const result: { name?: string; description?: string } = {};

  for (const line of frontmatter) {
    const match = line.match(/^(name|description):\s*(.*)$/);
    if (!match) continue;
    const key = match[1] as "name" | "description";
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

function loadSkills(): Map<string, SkillInfo> {
  const skills = new Map<string, SkillInfo>();
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    try {
      const content = readFileSync(skillPath, "utf8");
      const metadata = parseFrontmatter(content);
      const name = metadata.name ?? entry.name;
      skills.set(name, {
        name,
        path: skillPath,
        content,
        description: metadata.description,
      });
    } catch {
      // Ignore malformed/incomplete skill directories; Pi's native skill scanner will report its own warnings.
    }
  }
  return skills;
}

function modelKey(model: ModelInfo | undefined): string | undefined {
  if (!model?.provider || !model.id) return undefined;
  return `${model.provider}/${model.id}`;
}

function modelLabel(model: ModelInfo | undefined): string | undefined {
  const key = modelKey(model);
  if (!key) return undefined;
  return model?.name && model.name !== model.id ? `${key} (${model.name})` : key;
}

function getAvailableModels(modelRegistry: unknown): ModelInfo[] {
  const registry = modelRegistry as { getAvailable?: () => ModelInfo[]; getAll?: () => ModelInfo[] } | undefined;
  const models = registry?.getAvailable?.() ?? registry?.getAll?.() ?? [];
  return models.filter((model) => modelKey(model)).sort((a, b) => (modelKey(a) ?? "").localeCompare(modelKey(b) ?? ""));
}

function readConfigFile(path: string): AdapterConfig {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as AdapterConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function piAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

function loadConfig(cwd: string): AdapterConfig {
  const userConfig = readConfigFile(join(piAgentDir(), "superpowers-adapter.json"));
  const projectConfig = readConfigFile(join(cwd, ".pi", "superpowers-adapter.json"));

  return {
    ...userConfig,
    ...projectConfig,
    models: {
      ...userConfig.models,
      ...projectConfig.models,
    },
  };
}

function getSupportedThinkingLevels(model: ModelInfo | undefined): ThinkingLevel[] {
  if (!model) return [];
  if (model.reasoning === false) return ["off"];
  if (!model.thinkingLevelMap) return [...thinkingLevels];

  const levels = thinkingLevels.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh") return mapped !== undefined;
    return true;
  });

  return levels.length > 0 ? levels : ["off"];
}

function findAvailableModel(models: ModelInfo[], modelId: string | undefined): ModelInfo | undefined {
  if (!modelId) return undefined;
  return models.find((model) => modelKey(model) === modelId);
}

function validThinkingLevel(value: string | undefined): ThinkingLevel | undefined {
  return thinkingLevels.find((level) => level === value);
}

function formatTierMapping(tier: TierName, modelId: string, thinking: ThinkingLevel | undefined): string {
  const upstream = tier === "cheap" ? "haiku/cheap" : tier === "default" ? "sonnet/default" : "opus/heavy";
  const modelArg = thinking && thinking !== "off" ? `${modelId}:${thinking}` : modelId;
  return `  - ${upstream}: \`${modelArg}\``;
}

function createModelGuidance(modelRegistry: unknown, currentModel: ModelInfo | undefined, cwd: string): string {
  const models = getAvailableModels(modelRegistry);
  const activeModelKey = modelKey(currentModel);
  const config = loadConfig(cwd);
  const configuredModels = config.models ?? {};
  const configuredReasoning = config.reasoning ?? {};
  const validTierMappings = (["cheap", "default", "heavy"] as TierName[]).flatMap((tier) => {
    const configuredModelId = configuredModels[tier];
    const configuredThinking = validThinkingLevel(configuredReasoning[tier]);
    const modelForAvailability = configuredModelId ? findAvailableModel(models, configuredModelId) : currentModel;
    const resolvedModelId = configuredModelId ?? activeModelKey;

    if (!resolvedModelId) return [];
    if (configuredModelId && !modelForAvailability) return [];
    if (configuredReasoning[tier] && !configuredThinking) return [];
    if (configuredThinking && !getSupportedThinkingLevels(modelForAvailability).includes(configuredThinking)) return [];
    if (!configuredModelId && !configuredThinking) return [];

    return [formatTierMapping(tier, resolvedModelId, configuredThinking)];
  });

  if (validTierMappings.length === 0) return "";

  return `- Model tier mapping for subagent tools that accept a model string:\n${validTierMappings.join("\n")}\n- Use only these exact model strings for Superpowers tier requests. If a needed tier is not listed, omit the model argument. Never pass \`haiku\`, \`sonnet\`, or \`opus\` as model names.`;
}

function createBootstrap(usingSuperpowers: string, modelGuidance: string): string {
  const modelBlock = modelGuidance ? `\n${modelGuidance}` : "";
  return `<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\nPi notes:\n- Use \`skill\` for Superpowers skills. For Pi-native skills in \`<available_skills>\`, read their SKILL.md.\n- Tool mapping for upstream text: \`Task\` = installed Pi subagent tool if available; \`TodoWrite\` = available task tracker or a concise checklist; \`Read\`/\`Write\`/\`Edit\`/\`Bash\` = Pi tools.${modelBlock}\n- If spawned as a focused subagent, obey SUBAGENT-STOP guidance.\n\nBelow is the full content of your 'superpowers:using-superpowers' skill:\n\n${usingSuperpowers}\n</EXTREMELY_IMPORTANT>`;
}

function getResultText(result: { content?: Array<{ type?: string; text?: string }> }): string {
  return (result.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

export default function superpowersAdapter(pi: ExtensionAPI) {
  let skills = loadSkills();

  pi.on("resources_discover", () => ({
    skillPaths: [skillsDir],
  }));

  pi.on("session_start", () => {
    skills = loadSkills();
  });

  pi.on("before_agent_start", (event, ctx) => {
    const bootstrap = skills.get(bootstrapSkillName);
    if (!bootstrap) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${createBootstrap(bootstrap.content, createModelGuidance(ctx.modelRegistry, ctx.model, ctx.cwd))}`,
    };
  });

  pi.registerTool({
    name: "skill",
    label: "Skill",
    description: "Load the full instructions for an upstream Superpowers skill by name. This tool does not load Pi-native skills from <available_skills>; use read on their listed location instead.",
    promptSnippet: "Load a Superpowers-only skill by name before following that workflow.",
    promptGuidelines: [
      "Use the skill tool before any response or action when a Superpowers skill might apply; it is Superpowers-only and does not load Pi-native skills.",
      "For Pi-native skills listed under <available_skills>, use read on the listed location instead of the skill tool.",
      "After using the skill tool, announce which Superpowers skill you are using and follow its instructions.",
    ],
    parameters: Type.Object({
      name: Type.String({ description: "Superpowers skill name, for example brainstorming or test-driven-development." }),
    }),
    async execute(_toolCallId, params) {
      const name = params.name.trim();
      const found = skills.get(name);
      const availableNames = [...skills.keys()].sort();
      if (!found) {
        const available = [...skills.values()]
          .map((skill) => `- ${skill.name}${skill.description ? `: ${skill.description}` : ""}`)
          .sort()
          .join("\n");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Superpowers skill not found: ${name}\n\nThe skill tool only loads upstream Superpowers skills. If ${name} is a Pi-native skill listed under <available_skills>, use read on its listed <location> instead.\n\nAvailable Superpowers skills:\n${available}`,
            },
          ],
          details: { name, found: false, path: "", description: "", available: availableNames },
        };
      }

      return {
        content: [{ type: "text", text: found.content }],
        details: { name: found.name, found: true, path: found.path, description: found.description ?? "", available: availableNames },
      };
    },
    renderCall(args, theme, context) {
      const name = typeof args?.name === "string" && args.name.trim() ? args.name.trim() : "...";
      let line = theme.fg("customMessageLabel", `${theme.bold("[skill]")} `) + theme.fg("customMessageText", name);
      if (!context.expanded) {
        line += theme.fg("dim", " (tool output toggle to expand)");
      }
      return new Text(line, 0, 0);
    },
    renderResult(result, options, theme, context) {
      const isError = context.isError || result.details?.found === false;
      if (!options.expanded && !isError) {
        return new Text("", 0, 0);
      }
      return new Text(theme.fg(isError ? "error" : "toolOutput", getResultText(result)), 0, 0);
    },
  });

  pi.registerCommand("superpowers", {
    description: "List upstream Superpowers skills loaded by the Pi adapter.",
    handler: async (_args, ctx) => {
      const list = [...skills.values()]
        .map((skill) => `- ${skill.name}${skill.description ? `: ${skill.description}` : ""}`)
        .sort()
        .join("\n");
      ctx.ui.notify(`Superpowers skills loaded from ${skillsDir}:\n${list}`, "info");
    },
  });
}
