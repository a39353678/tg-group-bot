# 部署版本记录与反馈总结

## 概述
本次会话共部署了 **15 个版本**，从 KV→D1 迁移开始，经历了抽奖功能开发、多个 BUG 修复。

---

## 版本 1 — D1 迁移完成
- **版本ID:** `d581e59d-9301-4d1a-a211-81e6779b4f82`
- **改动:** handlers.js `BOT_CONFIG:kv` → `BOT_DB:db`，D1 schema 远程应用，wrangler.toml 更新
- **用户反馈:** ✅ 管理面板正常加载，无错误
- **后续:** 用户要求添加踢出群自动清理配置的功能

---

## 版本 2 — 踢出群清理 + 北京时间修复
- **改动:** 机器人被踢出群时自动清理 `group_config` 和 `groups` 记录；`isInQuietHours` 改为 UTC+8
- **用户反馈:** ✅ 正常

---

## 版本 3 — /安静模式 命令
- **改动:** 新增 `/quiet`、`/安静模式` 命令，支持 `@bot /安静模式` 格式
- **用户反馈:** 用户询问安静时段是 UTC 还是北京时间 → 修复为 UTC+8

---

## 版本 4 — setChatPermissions 真正禁言
- **改动:** `/安静模式` 改为调用 `setChatPermissions` 真正限制全员发言，Cron 每5分钟检查到期自动恢复
- **用户反馈:** ✅ 正常

---

## 版本 5 — 管理面板抽奖 Tab
- **改动:** 抽奖逻辑抽离到 `lottery.js` 模块，管理面板新增「🎰 抽奖」选项卡
- **用户反馈:** ❌ 点击「参与抽奖」按钮没反应

---

## 版本 6 — Webhook 更新（加入 callback_query）
- **改动:** `/set-webhook` 先删除旧 webhook 再重建，确保 `allowed_updates` 包含 `callback_query`
- **Webhook 状态:** `"Webhook was set"` ✅
- **用户反馈:** ❌ 点击按钮还是没反应

---

## 版本 7 — 调试日志
- **改动:** 在 `handleUpdate` 和 `handleLotteryCallback` 中加入 `console.log` 调试
- **用户反馈:** ❌ 没有变化（无法获取 Worker 日志）

---

## 版本 8 — answerCallbackQuery 修复
- **改动:** 修复 `answerCallbackQuery` 被调用两次的问题，每个路径只调用一次
- **用户反馈:** ❌ 点击提示「抽奖已结束或不存在」
- **分析:** 回调到达了 bot（answerCallbackQuery 生效），但 `lotterySessions.get(key)` 返回 undefined → 内存 Map 在 Worker 重启后丢失

---

## 版本 9 — 抽奖数据改用 D1 存储
- **改动:** `lottery.js` 完全重写，`lotterySessions` 从内存 Map 改为 D1 数据库
- **用户反馈:** ❌ `D1_ERROR: Wrong number of parameter bindings for SQL query`

---

## 版本 10 — saveLottery 参数绑定修复
- **改动:** `saveLottery` 的 `ON CONFLICT` 语句从 `?` 改为 `?1`~`?5` 命名参数
- **用户反馈:** ❌ 还是同样的 D1_ERROR

---

## 版本 11 — .bind().first() 修复
- **改动:** `getLottery` 从 `.first(chatId)` 改为 `.bind(chatId).first()`（D1 的 `.first()` 不直接接受参数）
- **用户反馈:** ✅ 抽奖功能正常！开奖也 OK
- **后续反馈:** 用户要求把开奖结果存到数据库，管理面板可查看中奖记录

---

## 版本 12 — 抽奖结果持久化
- **改动:** `lottery_sessions` 新增 `status`、`winners_json`、`drawn_at` 列；开奖后结果保存到 D1 不删除；管理面板显示已完成的抽奖记录和中奖者名单
- **用户反馈:** ✅ 完美

---

