import type { Event } from "@zcode/rpc";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type { TerminalFontFamilySource, TerminalThemeProfile } from "./terminalProfile.js";

export interface TerminalWindowsPtyInfo {
  backend: "conpty" | "winpty";
  buildNumber?: number;
}

/** 新建终端会话时可选择的 shell（由 listShells 枚举）。 */
export interface TerminalShellOption {
  /** shell 可执行文件路径（PATH 可解析的命令名或绝对路径）。 */
  path: string;
  /** 展示名，如 zsh / bash / PowerShell / Git Bash。 */
  name: string;
}

export interface ITerminalService {
  create(params: {
    cols: number;
    rows: number;
    cwd?: string;
    /** 显式指定 shell（来自 listShells）；缺席时依次回退默认终端设置（defaultTerminalShell）→ 环境自动探测。 */
    shell?: string;
  }): Promise<{
    id: string;
    shell: string;
    fontFamily: string;
    fontSize?: number;
    theme?: TerminalThemeProfile;
    fontFamilySource: TerminalFontFamilySource;
    windowsPty?: TerminalWindowsPtyInfo;
  }>;
  write(params: { id: string; data: string }): Promise<void>;
  resize(params: { id: string; cols: number; rows: number }): Promise<void>;
  dispose(params: { id: string }): Promise<void>;
  /**
   * 读取会话 shell 进程的当前工作目录，用于「新建会话继承上一会话目录」。
   * Linux 读 /proc/<pid>/cwd，macOS 经 lsof 解析；Windows 暂不支持，返回 null。
   */
  getSessionCwd(params: { id: string }): Promise<string | null>;
  /** 枚举本机可用的终端 shell 供新建会话选择。 */
  listShells(): Promise<TerminalShellOption[]>;
  onDynamicData(id: string): Event<string>;
  onDynamicExit(id: string): Event<number>;
}

export const ITerminalService = createServiceDescriptor<ITerminalService>(ServiceChannels.Terminal);
