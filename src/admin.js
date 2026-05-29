/**
 * 管理员 Web 面板 - 模块化配置界面
 */

import { getConfig, saveConfig, getGroupConfig, saveGroupConfig, getGroupList, verifyPassword, hasPassword, setPassword, addKeyword, removeKeyword } from "./config.js";
import { getActiveLotteries, createLottery, forceDraw, deleteLotteryResult } from "./lottery.js";

export async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/admin/api/login" && request.method === "POST") return handleLogin(request, env);
  if (path === "/admin/api/config") {
    if (request.method === "GET") return handleGetConfig(request, env);
    if (request.method === "POST") return handleSaveConfig(request, env);
  }
  if (path === "/admin/api/reset-password" && request.method === "POST") return handleResetPassword(request, env);
  if (path === "/admin/api/groups") return handleGetGroups(request, env);
  if (path === "/admin/api/keyword") {
    if (request.method === "POST") return handleAddKeyword(request, env);
    if (request.method === "DELETE") return handleRemoveKeyword(request, env);
  }
  if (path === "/admin/api/lottery") {
    if (request.method === "GET") return handleGetLotteries(request, env);
    if (request.method === "POST") return handleCreateLottery(request, env);
  }
  if (path === "/admin/api/lottery/draw" && request.method === "POST") return handleDrawLottery(request, env);
  if (path === "/admin/api/lottery/delete" && request.method === "POST") return handleDeleteLottery(request, env);

  return renderAdminPage(env);
}