## 版本 13 — 通知自动删除修复（第一次尝试）
- **改动:** 管理面板用 `sessionStorage` 记住群组选择；`scheduleAutoDelete` 改用轮询等待 + `ctx.waitUntil` 安全检查
- **用户反馈:**
  - ❌ 刷新页面值还是变回 30
  - ❌ 通知等待超过 30 秒也没有删除

---

## 版本 14 — 通知自动删除改用 D1+Cron（第二次尝试）
- **改动:** `scheduleAutoDelete` 改为写入 D1 `pending_deletions` 表；Cron 每分钟处理；Cron 从每5分钟改为每1分钟
- **用户反馈:** ❌ 通知还是没有删除
- **根因分析:** `handleBan`/`handleKick`/`handleMute`/`handleUnmute` 函数缺少 `db` 参数，导致 `replyNotification(db, ...)` 中 `db` 为 `undefined`，D1 插入静默失败

---

## 版本 15 — db 参数修复（第三次尝试）
- **改动:** 给 `handleBan`、`handleKick`、`handleMute`、`handleUnmute` 函数签名加上 `db` 参数
- **用户反馈:** 未测试就被中断
- **用户提出:** 不要用 Cron，太费资源 → 改回 `ctx.waitUntil + setTimeout` 方案

---

## 版本 16 — 恢复 ctx.waitUntil 方案（第四次尝试）
- **改动过程:** git checkout 恢复 → 用 Node.js 脚本批量添加 `ctx` 参数 → 脚本搞坏代码 → 多次恢复重试 → 最终手动修复
- **版本ID:** `c1cb0553-5e3f-4a17-9293-ed9c81581c45`
- **用户反馈:** 未单独测试

---

## 版本 17 — 统一 30 秒删除（最终版）
- **版本ID:** `6572d061-f78a-4a48-acab-8f1e4aeca022`
- **改动:**
  - `scheduleAutoDelete` 硬编码 30 秒，不再读配置
  - 移除管理面板的通知删除时间输入框
  - 所有通知（封禁、踢出、垃圾检测、安静模式等）统一 30 秒后自动删除
- **用户反馈:** 待测试

---

## 问题追踪

### 通知自动删除为什么一直不工作？

| 版本 | 方案 | 失败原因 |
|------|------|----------|
| 13 | `ctx.waitUntil + setTimeout` | `ctx` 参数链断裂（重构抽奖时 sed 替换搞乱） |
| 14 | D1 + Cron | `db` 参数未传入 handler 函数，D1 插入静默失败 |
| 15 | 修 db 参数 + Cron | 用户不想用 Cron |
| 16 | 恢复 ctx.waitUntil | 文件被脚本搞坏，多次恢复 |
| 17 | 硬编码 30 秒 | 待测试 |

**根本原因链条：**
1. 重构抽奖功能时，用 sed 给 `replyNotification` 加了 `db` 参数，但没给 handler 函数加 → `db` 为 undefined
2. 同时 sed 替换移除了 `ctx` 参数，导致 `ctx.waitUntil` 调用失败
3. 后续多次修复尝试中，sed/perl/Node.js 脚本又多次搞坏代码
4. 最终决定简化方案：去掉可配置项，硬编码 30 秒

### 管理面板秒数刷新变回 30 的原因

用户在**群配置**中设置了 5 秒，但管理面板刷新后默认显示**全局配置**（30 秒）。用 `sessionStorage` 记住了群组选择，但可能因为 `loadGroups` 是异步的，`loadConfig` 在群组列表加载完之前就执行了，导致选中状态未恢复。

---

## Git 提交记录

```
fdd9d2a  Initial commit: TG群管理机器人
9605eb2  feat: 新增抽奖功能
0322f7e  docs: 更新项目结构，增加 lottery.js
e665022  feat: 管理面板新增抽奖管理 tab
69de0a9  feat: 抽奖结果持久化到 D1
0e8c484  fix: 修复通知自动删除的两个 BUG
dff486e  fix: db 参数未传入 handler 函数
e0bf360  fix: 通知自动删除改用 D1+Cron
e0c7f6f  simplify: 通知自动删除统一30秒
```
