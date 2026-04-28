## ADDED Requirements

### Requirement: Settings MUST Expose Email Sender Configuration

系统 MUST 在设置页提供邮件发送配置区域，使用户能够启用或关闭邮件发送能力，并配置发件邮箱、provider、SMTP 参数、用户名与授权码状态。

#### Scenario: email section is visible in settings
- **WHEN** 用户打开设置页
- **THEN** 系统 MUST 展示邮件发送配置区域
- **AND** 区域 MUST 至少包含启用开关、provider 选择、发件人邮箱、发件人名称、SMTP host、SMTP port、安全模式、用户名、授权码状态与测试发送入口

#### Scenario: legacy settings default to disabled
- **WHEN** 系统读取缺少邮件字段的旧版 settings
- **THEN** 邮件发送能力 MUST 默认为 disabled 或等价未配置状态
- **AND** 现有声音通知、系统通知、会话与 runtime 行为 MUST 保持不变

#### Scenario: disabled email sender blocks downstream send attempts
- **WHEN** 邮件发送能力处于 disabled 状态
- **THEN** 后续邮件发送调用 MUST 返回 `disabled` 或等价结构化状态
- **AND** 系统 MUST NOT 尝试连接 SMTP server

### Requirement: Provider Presets MUST Cover Mainstream Chinese Mailboxes And Custom SMTP

系统 MUST 支持 `126`、`163`、`qq` 与 `custom` provider，并在 preset provider 下提供可用的 SMTP 默认参数。

#### Scenario: selecting 126 preset fills smtp defaults
- **WHEN** 用户选择 `126` provider
- **THEN** 系统 MUST 使用 `smtp.126.com` 作为默认 SMTP host
- **AND** 系统 MUST 使用推荐端口与 TLS 安全模式填充 SMTP 字段

#### Scenario: selecting 163 preset fills smtp defaults
- **WHEN** 用户选择 `163` provider
- **THEN** 系统 MUST 使用 `smtp.163.com` 作为默认 SMTP host
- **AND** 系统 MUST 使用推荐端口与 TLS 安全模式填充 SMTP 字段

#### Scenario: selecting qq preset fills smtp defaults
- **WHEN** 用户选择 `qq` provider
- **THEN** 系统 MUST 使用 `smtp.qq.com` 作为默认 SMTP host
- **AND** 系统 MUST 使用推荐端口与 TLS 安全模式填充 SMTP 字段

#### Scenario: custom provider allows manual smtp settings
- **WHEN** 用户选择 `custom` provider
- **THEN** 用户 MUST 能手动编辑 SMTP host、SMTP port 与安全模式
- **AND** 系统 MUST 按用户保存的 custom 参数执行发送

### Requirement: Email Secrets MUST Be Protected And Masked

系统 MUST 将邮箱授权码 / app password 作为 secret 处理，不得通过普通 settings payload、日志、错误提示或 UI 明文泄露。

#### Scenario: saved secret is not returned to frontend
- **WHEN** 用户保存邮箱授权码或 app password
- **THEN** 系统 MUST 将 secret 写入系统 credential store 或等价安全存储
- **AND** 后续 settings payload MUST 只返回 `secretConfigured` 或 masked 状态
- **AND** payload MUST NOT 包含 secret 明文

#### Scenario: secret can be replaced without exposing previous value
- **WHEN** 用户输入新的授权码并保存
- **THEN** 系统 MUST 覆盖旧 secret
- **AND** UI MUST NOT 需要读取或回显旧 secret 明文

#### Scenario: logs and errors redact secret values
- **WHEN** 保存配置、测试发送或邮件发送失败
- **THEN** 普通日志、toast、错误对象与测试输出 MUST NOT 包含授权码或 app password 明文
- **AND** 诊断信息 MUST 使用 provider、host、port 与 error code 等非敏感字段

### Requirement: Test Email MUST Send Through Configured SMTP

