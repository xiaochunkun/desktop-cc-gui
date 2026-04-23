# Computer Use Bridge Backend Contract

## Scope / Trigger

- 适用文件：
  - `src-tauri/src/computer_use/mod.rs`
  - `src-tauri/src/computer_use/platform/mod.rs`
  - `src-tauri/src/computer_use/platform/macos.rs`
  - `src-tauri/src/computer_use/platform/windows.rs`
  - `src-tauri/src/command_registry.rs`
  - `src-tauri/src/lib.rs`
- 触发条件：
  - 新增或修改 `get_computer_use_bridge_status`
  - 新增或修改 `run_computer_use_activation_probe`
  - 修改 Computer Use availability status / blocked reason / guidance contract
  - 修改 `macOS` / `Windows` 平台分流

## Signatures

### Tauri command

```rust
#[tauri::command]
pub(crate) async fn get_computer_use_bridge_status() -> Result<ComputerUseBridgeStatus, String>
```

### Activation command

```rust
#[tauri::command]
pub(crate) async fn run_computer_use_activation_probe(
    state: State<'_, AppState>,
) -> Result<ComputerUseActivationResult, String>
```

### Host-contract diagnostics command

```rust
#[tauri::command]
pub(crate) async fn run_computer_use_host_contract_diagnostics(
    state: State<'_, AppState>,
) -> Result<ComputerUseHostContractDiagnosticsResult, String>
```

### Core types

```rust
enum ComputerUseAvailabilityStatus {
    Ready,
    Blocked,
    Unavailable,
    Unsupported,
}

enum ComputerUseBlockedReason {
    PlatformUnsupported,
    CodexAppMissing,
    PluginMissing,
    PluginDisabled,
    HelperMissing,
    HelperBridgeUnverified,
    PermissionRequired,
    ApprovalRequired,
    UnknownPrerequisite,
}

enum ComputerUseGuidanceCode {
    UnsupportedPlatform,
    InstallCodexApp,
    InstallOfficialPlugin,
    EnableOfficialPlugin,
    VerifyHelperInstallation,
    VerifyHelperBridge,
    GrantSystemPermissions,
    ReviewAllowedApps,
    InspectOfficialCodexSetup,
}

enum ComputerUseActivationOutcome {
    Verified,
    Blocked,
    Failed,
}

enum ComputerUseActivationFailureKind {
    ActivationDisabled,
    UnsupportedPlatform,
    IneligibleHost,
    HostIncompatible,
    AlreadyRunning,
    RemainingBlockers,
    Timeout,
    LaunchFailed,
    NonZeroExit,
    Unknown,
}

enum ComputerUseHostContractDiagnosticsKind {
    RequiresOfficialParent,
    HandoffUnavailable,
    HandoffVerified,
    ManualPermissionRequired,
    Unknown,
}

struct ComputerUseHostContractEvidence {
    helper_path: Option<String>,
    helper_descriptor_path: Option<String>,
    current_host_path: Option<String>,
    handoff_method: String,
    codesign_summary: Option<String>,
    spctl_summary: Option<String>,
    duration_ms: u64,
    stdout_snippet: Option<String>,
    stderr_snippet: Option<String>,
    official_parent_handoff: ComputerUseOfficialParentHandoffDiscovery,
}

enum ComputerUseOfficialParentHandoffKind {
    HandoffCandidateFound,
    HandoffUnavailable,
    RequiresOfficialParent,
    Unknown,
}

struct ComputerUseOfficialParentHandoffDiscovery {
    kind: ComputerUseOfficialParentHandoffKind,
    methods: Vec<ComputerUseOfficialParentHandoffMethod>,
    evidence: ComputerUseOfficialParentHandoffEvidence,
    duration_ms: u64,
    diagnostic_message: String,
}
```

## Contracts

### Runtime behavior

- command MUST 使用 `spawn_blocking` 执行磁盘探测，不得在 async runtime 上直接跑 bundle/cache/config 读取。
- `get_computer_use_bridge_status` MUST 维持 `status-only`：
  - 允许读取 `~/.codex/config.toml`
  - 允许读取 plugin cache / manifest / `.mcp.json`
  - 允许解析 helper 路径并验证文件存在
  - 禁止调用官方 helper
  - 禁止写回官方 Codex 资产
