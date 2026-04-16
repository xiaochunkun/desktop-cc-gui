# claude-rewind-review-surface Specification

## Purpose
定义 Claude rewind 确认弹层中的文件核对、diff 预览与导出语义，确保用户在执行高风险回溯前可以完成稳定、可恢复的审查与存档动作。
## Requirements
### Requirement: Compact Review Surface For Claude Rewind

Claude rewind 确认弹层 MUST 使用紧凑文件审查结构，避免受影响文件区域随文件数线性撑高主体内容。

#### Scenario: affected files remain independently scrollable
- **WHEN** rewind preview 包含多个受影响文件
- **THEN** 文件列表 SHALL 使用独立滚动区域
- **AND** 目标信息与影响摘要 SHALL 保持可见，不被长文件列表挤出主要视口

#### Scenario: first file is focused by default
- **WHEN** rewind preview 至少包含一个受影响文件
- **THEN** 系统 SHALL 默认选中第一条文件
- **AND** 右侧区域 SHALL 展示该文件的 diff 预览或空态

### Requirement: Rewind File Diff Preview And Navigation

Claude rewind 确认弹层 MUST 支持单文件 diff 预览，并在同一确认流程内查看完整 diff。

#### Scenario: click file switches preview
- **WHEN** 用户点击某个受影响文件
- **THEN** 弹层 SHALL 切换当前选中文件
- **AND** diff 预览区域 SHALL 更新为该文件内容

#### Scenario: file can open full diff overlay
- **WHEN** 用户在 rewind review surface 上触发“查看完整 diff”
- **THEN** 系统 SHALL 在当前确认流程内打开完整 diff overlay
- **AND** overlay SHALL 展示当前选中文件的完整 diff 内容或原始 diff 文本

#### Scenario: missing diff is recoverable
- **WHEN** 当前文件没有可解析 diff
- **THEN** 弹层 SHALL 显示可恢复空态说明
- **AND** rewind 确认与文件切换交互 MUST 保持可用

### Requirement: Rewind File Export To Default Chat Diff Directory

Claude rewind 确认弹层 MUST 支持将受影响文件导出到默认全局 chat diff 目录。

#### Scenario: export writes files into engine and target specific folder
- **WHEN** 用户点击“存储变更”
- **THEN** 系统 SHALL 将文件写入 `~/.ccgui/chat-diff/{engine}/{YYYY-MM-DD}/{sessionId}/{targetMessageId}/files/`
- **AND** 同级目录 SHALL 生成 `manifest.json`

#### Scenario: export groups files by local calendar date
- **WHEN** 用户在某个自然日触发“存储变更”
- **THEN** 系统 SHALL 使用导出发生时的本地日期生成 `YYYY-MM-DD` 目录层级
- **AND** 同一自然日内的导出 SHALL 落入对应日期目录下

#### Scenario: manifest preserves rewind metadata
- **WHEN** 导出成功
- **THEN** `manifest.json` SHALL 记录 `conversationLabel`、`workspaceRoot`、`fileCount`
- **AND** 每个导出文件 SHALL 记录 `sourcePath` 与 `storedPath`

#### Scenario: relative file path resolves from workspace root
- **WHEN** 受影响文件路径是相对路径
- **THEN** 系统 SHALL 基于当前 workspace root 解析源文件
- **AND** 导出后 SHALL 保留原有相对目录层级

#### Scenario: absolute or file uri sources remain exportable
- **WHEN** 受影响文件路径是绝对路径或 `file://` URI
- **THEN** 系统 SHALL 解析该本地文件并完成导出
- **AND** 若文件不在 workspace 内，导出结果 SHALL 落到 `files/external/...`

#### Scenario: repeated export replaces same rewind snapshot
- **WHEN** 用户对同一 `sessionId + targetMessageId` 重复执行“存储变更”
- **THEN** 系统 SHALL 复用同一个导出根目录
- **AND** 新导出 SHALL 替换旧快照内容

#### Scenario: export failure does not block rewind review surface
- **WHEN** 文件导出失败
- **THEN** 系统 SHALL 向用户展示可恢复错误信息
- **AND** rewind 确认弹层 MUST 继续允许切换文件、查看 diff 与取消/确认回溯

### Requirement: Claude Rewind Workspace Restore Toggle

Claude rewind 确认弹层 MUST 提供“回退工作区文件”开关，用于控制是否执行 workspace 文件回退。

#### Scenario: toggle is visible and defaults to enabled
- **WHEN** 用户打开 Claude rewind 确认弹层
- **THEN** 系统 MUST 显示“回退工作区文件”开关
- **AND** 开关默认值 MUST 为开启状态

#### Scenario: enabled toggle keeps current restore behavior
- **WHEN** 用户保持开关为开启并确认 rewind
- **THEN** 系统 MUST 执行现有 workspace 文件回退流程
- **AND** 文件回退失败时 MUST 继续按既有回滚规则处理

#### Scenario: disabled toggle skips workspace restore but keeps session rewind
- **WHEN** 用户将开关关闭并确认 rewind
- **THEN** 系统 MUST 跳过 workspace 文件回退流程
- **AND** 系统 MUST 继续执行会话回溯主链路

#### Scenario: toggle state resets to enabled on each dialog open
- **WHEN** 用户关闭并重新打开 Claude rewind 确认弹层
- **THEN** 开关状态 MUST 重置为开启
- **AND** 系统 MUST NOT 依赖上次会话的开关状态