系统 MUST 提供测试发送能力，用户保存有效配置后能够向指定收件人真实发送测试邮件。

#### Scenario: test email sends successfully
- **WHEN** 邮件发送已启用、配置有效、secret 已保存且用户输入合法测试收件人
- **THEN** 系统 MUST 通过配置的 SMTP server 发送测试邮件
- **AND** UI MUST 展示成功反馈

#### Scenario: invalid test recipient is rejected before smtp send
- **WHEN** 用户输入非法测试收件人地址并点击发送测试邮件
- **THEN** 系统 MUST 返回 `invalid_recipient` 或等价结构化错误
- **AND** 系统 SHOULD 在连接 SMTP server 前阻止发送

#### Scenario: missing secret blocks test send
- **WHEN** 邮件发送已启用但 secret 未配置
- **THEN** 测试发送 MUST 返回 `missing_secret` 或等价结构化错误
- **AND** 系统 MUST NOT 尝试使用空密码连接 SMTP server

### Requirement: Backend Email Sender MUST Be Reusable By Future Reminder Features

系统 MUST 在 backend 提供可复用的邮件发送 service，使后续会话结束提醒或消息提醒能够消费该能力，而不重复实现 SMTP 逻辑。

#### Scenario: internal caller sends email through shared service
- **WHEN** 后续 backend 功能调用共享邮件发送 service 并提供收件人、主题与正文
- **THEN** 系统 MUST 使用当前已保存的邮件发送配置与 secret 发送邮件
- **AND** 调用方 MUST 收到结构化成功结果或结构化错误

#### Scenario: sender contract remains independent from conversation policy
- **WHEN** 本变更完成后
- **THEN** 邮件发送 service MUST NOT 自动监听会话结束、消息完成或 runtime 事件
- **AND** 自动提醒触发策略 MUST 由后续独立 change 定义

### Requirement: Email Send Failures MUST Be Structured And Recoverable

系统 MUST 将 SMTP、网络、TLS、认证与配置错误映射为稳定错误类型，便于 UI 展示、测试断言与后续提醒降级。

#### Scenario: authentication failure is classified
- **WHEN** SMTP server 拒绝用户名或授权码
- **THEN** 系统 MUST 返回 `authentication_failed` 或等价结构化错误
- **AND** 错误信息 MUST 提示用户检查授权码 / app password

#### Scenario: connection failure is classified
- **WHEN** SMTP host 不可达、端口无法连接或请求超时
- **THEN** 系统 MUST 返回 `connect_failed`、`timeout` 或等价结构化错误
- **AND** UI MUST 保留用户已填写的配置，方便修正后重试

#### Scenario: tls failure is classified
- **WHEN** SMTP TLS 握手或证书校验失败
- **THEN** 系统 MUST 返回 `tls_failed` 或等价结构化错误
- **AND** 错误对象 MUST NOT 包含 secret 明文

### Requirement: Email Settings Integration MUST Preserve Existing Settings Contracts

系统 MUST 以增量方式接入邮件设置，不得破坏既有 AppSettings、通知声音、系统通知、runtime 或会话行为。

#### Scenario: generic app settings remain backward compatible
- **WHEN** 用户保存非邮件相关设置
- **THEN** 系统 MUST 保持邮件 secret 不变
- **AND** 系统 MUST NOT 因普通设置保存清空、覆盖或回显邮件 secret

#### Scenario: email commands use typed tauri bridge
- **WHEN** Settings UI 读取、保存邮件设置或触发测试发送
- **THEN** UI MUST 通过 `src/services/tauri.ts` 中的 typed bridge 调用 backend command
- **AND** feature component MUST NOT 直接调用 Tauri `invoke()`

#### Scenario: unrelated notification settings are unchanged
- **WHEN** 用户只配置邮件发送设置
- **THEN** 现有通知声音与系统通知设置 MUST 保持原值
- **AND** 系统 MUST NOT 自动开启或关闭声音通知、系统通知或会话完成提醒