- `run_computer_use_activation_probe` 是唯一允许执行 bounded helper probe 的入口：
  - MUST 只在显式用户动作后调用
  - MUST single-flight；并发触发返回 `already_running` 或等价结构化结果
  - MUST 有硬超时
  - MUST 支持 `MOSSX_DISABLE_COMPUTER_USE_ACTIVATION=1|true|yes|on` 回退到 `activation_disabled`
  - MUST 对 `~/.codex/plugins/cache/openai-bundled/computer-use/<version>` 下的 CLI plugin helper 走 static launch-contract verification，不得由 mossx direct exec `SkyComputerUseClient`
  - MUST NOT 接入聊天发送、设置保存、MCP 管理等普通主流程
- `run_computer_use_host_contract_diagnostics` 是 `host_incompatible` 后的显式 evidence lane：
  - MUST 与 activation probe 复用同一 single-flight lock，避免并发 helper investigation
  - MUST 支持同一 activation kill switch，关闭后只返回 diagnostics disabled 结果
  - MUST 只读采集 helper path、descriptor path、current host path、handoff method、`codesign` / `spctl` bounded summary
  - MUST 只读扫描 official parent handoff evidence，包括 `Codex.app` / service / helper `Info.plist`、parent coderequirement、application group、MCP descriptor 与 XPC/service declarations
  - MUST NOT direct exec nested `.app/Contents/MacOS/...` helper
  - MUST NOT 写入官方 Codex App、plugin cache、helper bundle、系统权限或 approval 配置

### Status precedence

状态优先级必须固定为：

1. `unsupported`
2. `unavailable`
3. `blocked`
4. `ready`

### Platform contract

- `macOS`：
  - MUST 探测官方 `Codex.app`
  - MUST 优先探测 Codex CLI plugin cache：`~/.codex/plugins/cache/openai-bundled/computer-use/<version>/.mcp.json`
  - MUST 探测 bundled marketplace / plugin manifest / helper descriptor
  - MUST 将 `.mcp.json` 中的 `command` 按 `descriptor dir + cwd` 解析真实 helper 路径
  - MUST 优先读取 `mcpServers["computer-use"]`；当存在多个 server 且缺少该 key 时，MUST 判为 descriptor ambiguous，不得随便取第一个 server
  - MUST 拒绝空 `command`、非数组 `args`、非字符串 arg，避免用损坏 descriptor 拼出错误 launch contract
  - helper present 判定 MUST 使用 `is_file()`，不能把目录存在误判成可执行 helper
  - nested `.app/Contents/MacOS/...` helper 在非官方 Codex parent host 下 MUST 走 diagnostics-only fallback，返回 `host_incompatible`，不得直接 exec 反复触发系统 crash report
  - 例外：当 helper path 位于 Codex CLI plugin cache 时，MUST 将其视为 Codex CLI plugin launch contract，activation 只能静态验证 descriptor/helper/cache evidence，不能 direct exec helper
  - host-contract diagnostics 遇到 nested helper MUST 返回 `requires_official_parent` 或等价证据分类，不得把 direct exec 当成诊断手段
  - host-contract diagnostics 遇到 CLI plugin cache helper MUST NOT 返回 `requires_official_parent`；MUST 返回 `handoff_verified` 或等价 CLI plugin contract evidence
- `Windows`：
  - MUST 固定返回 `unsupported`
  - MUST NOT 尝试解析任何 `macOS` bundle/helper 路径
  - MUST NOT 执行 activation probe 或 host-contract diagnostics

### Ready gate

只有在以下条件全部满足时才允许返回 `ready`：

- 平台受支持
- `Codex.app` 已检测到
- 官方 plugin 已检测到
- 官方 plugin 已启用
- helper 已检测到
- helper bridgeability 已验证
- 系统权限已验证
- app approval 已验证

## Validation & Error Matrix

