/**
 * 配置管理 - 使用 D1 数据库
 * 替代之前的 KV 存储，支持多群独立配置
 */

const DEFAULT_CONFIG = {
  ai_chat: true,
  ai_chat_model: "qwen3-30b",
  ai_classification_model: "distilbert",
  spam_detection: true,
  auto_delete_spam: true,
  custom_spam_keywords: [],
  toxic_filter: true,
  custom_toxic_keywords: [],
  welcome_message: true,
  welcome_text: "👋 欢迎 {name} 加入「{group}」！\n请阅读群规，祝您愉快！",
  captcha_verification: false,
  captcha_digits: 2,
  captcha_timeout_min: 5,
  admin_commands: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  quiet_hours_block_all: true,
  quiet_hours_block_media: false,
  auto_delete_notification_seconds: 30,
};

// ======== 全局配置 ========

/**
 * 读取全局配置（合并默认值）
 */
export async function getGlobalConfig(db) {
  try {
    const row = await db.prepare("SELECT config_json FROM global_config WHERE id = 1").first();
    const data = row ? JSON.parse(row.config_json) : {};
    return { ...DEFAULT_CONFIG, ...data };
  } catch (e) {
    console.error("读取全局配置失败:", e);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 保存全局配置（合并后写入）
 */
export async function saveGlobalConfig(db, partialConfig) {
  const current = await getGlobalConfig(db);
  const merged = { ...current };
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (partialConfig[key] !== undefined) {
      merged[key] = partialConfig[key];
    }
  }
  await db.prepare(
    "INSERT INTO global_config (id, config_json, updated_at) VALUES (1, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET config_json = ?, updated_at = unixepoch()"
  ).bind(JSON.stringify(merged), JSON.stringify(merged)).run();
  return merged;
}

// ======== 群组配置 ========

/**
 * 获取指定群的配置（合并全局默认值）
 */
export async function getGroupConfig(db, chatId) {
  if (!chatId) return getGlobalConfig(db);
  try {
    const globalConfig = await getGlobalConfig(db);
    const row = await db.prepare("SELECT config_json FROM group_config WHERE chat_id = ?").first(chatId);
    const groupData = row ? JSON.parse(row.config_json) : {};
    return { ...globalConfig, ...groupData };
  } catch (e) {
    console.error(`读取群 ${chatId} 配置失败:`, e);
    return getGlobalConfig(db);
  }
}

/**
 * 保存指定群的配置
 */
export async function saveGroupConfig(db, chatId, partialConfig) {
  const current = await getGroupConfig(db, chatId);
  const merged = { ...current };
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (partialConfig[key] !== undefined) {
      merged[key] = partialConfig[key];
    }
  }
  // 只保存与全局不同的配置，减少存储
  const globalConfig = await getGlobalConfig(db);
  const diff = {};
  for (const key of Object.keys(merged)) {
    if (JSON.stringify(merged[key]) !== JSON.stringify(globalConfig[key])) {
      diff[key] = merged[key];
    }
  }
  await db.prepare(
    "INSERT INTO group_config (chat_id, config_json, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(chat_id) DO UPDATE SET config_json = ?, updated_at = unixepoch()"
  ).bind(chatId, JSON.stringify(diff), JSON.stringify(diff)).run();
  return merged;
}

// ======== 群组列表管理 ========

/**
 * 记录机器人所在的群
 */
export async function recordGroup(db, chatId, chatTitle) {
  try {
    await db.prepare(
      "INSERT INTO groups (chat_id, title, added_at) VALUES (?, ?, unixepoch()) ON CONFLICT(chat_id) DO UPDATE SET title = ?"
    ).bind(chatId, chatTitle || "未命名群组", chatTitle || "未命名群组").run();
  } catch (e) {
    console.error("记录群组失败:", e);
  }
}

/**
 * 删除指定群的配置（机器人被踢出群时清理）
 */
export async function deleteGroupConfig(db, chatId) {
  try {
    await db.prepare("DELETE FROM group_config WHERE chat_id = ?").bind(chatId).run();
    await db.prepare("DELETE FROM groups WHERE chat_id = ?").bind(chatId).run();
  } catch (e) {
    console.error(`删除群 ${chatId} 配置失败:`, e);
  }
}

