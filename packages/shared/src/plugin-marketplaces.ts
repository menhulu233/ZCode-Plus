export interface DefaultPluginMarketplace {
  id: string;
  source: string;
  name: string;
  description: string;
  pluginCount: number;
  lastUpdated?: string;
}

export const ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID = "zcode-plugins-official";

/** Settings 三类资源发现共用；Bootstrap 单测与官方 definition 的 defaultEnabled 机械对照。 */
export const DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS: ReadonlySet<string> = new Set([
  "browser-use@zcode-plugins-official",
  "image-search@zcode-plugins-official",
  "documents@zcode-plugins-official",
  "pdf@zcode-plugins-official",
  "presentations@zcode-plugins-official",
  "spreadsheets@zcode-plugins-official",
  // node_repl 宿主：不进市场、不对用户露出，也不贡献任何 skill/command/subagent，但必须
  // 始终可用 —— node_repl 的注册门禁是「Browser Use 或 Computer Use 任一启用」，宿主自己
  // 不参与那个判断。Browser Use 默认开着，宿主若默认关就等于它上来就没有宿主。
  "node-repl-host@zcode-plugins-official",
  "skill-creator@zcode-plugins-official",
  "plugin-creator@zcode-plugins-official",
  "zcode-guide@zcode-plugins-official",
  // 电脑控制回退为默认关闭，故 computer-use 不在此名单内。
  // 该集合必须与 official-plugin-definitions.ts 里标了 defaultEnabled 的插件逐一对应，
  // bootstrap 的「Settings 默认启用集合与 CLI 的官方插件声明一致」单测机械对照两者。
]);

export const DEFAULT_PLUGIN_MARKETPLACES: DefaultPluginMarketplace[] = [
  {
    // ZCode 官方唯一市场：本地 seed 分片与 CDN 分片在 Agent storage 内合并。
    // CDN manifest 的 name 必须与该 canonical id 一致。
    id: ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID,
    source: "https://cdn-zcode.z.ai/zcode/official-plugin/marketplace.json",
    name: ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID,
    description: "Official ZCode plugins marketplace: built-in and community plugins for ZCode.",
    pluginCount: 0,
  },
];

// 商店「公开」分段只有一个 ZCode 官方市场 id，内置与 CDN 不再拆分身份。
export const PUBLIC_STORE_MARKETPLACE_IDS = [ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID] as const;

export function isPublicStoreMarketplaceId(id: string): boolean {
  return (PUBLIC_STORE_MARKETPLACE_IDS as readonly string[]).includes(id);
}

export interface BuiltinThirdPartyMarketplace {
  /**
   * Marketplace id，必须满足 marketplace id 规范且不得等于官方市场 id。
   * 必须等于上游仓库 .claude-plugin/marketplace.json 自声明的 `name`：
   * 物化时 addMarketplace 的 expectedId 守卫按「声明 id = manifest name」fail closed，
   * 不一致会抛 Marketplace declaration id mismatch。上游改名即物化失败，属于预期防冒名行为。
   */
  id: string;
  /** GitHub owner/repo，物化时走 git source。 */
  repo: string;
  description: string;
}

/**
 * 出厂内置的第三方市场预设（GitHub 托管的 .claude-plugin/marketplace.json 生态）。
 *
 * 这些预设只进入「声明层」：启动与 overview 读取不联网、不物化；用户显式刷新/安装时才由
 * bootstrap 的 declared 物化路径 clone。用户移除后通过 config suppression 不再复活，
 * 用户 config 的 extraKnownMarketplaces 同 id 声明优先于本表。预设 ≠ 官方分发渠道，
 * 商店展示在个人来源分段，不冒充官方。
 */
export const BUILTIN_THIRD_PARTY_MARKETPLACES: readonly BuiltinThirdPartyMarketplace[] = [
  {
    id: "claude-code-workflows",
    repo: "wshobson/agents",
    description:
      "Community agent and command collections for Claude Code, Codex, Cursor and OpenCode.",
  },
  {
    id: "claude-community",
    repo: "anthropics/claude-plugins-community",
    description:
      "Community plugin marketplace for Claude Cowork and Claude Code (read-only mirror).",
  },
  {
    id: "skills-curated",
    repo: "trailofbits/skills-curated",
    description: "Curated, community-vetted Claude Code plugin marketplace from Trail of Bits.",
  },
  {
    id: "cc-marketplace",
    repo: "ananddtyagi/cc-marketplace",
    description: "Community marketplace for Claude Code plugins.",
  },
  {
    id: "claude-code-hooks",
    repo: "karanb192/claude-code-hooks",
    description: "Claude Code hooks marketplace: safety, cost and observability.",
  },
  {
    id: "gptaku-plugins",
    repo: "fivetaku/gptaku_plugins",
    description: "AI-native Claude Code plugin marketplace.",
  },
  {
    id: "n-skills",
    repo: "numman-ali/n-skills",
    description: "Curated plugin marketplace for AI agents (Claude Code, Codex, openskills).",
  },
  {
    id: "power-bi-agentic-development",
    repo: "data-goblin/power-bi-agentic-development",
    description: "Power BI AI skills and agents for Claude Code and GitHub Copilot.",
  },
];

const BUILTIN_THIRD_PARTY_MARKETPLACE_IDS: ReadonlySet<string> = new Set(
  BUILTIN_THIRD_PARTY_MARKETPLACES.map((marketplace) => marketplace.id),
);

export function isBuiltinThirdPartyMarketplaceId(id: string): boolean {
  return BUILTIN_THIRD_PARTY_MARKETPLACE_IDS.has(id);
}