| Condition | Expected status | Expected reason |
|---|---|---|
| 非 `macOS`/`Windows` 支持平台 | `unsupported` | `platform_unsupported` |
| `Codex.app` 缺失 | `unavailable` | `codex_app_missing` |
| plugin 缺失 | `unavailable` | `plugin_missing` |
| plugin 已安装但 disabled | `blocked` | `plugin_disabled` |
| helper 路径无法解析或目标不存在 | `blocked` | `helper_missing` |
| helper 存在但 bridgeability 未验证 | `blocked` | `helper_bridge_unverified` |
| 权限未验证 | `blocked` | `permission_required` |
| app approvals 未验证 | `blocked` | `approval_required` |
| activation kill switch 关闭 | activation result `failed` | `activation_disabled` |
| CLI plugin cache descriptor/helper 存在 | activation result `blocked` 或 `verified` | static launch-contract verified，仍保留权限/approval blockers |
| nested helper 不能由当前 host 直接执行 | activation result `failed` | `host_incompatible` |
| host-contract diagnostics 识别 nested helper + 非官方 parent | diagnostics result | `requires_official_parent` |
| host-contract diagnostics 识别 CLI plugin cache helper | diagnostics result | `handoff_verified` / `codex_cli_plugin_cache_mcp_descriptor` |
| official parent handoff discovery 只发现 team/application group parent contract | handoff discovery | `requires_official_parent` |
| official parent handoff discovery 发现 CLI plugin cache `.mcp.json` | handoff discovery | `handoff_candidate_found`，candidate method `mcp_descriptor` |
| official parent handoff discovery 发现 URL/XPC/MCP 候选入口 | handoff discovery | `handoff_candidate_found`，但不得自动 ready |
| helper bridge 已验证但权限/approval 仍未确认 | diagnostics result | `manual_permission_required` |
| 非 macOS host 调用 host diagnostics | diagnostics result | `unknown`，且不执行 helper |
| 多 server descriptor 缺少 `computer-use` key | `blocked` | `helper_missing` 或保留前置状态 |
| descriptor command 为空 / args 非字符串 | `blocked` | `helper_missing` 或保留前置状态 |

## Good / Base / Bad Cases

### Good

- `macOS` 下已识别到官方 `Codex.app`、plugin、helper 真实路径，但仍保守返回 `blocked`
- `Windows` 下立即返回 `unsupported`，不继续做 bundle 探测

### Base

- 只读取官方状态，不触发任何 helper 执行

### Bad

- 读取到 `.mcp.json` 的相对路径后直接 `PathBuf::from(command).exists()`
- 在 command 中直接执行大量阻塞 IO
- 为了“看起来可用”而在权限/approval 未确认时返回 `ready`

## Tests Required

- `cargo test --manifest-path src-tauri/Cargo.toml computer_use -- --nocapture`
- 必测断言：
  - status precedence
  - missing app / missing plugin / plugin disabled
  - false-positive ready guard
  - relative helper path resolution against `.mcp.json` `command + cwd`
  - CLI plugin cache descriptor priority over Codex.app bundled descriptor
  - CLI plugin cache helper static activation verification without direct exec
  - CLI plugin cache helper host-contract classification
  - descriptor 多 server 时优先 `computer-use`，ambiguous/invalid descriptor 不启动 helper
  - kill switch truthy values
  - nested app-bundle helper diagnostics-only fallback
  - host-contract diagnostics kind 序列化为 snake_case，payload 字段序列化为 camelCase
  - official parent handoff discovery 嵌套 payload 序列化为 camelCase，kind 为 snake_case
  - parent coderequirement / application group 读取与 `requires_official_parent` 分类
  - host-contract diagnostics 对 Windows / unsupported host 保持 non-executable

## Wrong vs Correct

### Wrong

```rust
snapshot.helper_path = parse_helper_command_path(&helper_descriptor_path);
snapshot.helper_present = snapshot
    .helper_path
    .as_ref()
    .map(PathBuf::from)
    .is_some_and(|path| path.exists());
```

问题：把 `.mcp.json` 里的相对 `command` 当成绝对路径判断，容易误报 `helper_missing`。

### Correct

```rust
let command = PathBuf::from(server.get("command").and_then(|value| value.as_str())?);
let working_directory = descriptor_dir.join(cwd);
let resolved_path = normalize_path(working_directory.join(command));
```

先按 `descriptor dir + cwd` 解析，再检查 helper 是否存在。