/**
 * 获取机器人所在群列表
 */
export async function getGroupList(db) {
  try {
    const result = await db.prepare("SELECT chat_id AS id, title, added_at FROM groups ORDER BY added_at DESC").all();
    return result.results || [];
  } catch (e) {
    console.error("获取群列表失败:", e);
    return [];
  }
}

// ======== 功能检查（安静模式） ========

/**
 * 检查当前是否在安静时段
 */
export function isInQuietHours(config) {
  if (!config.quiet_hours_enabled) return false;
  const now = new Date();
  // Cloudflare Workers 中 Date() 返回 UTC 时间，转为北京时间 (UTC+8)
  const beijingMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 480) % 1440;
  const currentMin = beijingMinutes;
  const startParts = (config.quiet_hours_start || "22:00").split(":").map(Number);
  const endParts = (config.quiet_hours_end || "08:00").split(":").map(Number);
  const startMin = startParts[0] * 60 + (startParts[1] || 0);
  const endMin = endParts[0] * 60 + (endParts[1] || 0);

  if (startMin <= endMin) {
    return currentMin >= startMin && currentMin < endMin;
  } else {
    return currentMin >= startMin || currentMin < endMin;
  }
}

/**
 * 检查是否需要阻止该消息（基于安静模式）
 */
export function shouldBlockMessage(config, msg) {
  if (!config.quiet_hours_enabled) return false;
  if (!isInQuietHours(config)) return false;
  if (config.quiet_hours_block_all) return true;
  if (config.quiet_hours_block_media) {
    const hasMedia = !!(msg.photo || msg.video || msg.document || msg.animation || msg.audio || msg.voice);
    return hasMedia;
  }
  return false;
}

// ======== 老函数（向后兼容，默认操作全局配置） ========
export async function getConfig(db) { return getGlobalConfig(db); }
export async function saveConfig(db, partialConfig) { return saveGlobalConfig(db, partialConfig); }

// ======== 关键词管理（全局） ========

export async function addKeyword(db, listName, keyword) {
  if (!keyword || keyword.trim().length === 0) return false;
  const config = await getGlobalConfig(db);
  const key = listName === "spam" ? "custom_spam_keywords" : "custom_toxic_keywords";
  if (!config[key].includes(keyword.trim())) {
    config[key].push(keyword.trim());
    await db.prepare(
      "INSERT INTO global_config (id, config_json, updated_at) VALUES (1, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET config_json = ?, updated_at = unixepoch()"
    ).bind(JSON.stringify(config), JSON.stringify(config)).run();
  }
  return true;
}

export async function removeKeyword(db, listName, keyword) {
  const config = await getGlobalConfig(db);
  const key = listName === "spam" ? "custom_spam_keywords" : "custom_toxic_keywords";
  config[key] = config[key].filter(k => k !== keyword);
  await db.prepare(
    "INSERT INTO global_config (id, config_json, updated_at) VALUES (1, ?, unixepoch()) ON CONFLICT(id) DO UPDATE SET config_json = ?, updated_at = unixepoch()"
  ).bind(JSON.stringify(config), JSON.stringify(config)).run();
  return true;
}

// ======== 管理员密码 ========

export async function setPassword(db, password) {
  await db.prepare(
    "INSERT INTO admin_password (id, password) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET password = ?"
  ).bind(password, password).run();
}

export async function verifyPassword(db, password) {
  const row = await db.prepare("SELECT password FROM admin_password WHERE id = 1").first();
  const stored = row?.password;
  if (!stored) {
    if (password) {
      await setPassword(db, password);
      return true;
    }
    return false;
  }
  return stored === password;
}

export async function hasPassword(db) {
  const row = await db.prepare("SELECT password FROM admin_password WHERE id = 1").first();
  return !!row?.password;
}

export async function isFeatureEnabled(db, feature) {
  const config = await getGlobalConfig(db);
  return config[feature] === true;
}
