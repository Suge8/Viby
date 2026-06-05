# Viby

Viby 是 Desktop App + AppCore + Hub + Web/PWA 组成的本机 agent 工作区。

## 语言

**native skill capability**:
agent adapter 报告的 skill 能力；必须带 provider 真实可执行 trigger，才能进入 Web autocomplete。`CommandCapability.trigger` 永远是 provider 真实可执行文本；`$` 只是 Web 过滤模式；`native_skill` 是唯一 skill capability kind；不维护 recent skills 状态。
_Avoid_: Viby skill, fake skill trigger, provider skill
