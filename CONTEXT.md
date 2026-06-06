# Viby

Viby 是 Desktop App + AppCore + Hub + Web/PWA 组成的本机 agent 工作区。

## 语言

**native skill capability**:
agent adapter 报告的 skill 能力；必须带 provider 真实可执行 trigger，才能进入 Web autocomplete。`CommandCapability.trigger` 永远是 provider 真实可执行文本；`$` 只是 Web 过滤模式；`native_skill` 是唯一 skill capability kind；不维护 recent skills 状态。
_Avoid_: Viby skill, fake skill trigger, provider skill

**Pairing session transition**:
pairing session 的纯状态转移语义；输入当前 session / remote connection / token 事实，输出 next session 与持久化 side effects，不直接读写 Memory/Redis。
_Avoid_: Pairing store business logic, Redis transition, memory transition

**runtime turn owner**:
AppCore provider runtime 的单轮用户消息生命周期 owner；拥有 queue wait、thinking、provider turn、terminal failure、ready settle 和 abort cleanup，provider 适配器只填真实 transport 行为。
_Avoid_: provider loop helper, RemoteLauncherBase logic, turn wrapper
