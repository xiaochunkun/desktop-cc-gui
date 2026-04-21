# Codex Unified Exec Override Contract

## 适用范围

- `src-tauri/src/types.rs`
- `src-tauri/src/shared/settings_core.rs`
- `src-tauri/src/codex/config.rs`
- `src-tauri/src/codex/args.rs`
- `src-tauri/src/settings/mod.rs`
- `src/services/tauri.ts`
- `src/features/settings/hooks/useAppSettings.ts`
- `src/features/settings/components/SettingsView.tsx`

## 核心原则

`unified_exec` 是 official runtime capability，不是 desktop-local bool flag。

- 桌面端自己的 source of truth 是 `AppSettings.codexUnifiedExecPolicy`
- 官方 `~/.codex/config.toml` 只允许被显式 official config action lane 修改
- 普通 settings save / restore 不得再改写 global config

## Settings Contract

### Rust / TS settings 字段

- 新字段：`codexUnifiedExecPolicy`
- 可选值：
  - `inherit`
  - `forceEnabled`
  - `forceDisabled`

### Legacy migration

- legacy 字段 `experimentalUnifiedExecEnabled` 只用于兼容旧 settings 输入
- 迁移规则：
  - `true` -> `forceEnabled`
  - `false` 或缺失 -> `inherit`
- 迁移完成后不得再把 legacy 字段写回 settings.json / frontend payload

## Runtime Contract

### Inherit

- `inherit` 模式不得注入 `features.unified_exec` runtime override
- Codex 最终行为交给：
  - external/global config 中的显式值
  - official platform default

### Explicit override

- `forceEnabled` / `forceDisabled` 必须通过 launch-scoped runtime override 生效
- 当前实现位置：`resolve_workspace_codex_args()` -> `-c features.unified_exec=<bool>`
- 如果用户自定义 `codexArgs` 已经带了 `features.unified_exec=...`，桌面端显式 policy 必须先移除旧值再注入新值

## Global Config Contract

### Allowed reads

- 允许检测 external `config.toml` 中是否存在显式 `unified_exec`
- 允许读取显式值 `true / false / invalid`

### Forbidden writes

- 禁止在以下路径中写 global config：
  - `get_app_settings`
  - `update_app_settings`
  - settings rollback / restore
  - 普通 settings save

### Allowed writes

- 允许的 global config mutation 仅包括：
  - 显式写入 `[features].unified_exec = true`
  - 显式写入 `[features].unified_exec = false`
  - 显式删除 `[features].unified_exec` 以恢复官方默认
- 所有 mutation 都必须来自 settings UI 中的独立 official config action lane
- selector / 普通 settings save / restore 不得承担这些 mutation

## Frontend Contract

### Settings UI

- “后台终端”必须是 tri-state selector，不是 bool toggle
- UI 必须显示 official default 的平台说明
- UI 必须额外显示 official config 当前状态与显式 action buttons
- repair CTA 仅在下面条件同时满足时出现：
  - `codexUnifiedExecPolicy === "inherit"`
  - external status 返回 `hasExplicitUnifiedExec === true`

### Command bridge

- 新 command:
  - `get_codex_unified_exec_external_status`
  - `restore_codex_unified_exec_official_default`
  - `set_codex_unified_exec_official_override`
- payload:
  - `configPath: string | null`
  - `hasExplicitUnifiedExec: boolean`
  - `explicitUnifiedExecValue: boolean | null`
  - `officialDefaultEnabled: boolean`

## 验证矩阵

- Rust:
  - legacy migration
  - 普通 settings save 不写 global config
  - external status / repair helper
  - explicit global config write helper
  - runtime arg override 替换已有 `features.unified_exec`
- Frontend:
  - hook 归一化 legacy bool -> tri-state
  - vendor settings 渲染 tri-state + official default + official config actions
  - explicit official config action 在 `inherit` 模式下会触发 runtime reload
  - restore flow 只有确认后才调用 global config mutation command

## 变更触发器

下次只要改到以下任一项，就必须重新审视本 contract：

- `AppSettings` 字段结构
- `src/services/tauri.ts` settings 相关 command
- `resolve_workspace_codex_args()` 行为
- experimental settings UI
- global Codex config repair 流程