async function renderAdminPage(env) {
  const hasPwd = await hasPassword(env.BOT_DB);
  const botName = env.BOT_NAME || "TG群管理机器人";

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${botName} - 管理面板</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  background:#0f0f1a;color:#e0e0e0;min-height:100vh
}
.container{max-width:720px;margin:0 auto;padding:20px}
.header{text-align:center;padding:24px 0 16px}
.header h1{font-size:22px;color:#fff}
.header .sub{color:#667;font-size:13px;margin-top:4px}

/* 卡片 */
.card{
  background:#1a1a2e;border-radius:12px;
  padding:20px;margin-bottom:12px;
  border:1px solid #2a2a3e
}

/* Tab 导航 */
.tabs{display:flex;gap:4px;overflow-x:auto;padding:4px;margin-bottom:12px}
.tab{
  padding:8px 14px;border-radius:8px;font-size:13px;
  cursor:pointer;white-space:nowrap;border:none;
  background:#2a2a3e;color:#889;transition:0.2s
}
.tab:hover{background:#3a3a4e;color:#dde}
.tab.active{background:#4caf50;color:#fff}

/* 模块标题 */
.module-title{font-size:16px;font-weight:600;margin-bottom:4px;color:#fff}
.module-desc{font-size:12px;color:#667;margin-bottom:16px}

/* 开关行 */
.row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2a3e}
.row:last-child{border-bottom:none}
.row .label{display:flex;align-items:center;gap:8px;font-size:14px}
.row .label .icon{font-size:18px}
.row .desc{font-size:11px;color:#667;margin-top:2px}

/* Toggle */
.toggle{position:relative;width:44px;height:24px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0}
.toggle .sl{
  position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;
  background:#444;border-radius:24px;transition:0.3s
}
.toggle .sl:before{
  content:"";position:absolute;height:18px;width:18px;
  left:3px;bottom:3px;background:#fff;border-radius:50%;transition:0.3s
}
.toggle input:checked+.sl{background:#4caf50}
.toggle input:checked+.sl:before{transform:translateX(20px)}

/* 输入框 */
input[type="text"],input[type="number"],input[type="password"],textarea,select{
  width:100%;padding:10px 12px;border:1px solid #333;border-radius:6px;
  background:#0f0f1a;color:#e0e0e0;font-size:13px;outline:none;margin-bottom:8px
}
input:focus,textarea:focus{border-color:#4caf50}
textarea{min-height:80px;resize:vertical;font-family:inherit}

/* 按钮 */
.btn{padding:8px 18px;border:none;border-radius:6px;font-size:13px;cursor:pointer;transition:0.2s;font-weight:500}
.btn-primary{background:#4caf50;color:#fff}
.btn-primary:hover{background:#43a047}
.btn-danger{background:#e53935;color:#fff}
.btn-danger:hover{background:#c62828}
.btn-sm{padding:4px 10px;font-size:12px}
.btn-outline{background:transparent;border:1px solid #4caf50;color:#4caf50}
.btn-outline:hover{background:#4caf50;color:#fff}

/* 关键词标签 */
.tags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.tag{
  display:inline-flex;align-items:center;gap:4px;
  padding:4px 10px;border-radius:12px;font-size:12px;
  background:#2a2a3e;color:#ccc
}
.tag .del{cursor:pointer;font-size:14px;color:#e53935;margin-left:2px}
.tag .del:hover{color:#ff1744}
.add-row{display:flex;gap:6px;margin-top:8px}
.add-row input{flex:1;margin-bottom:0}

/* 登录面板 */
.login-panel{max-width:360px;margin:60px auto;text-align:center}
.login-panel h2{font-size:18px;margin-bottom:12px}
.login-panel .sub{color:#667;font-size:13px;margin-bottom:20px}

/* Toast */
.toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;color:#fff;font-size:13px;z-index:999;opacity:0;transition:0.3s}
.toast.show{opacity:1}
.toast.success{background:#2e7d32}
.toast.error{background:#c62828}

/* 面板区域 */
.panel{display:none}
.panel.active{display:block}

.footer{text-align:center;font-size:11px;color:#445;padding:20px}

/* 设置组 */
.setting-group{background:#0f0f1a;border-radius:8px;padding:12px;margin-bottom:10px}
.setting-group .sg-title{font-size:13px;color:#a0c4ff;margin-bottom:8px}
.setting-group .sg-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.setting-group .sg-row label{font-size:12px;color:#889;min-width:80px}
.setting-group .sg-row input,.setting-group .sg-row select{flex:1;margin-bottom:0}

@media(max-width:600px){
  .container{padding:12px}
  .card{padding:14px}
  .tab{font-size:12px;padding:6px 10px}
}
</style>
</head>
<body>
<div id="toast" class="toast"></div>
<div id="jsError" style="display:none;position:fixed;bottom:0;left:0;right:0;background:#c62828;color:#fff;padding:12px;font-size:13px;z-index:9999"></div>
<div class="container">

<div class="header">
  <h1>🤖 ${botName}</h1>
  <div class="sub">Cloudflare Workers · 模块化管理面板</div>
</div>

<!-- 登录 -->
<div id="loginPanel" class="login-panel">
  <div class="card">
    <h2>${hasPwd ? "🔑 管理员登录" : "🔐 首次使用，设置密码"}</h2>
    <p class="sub">${hasPwd ? "输入密码进入管理面板" : "设置一个管理员密码，之后用它登录"}</p>
    <input type="password" id="pwdInput" placeholder="输入密码..." onkeydown="if(event.key==='Enter')doLogin()">
    <button class="btn btn-primary" id="loginBtn" onclick="doLogin()" style="width:100%">${hasPwd ? "登录" : "设置密码并登录"}</button>
  </div>
</div>

<!-- 管理面板 -->
<div id="mainPanel" style="display:none">

<!-- 群组选择器 -->
<div class="card" style="padding:12px;margin-bottom:8px">
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
    <span style="font-size:13px;color:#889">📋 配置范围:</span>
    <select id="groupSelector" style="flex:1;min-width:150px;margin-bottom:0" onchange="switchGroup()">
      <option value="global">🌐 全局默认配置</option>
    </select>
    <span style="font-size:11px;color:#667">选择群组可单独配置</span>
  </div>
</div>

<!-- Tab 导航 -->
<div class="tabs" id="tabBar">
  <button class="tab active" data-tab="tab-ai">🤖 AI</button>
  <button class="tab" data-tab="tab-welcome">👋 欢迎</button>
  <button class="tab" data-tab="tab-captcha">🧮 验证</button>
  <button class="tab" data-tab="tab-spam">🚫 垃圾</button>
  <button class="tab" data-tab="tab-toxic">🛡️ 过滤</button>
  <button class="tab" data-tab="tab-quiet">🔇 安静</button>
  <button class="tab" data-tab="tab-admin">🔨 管理</button>
  <button class="tab" data-tab="tab-lottery">🎰 抽奖</button>
  <button class="tab" data-tab="tab-about">ℹ️</button>
</div>

<!-- 模块: AI 对话 -->
<div id="tab-ai" class="panel active">
  <div class="card">
    <div class="module-title">🤖 AI 对话</div>
    <div class="module-desc">群成员 @机器人 或使用 /ai 命令提问时，AI 自动回复</div>
    <div class="row">
      <div><div class="label"><span class="icon">🧠</span> 启用 AI 对话</div></div>
      <label class="toggle"><input type="checkbox" data-key="ai_chat"><span class="sl"></span></label>
    </div>
    <div class="setting-group">
      <div class="sg-title">AI 对话模型选择</div>
      <div class="sg-row">
        <label>对话模型</label>
        <select data-key="ai_chat_model">
          <option value="qwen3-30b">Qwen3 30B ⭐ 推荐（中文强）</option>
          <option value="glm-4.7-flash">GLM 4.7 Flash（中文，极快）</option>
          <option value="kimi-k2.6">Kimi K2.6（中文）</option>
          <option value="deepseek-r1-32b">DeepSeek R1 32B（推理强）</option>
          <option value="qwq-32b">QwQ 32B（推理）</option>
          <option value="qwen2.5-coder-32b">Qwen2.5 Coder 32B（代码）</option>
          <option value="llama-4-scout">Llama 4 Scout 17B</option>
          <option value="llama-3.3-70b">Llama 3.3 70B（能力强）</option>
          <option value="llama-3.1-8b">Llama 3.1 8B</option>
          <option value="llama-3.2-3b">Llama 3.2 3B（极快）</option>
          <option value="llama-3.2-1b">Llama 3.2 1B（最快）</option>
          <option value="mistral-small-3.1">Mistral Small 3.1 24B</option>
          <option value="gemma-4-26b">Gemma 4 26B</option>
          <option value="gpt-oss-20b">GPT-OSS 20B</option>
        </select>
      </div>
      <div class="sg-row">
        <label>垃圾检测模型</label>
        <select data-key="ai_classification_model">
          <option value="distilbert">DistilBERT ⭐ 推荐</option>
        </select>
      </div>
    </div>
  </div>
</div>

<!-- 模块: 欢迎设置 -->
<div id="tab-welcome" class="panel">
  <div class="card">
    <div class="module-title">👋 欢迎消息</div>
    <div class="module-desc">新成员加入群组时自动发送欢迎</div>
    <div class="row">
      <div><div class="label"><span class="icon">🔔</span> 启用欢迎消息</div></div>
      <label class="toggle"><input type="checkbox" data-key="welcome_message"><span class="sl"></span></label>
    </div>
    <div style="margin-top:12px">
      <label style="font-size:12px;color:#889">欢迎词内容（支持变量: {name} {group}）</label>
      <textarea id="welcome_text" data-key="welcome_text" placeholder="输入欢迎词..."></textarea>
    </div>
  </div>
</div>

<!-- 模块: 入群验证 -->
<div id="tab-captcha" class="panel">
  <div class="card">
    <div class="module-title">🧮 入群算术验证</div>
    <div class="module-desc">新成员加入后需计算算术题，通过后才能发言（需将机器人设为管理员）</div>
    <div class="row">
      <div><div class="label"><span class="icon">🔐</span> 启用入群验证</div></div>
      <label class="toggle"><input type="checkbox" data-key="captcha_verification"><span class="sl"></span></label>
    </div>
    <div class="setting-group">
      <div class="sg-title">验证参数</div>
      <div class="sg-row">
        <label>数字位数</label>
        <input type="number" data-key="captcha_digits" min="1" max="4" style="width:80px">
        <span style="font-size:11px;color:#667">（2=两位数加减，如 34+56）</span>
      </div>
      <div class="sg-row">
        <label>超时(分钟)</label>
        <input type="number" data-key="captcha_timeout_min" min="1" max="30" style="width:80px">
        <span style="font-size:11px;color:#667">（超时未答自动踢出）</span>
      </div>
    </div>
  </div>
</div>

<!-- 模块: 垃圾检测 -->
<div id="tab-spam" class="panel">
  <div class="card">
    <div class="module-title">🚫 垃圾消息检测</div>
    <div class="module-desc">检测并处理广告、垃圾消息</div>
    <div class="row">
      <div><div class="label"><span class="icon">🔍</span> 启用垃圾检测</div></div>
      <label class="toggle"><input type="checkbox" data-key="spam_detection"><span class="sl"></span></label>
    </div>
    <div class="row">
      <div><div class="label"><span class="icon">🗑️</span> 自动删除垃圾</div></div>
      <label class="toggle"><input type="checkbox" data-key="auto_delete_spam"><span class="sl"></span></label>
    </div>
    <div style="margin-top:12px">
      <div style="font-size:12px;color:#889;margin-bottom:6px">自定义垃圾关键词（匹配到直接拦截）</div>
      <div class="tags" id="spamTags"></div>
      <div class="add-row">
        <input type="text" id="spamKeywordInput" placeholder="输入关键词，如: 刷粉" onkeydown="if(event.key==='Enter')addKeyword('spam')">
        <button class="btn btn-primary btn-sm" onclick="addKeyword('spam')">添加</button>
      </div>
    </div>
  </div>
</div>

<!-- 模块: 内容过滤 -->
<div id="tab-toxic" class="panel">
  <div class="card">
    <div class="module-title">🛡️ 不当内容过滤</div>
    <div class="module-desc">检测敏感、不当内容并自动删除</div>
    <div class="row">
      <div><div class="label"><span class="icon">🔞</span> 启用内容过滤</div></div>
      <label class="toggle"><input type="checkbox" data-key="toxic_filter"><span class="sl"></span></label>
    </div>
    <div style="margin-top:12px">
      <div style="font-size:12px;color:#889;margin-bottom:6px">自定义敏感关键词</div>
      <div class="tags" id="toxicTags"></div>
      <div class="add-row">
        <input type="text" id="toxicKeywordInput" placeholder="输入关键词..." onkeydown="if(event.key==='Enter')addKeyword('toxic')">
        <button class="btn btn-primary btn-sm" onclick="addKeyword('toxic')">添加</button>
      </div>
    </div>
  </div>
</div>

<!-- 模块: 安静模式 -->
<div id="tab-quiet" class="panel">
  <div class="card">
    <div class="module-title">🔇 安静模式</div>
    <div class="module-desc">在指定时间段内限制群消息发送，支持禁止所有消息或仅禁止媒体文件</div>
    <div class="row">
      <div><div class="label"><span class="icon">⏰</span> 启用安静模式</div></div>
      <label class="toggle"><input type="checkbox" data-key="quiet_hours_enabled"><span class="sl"></span></label>
    </div>
    <div class="setting-group">
      <div class="sg-title">时间段设置</div>
      <div class="sg-row">
        <label>开始时间</label>
        <input type="text" data-key="quiet_hours_start" placeholder="22:00" style="width:100px">
      </div>
      <div class="sg-row">
        <label>结束时间</label>
        <input type="text" data-key="quiet_hours_end" placeholder="08:00" style="width:100px">
      </div>
      <div style="font-size:11px;color:#667;margin-top:4px">24小时制，支持跨天（如 22:00 → 08:00）</div>
    </div>
    <div class="row">
      <div><div class="label"><span class="icon">🚫</span> 禁止所有消息</div><div class="desc">安静时段内禁止发送任何消息</div></div>
      <label class="toggle"><input type="checkbox" data-key="quiet_hours_block_all"><span class="sl"></span></label>
    </div>
    <div class="row">
      <div><div class="label"><span class="icon">📸</span> 仅禁止媒体文件</div><div class="desc">安静时段内仅禁止图片/视频/文件</div></div>
      <label class="toggle"><input type="checkbox" data-key="quiet_hours_block_media"><span class="sl"></span></label>
    </div>
  </div>
</div>

<!-- 模块: 管理命令 -->
<div id="tab-admin" class="panel">
  <div class="card">
    <div class="module-title">🔨 群管理命令</div>
    <div class="module-desc">/ban /kick /mute /unmute 等管理命令（需机器人是管理员）</div>
    <div class="row">
      <div><div class="label"><span class="icon">🛠️</span> 启用管理命令</div></div>
      <label class="toggle"><input type="checkbox" data-key="admin_commands"><span class="sl"></span></label>
    </div>
    <div class="row">
      <div><div class="label"><span class="icon">⏱️</span> 通知自动删除</div><div class="desc">封禁/踢出/垃圾提醒等通知在 X 秒后自动删除，0=不删除</div></div>
      <input type="number" data-key="auto_delete_notification_seconds" min="0" max="3600" value="30" style="width:80px;margin-bottom:0">
    </div>
  </div>
</div>

<!-- 模块: 抽奖管理 -->
<div id="tab-lottery" class="panel">
  <div class="card">
    <div class="module-title">🎰 抽奖管理</div>
    <div class="module-desc">在群组中发起抽奖活动，成员点击按钮参与，支持定时自动开奖或手动开奖</div>

    <div class="setting-group">
      <div class="sg-title">创建新抽奖</div>
      <div class="sg-row">
        <label>群组</label>
        <select id="lotteryGroup" style="flex:1;margin-bottom:0" onchange="loadLotteries()">
          <option value="">请先选择群组...</option>
        </select>
      </div>
      <div class="sg-row">
        <label>奖品</label>
        <input type="text" id="lotteryPrize" placeholder="如：红包、周边、礼品卡" style="flex:1;margin-bottom:0">
      </div>
      <div class="sg-row">
        <label>时长(分)</label>
        <input type="number" id="lotteryDuration" min="1" max="1440" value="5" style="width:80px;margin-bottom:0">
      </div>
      <div class="sg-row">
        <label>中奖人数</label>
        <input type="number" id="lotteryWinners" min="1" max="50" value="1" style="width:80px;margin-bottom:0">
      </div>
      <div style="margin-top:8px">
        <button class="btn btn-primary" onclick="createLottery()" id="createLotteryBtn">🎁 发起抽奖</button>
        <button class="btn btn-outline btn-sm" onclick="loadLotteries()" style="margin-left:6px">🔄 刷新</button>
      </div>
    </div>

    <div class="setting-group">
      <div class="sg-title">抽奖记录</div>
      <div id="lotteryList"><span style="color:#556;font-size:12px">选择群组后自动加载</span></div>
    </div>
  </div>
</div>

<!-- 模块: 关于 -->
<div id="tab-about" class="panel">
  <div class="card" style="text-align:center">
    <div style="font-size:48px;margin-bottom:12px">🤖</div>
    <div class="module-title">TG 群管理机器人</div>
    <div class="module-desc">基于 Cloudflare Workers + AI</div>
    <div style="font-size:12px;color:#667;line-height:2">
      版本: 1.0.0<br>
      引擎: Cloudflare Workers AI<br>
      存储: Workers KV<br>
      模型: Qwen 1.5-14B + DistilBERT
    </div>
  </div>
</div>

<!-- 底部保存按钮 -->
<div style="display:flex;gap:8px;margin-top:12px">
  <button class="btn btn-primary" onclick="saveAll()" style="flex:1;padding:12px">💾 保存全部设置</button>
  <button class="btn btn-danger" onclick="logout()" style="flex:0 0 80px">退出</button>
</div>

<div class="footer">配置修改后点击「保存全部设置」立即生效</div>
</div><!-- /mainPanel -->
</div><!-- /container -->

<script>
// 全局错误捕获
window.onerror = function(msg, url, line) {
  document.getElementById("jsError").style.display = "block";
  document.getElementById("jsError").textContent = "JS错误: " + msg + " (行" + line + ")";
};
window.addEventListener("unhandledrejection", function(e) {
  document.getElementById("jsError").style.display = "block";
  document.getElementById("jsError").textContent = "请求失败: " + e.reason;
});

// === Tab 切换 ===
document.getElementById("tabBar").addEventListener("click", function(e) {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  tab.classList.add("active");
  document.getElementById(tab.dataset.tab).classList.add("active");
});

// === 登录状态 ===
(function() {
  if (sessionStorage.getItem("bot_admin") === "authed") {
    document.getElementById("loginPanel").style.display = "none";
    document.getElementById("mainPanel").style.display = "block";
    loadGroups();
    loadConfig();
  }
})();

function showToast(msg, type) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "toast " + type + " show";
  setTimeout(() => t.classList.remove("show"), 2500);
}

async function doLogin() {
  const pwd = document.getElementById("pwdInput").value;
  if (!pwd) { showToast("请输入密码", "error"); return; }
  const btn = document.getElementById("loginBtn");
  btn.disabled = true; btn.textContent = "验证中...";
  try {
    const r = await fetch("/admin/api/login", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({password: pwd})
    });
    const d = await r.json();
    if (d.ok) {
      sessionStorage.setItem("bot_admin", "authed");
      document.getElementById("loginPanel").style.display = "none";
      document.getElementById("mainPanel").style.display = "block";
      showToast("登录成功", "success");
      loadGroups();
      loadConfig();
    } else {
      showToast(d.error || "密码错误", "error");
    }
  } catch(e) { showToast("网络错误", "error"); }
  btn.disabled = false; btn.textContent = "登录";
}

function logout() {
  sessionStorage.removeItem("bot_admin");
  location.reload();
}

// === 群组选择 ===
async function loadGroups() {
  try {
    const r = await fetch("/admin/api/groups");
    const d = await r.json();
    if (d.ok && d.groups) {
      const sel = document.getElementById("groupSelector");
      const lotterySel = document.getElementById("lotteryGroup");
      d.groups.forEach(function(g) {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = '👥 ' + (g.title || '未命名群组');
        sel.appendChild(opt);
        const opt2 = document.createElement("option");
        opt2.value = g.id;
        opt2.textContent = '👥 ' + (g.title || '未命名群组');
        lotterySel.appendChild(opt2);
      });
    }
  } catch(e) { console.error(e); }
}

function switchGroup() {
  loadConfig();
}

// === 加载配置 ===
async function loadConfig() {
  try {
    const chatId = document.getElementById("groupSelector").value;
    const url = chatId === "global" ? "/admin/api/config" : "/admin/api/config?chatId=" + chatId;
    const r = await fetch(url);
    const d = await r.json();
    if (d.ok && d.config) {
      const cfg = d.config;
      // 开关
      document.querySelectorAll("[data-key]").forEach(el => {
        const key = el.dataset.key;
        if (el.type === "checkbox") {
          el.checked = cfg[key] === true;
        } else {
          el.value = cfg[key] !== undefined ? cfg[key] : "";
        }
      });
      // 关键词
      renderTags("spamTags", cfg.custom_spam_keywords || [], "spam");
      renderTags("toxicTags", cfg.custom_toxic_keywords || [], "toxic");
    }
  } catch(e) { console.error(e); }
}

// === 关键词标签 ===
function renderTags(containerId, keywords, type) {
  const container = document.getElementById(containerId);
  if (keywords.length === 0) {
    container.innerHTML = '<span style="color:#556;font-size:12px">暂无自定义关键词</span>';
    return;
  }
  container.innerHTML = keywords.map(function(k) {
    return '<span class="tag" data-type="' + type + '" data-keyword="' + k.replace(/"/g,"&quot;") + '">' + k + '<span class="del">×</span></span>';
  }).join("");
}

// 关键词删除（事件委托）
document.addEventListener("click", function(e) {
  var del = e.target.closest(".del");
  if (!del) return;
  var tag = del.closest(".tag");
  if (!tag) return;
  var type = tag.dataset.type;
  var keyword = tag.dataset.keyword;
  removeKeyword(type, keyword);
});

async function addKeyword(type) {
  const inputId = type === "spam" ? "spamKeywordInput" : "toxicKeywordInput";
  const input = document.getElementById(inputId);
  const keyword = input.value.trim();
  if (!keyword) return;
  try {
    const r = await fetch("/admin/api/keyword", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ list: type, keyword })
    });
    const d = await r.json();
    if (d.ok) {
      input.value = "";
      showToast("关键词已添加", "success");
      loadConfig();
    } else {
      showToast("添加失败", "error");
    }
  } catch(e) { showToast("网络错误", "error"); }
}

async function removeKeyword(type, keyword) {
  try {
    const r = await fetch("/admin/api/keyword", {
      method:"DELETE", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ list: type, keyword })
    });
    const d = await r.json();
    if (d.ok) {
      showToast("关键词已删除", "success");
      loadConfig();
    } else {
      showToast("删除失败", "error");
    }
  } catch(e) { showToast("网络错误", "error"); }
}

// === 保存全部 ===
async function saveAll() {
  const config = {};
  document.querySelectorAll("[data-key]").forEach(el => {
    const key = el.dataset.key;
    if (el.type === "checkbox") {
      config[key] = el.checked;
    } else if (el.type === "number") {
      config[key] = parseInt(el.value) || 0;
    } else {
      config[key] = el.value;
    }
  });
  try {
    const btn = document.querySelector(".btn-primary");
    btn.disabled = true; btn.textContent = "⏳ 保存中...";
    const chatId = document.getElementById("groupSelector").value;
    const body = chatId === "global" ? { config } : { config, chatId: parseInt(chatId) };
    const r = await fetch("/admin/api/config", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (d.ok) {
      showToast("✅ 全部设置已保存，已生效", "success");
    } else {
      showToast("保存失败", "error");
    }
    btn.disabled = false; btn.textContent = "💾 保存全部设置";
  } catch(e) { showToast("保存失败", "error"); }
}

// === 抽奖管理 ===
async function loadLotteries() {
  const container = document.getElementById("lotteryList");
  const chatId = document.getElementById("lotteryGroup").value;
  if (!chatId) {
    container.innerHTML = '<span style="color:#556;font-size:12px">请先选择群组</span>';
    return;
  }
  try {
    const r = await fetch("/admin/api/lottery?chatId=" + chatId);
    const d = await r.json();
    if (d.ok && d.lotteries.length > 0) {
      container.innerHTML = d.lotteries.map(function(l) {
        if (l.status === 'active') {
          const remaining = l.remaining > 0 ? Math.ceil(l.remaining / 60) + " 分钟" : "即将开奖";
          return '<div style="background:#0f0f1a;border-radius:8px;padding:10px;margin-bottom:6px;border-left:3px solid #4caf50">' +
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<div><b>' + l.prize + '</b> · ' + l.participants + '人参与 · ' + remaining + '</div>' +
            '<div style="display:flex;gap:4px"><button class="btn btn-primary btn-sm" onclick="drawLottery(' + l.chatId + ')">开奖</button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteLottery(' + l.chatId + ')">删除</button></div>' +
            '</div></div>';
        } else {
          const winners = l.winners && l.winners.length > 0
            ? l.winners.map(function(w, i) { return (i+1) + '. ' + w.name; }).join('、')
            : '无人参与';
          return '<div style="background:#0f0f1a;border-radius:8px;padding:10px;margin-bottom:6px;border-left:3px solid #667">' +
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<div><b>' + l.prize + '</b> <span style="background:#2a2a3e;color:#889;padding:2px 6px;border-radius:4px;font-size:11px">已开奖</span><br>' +
            '<span style="font-size:12px;color:#889">👥 ' + l.participants + '人参与</span></div>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteLottery(' + l.chatId + ')">删除记录</button>' +
            '</div>' +
            '<div style="margin-top:6px;padding:6px 8px;background:#1a1a2e;border-radius:6px;font-size:13px">' +
            '🏆 <b>中奖者:</b> ' + winners + '</div></div>';
        }
      }).join("");
    } else {
      container.innerHTML = '<span style="color:#556;font-size:12px">暂无抽奖记录</span>';
    }
  } catch(e) { container.innerHTML = '<span style="color:#e53935;font-size:12px">加载失败</span>'; }
}

async function createLottery() {
  const chatId = document.getElementById("lotteryGroup").value;
  const prize = document.getElementById("lotteryPrize").value.trim();
  const duration = parseInt(document.getElementById("lotteryDuration").value) || 5;
  const winners = parseInt(document.getElementById("lotteryWinners").value) || 1;

  if (!chatId) { showToast("请选择群组", "error"); return; }
  if (!prize) { showToast("请输入奖品名称", "error"); return; }

  const btn = document.getElementById("createLotteryBtn");
  btn.disabled = true; btn.textContent = "⏳ 创建中...";
  try {
    const r = await fetch("/admin/api/lottery", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ chatId: parseInt(chatId), prize, duration, winners })
    });
    const d = await r.json();
    if (d.ok) {
      showToast("✅ 抽奖已创建", "success");
      document.getElementById("lotteryPrize").value = "";
      loadLotteries();
    } else {
      showToast(d.error || "创建失败", "error");
    }
  } catch(e) { showToast("网络错误", "error"); }
  btn.disabled = false; btn.textContent = "🎁 发起抽奖";
}

async function drawLottery(chatId) {
  if (!confirm("确认立即开奖？")) return;
  try {
    const r = await fetch("/admin/api/lottery/draw", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ chatId })
    });
    const d = await r.json();
    if (d.ok) {
      showToast("✅ 已开奖", "success");
      loadLotteries();
    } else {
      showToast(d.error || "开奖失败", "error");
    }
  } catch(e) { showToast("网络错误", "error"); }
}

async function deleteLottery(chatId) {
  if (!confirm("确认删除此抽奖记录？")) return;
  try {
    const r = await fetch("/admin/api/lottery/delete", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ chatId })
    });
    const d = await r.json();
    if (d.ok) {
      showToast("✅ 已删除", "success");
      loadLotteries();
    } else {
      showToast("删除失败", "error");
    }
  } catch(e) { showToast("网络错误", "error"); }
}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

async function handleLogin(request, env) {
  try {
    const { password } = await request.json();
    const ok = await verifyPassword(env.BOT_DB, password);
    return Response.json(ok ? { ok: true } : { ok: false, error: "密码错误" });
  } catch (e) {
    return Response.json({ ok: false, error: "请求格式错误" });
  }
}

async function handleGetConfig(request, env) {
  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId');
  let config;
  if (chatId && chatId !== 'global') {
    config = await getGroupConfig(env.BOT_DB, parseInt(chatId));
  } else {
    config = await getConfig(env.BOT_DB);
  }
  return Response.json({ ok: true, config });
}

async function handleSaveConfig(request, env) {
  try {
    const { config, chatId } = await request.json();
    let saved;
    if (chatId) {
      saved = await saveGroupConfig(env.BOT_DB, chatId, config);
    } else {
      saved = await saveConfig(env.BOT_DB, config);
    }
    return Response.json({ ok: true, config: saved });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}

async function handleResetPassword(request, env) {
  try {
    const { oldPassword, newPassword } = await request.json();
    if (!newPassword || newPassword.length < 4) {
      return Response.json({ ok: false, error: "密码至少4个字符" });
    }
    // 验证旧密码
    const verified = await verifyPassword(env.BOT_DB, oldPassword);
    if (!verified) {
      return Response.json({ ok: false, error: "旧密码错误" });
    }
    await setPassword(env.BOT_DB, newPassword);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}

async function handleAddKeyword(request, env) {
  try {
    const { list, keyword } = await request.json();
    await addKeyword(env.BOT_DB, list, keyword);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}

async function handleRemoveKeyword(request, env) {
  try {
    const { list, keyword } = await request.json();
    await removeKeyword(env.BOT_DB, list, keyword);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}

async function handleGetGroups(request, env) {
  try {
    const groups = await getGroupList(env.BOT_DB);
    return Response.json({ ok: true, groups });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}

async function handleGetLotteries(request, env) {
  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId');
  const lotteries = await getActiveLotteries(env.BOT_DB);
  const filtered = chatId ? lotteries.filter(l => l.chatId === parseInt(chatId)) : lotteries;
  return Response.json({ ok: true, lotteries: filtered });
}

async function handleCreateLottery(request, env) {
  try {
    const { chatId, prize, duration, winners } = await request.json();
    if (!chatId || !prize) {
      return Response.json({ ok: false, error: "缺少参数" });
    }
    const result = await createLottery(env.BOT_DB, env.BOT_TOKEN, chatId, 0, prize, duration || 5, winners || 1, null, { waitUntil: () => {} });
    return Response.json({ ok: result.ok, message: result.message, error: result.ok ? undefined : result.message });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}

async function handleDrawLottery(request, env) {
  try {
    const { chatId } = await request.json();
    if (!chatId) {
      return Response.json({ ok: false, error: "缺少参数" });
    }
    const result = await forceDraw(env.BOT_DB, env.BOT_TOKEN, chatId);
    return Response.json({ ok: result.ok, message: result.message, error: result.ok ? undefined : result.message });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}

async function handleDeleteLottery(request, env) {
  try {
    const { chatId } = await request.json();
    if (!chatId) {
      return Response.json({ ok: false, error: "缺少参数" });
    }
    await deleteLotteryResult(env.BOT_DB, chatId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message });
  }
}
