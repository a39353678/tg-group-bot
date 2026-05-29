/**
 * 消息处理器
 * 处理所有 Telegram 更新事件：命令、普通消息、新成员等
 */

import {
  sendMessage, replyMessage,
  deleteMessage, restrictMember, banMember, unbanMember,
  unrestrictMember, getChatAdministrators, sendWelcome,
  setChatPermissions, PERMISSIONS_RESTRICT_ALL, PERMISSIONS_RESTORE_ALL,
} from './telegram';
import { aiChat, detectSpam, detectToxicContent } from './ai';
import { getGroupConfig, saveGroupConfig, getConfig, shouldBlockMessage, recordGroup, deleteGroupConfig } from './config.js';
import { createCaptchaSession, verifyCaptcha, getCaptchaSession } from './captcha.js';
import { createLottery, forceDraw, handleLotteryCallback } from './lottery.js';

/**
 * 处理来自 Telegram 的更新
 */
export async function handleUpdate(update, env, ctx) {
  const { BOT_TOKEN: token } = env;

  // --- 处理消息 ---
  if (update.message) {
    await handleMessage(update.message, env, ctx);
    return;
  }

  // --- 处理新成员加入 ---
  if (update.chat_member) {
    await handleChatMember(update.chat_member, env);
    return;
  }

  // --- 处理被加入群组 ---
  if (update.my_chat_member) {
    await handleMyChatMember(update.my_chat_member, env);
    return;
  }

  // --- 处理按钮点击（抽奖参与等） ---
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env, ctx);
    return;
  }
}

/**
 * 处理消息
 */
async function handleMessage(msg, env, ctx) {
  const { BOT_TOKEN: token, AI: ai, BOT_DB: db } = env;
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const userName = msg.from?.first_name || '用户';
  const text = msg.text || msg.caption || '';
  const messageId = msg.message_id;

  // 忽略机器人自己的消息
  if (msg.from?.is_bot) return;

  // 检测群名变更，更新记录
  if (chatId < 0 && msg.new_chat_title) {
    await recordGroup(db, chatId, msg.new_chat_title);
  }

  // 读取该群的独立配置
  const config = await getGroupConfig(db, chatId);

  // 自动检查：安静模式是否已过结束时间，若是则自动恢复发言权限
  if (config.quiet_hours_enabled) {
    await autoRestoreQuietIfExpired(token, db, chatId, config);
  }

  // === 安静模式检测（优先于一切） ===
  if (chatId < 0 && config.quiet_hours_enabled) {
    const shouldBlock = shouldBlockMessage(config, msg);
    if (shouldBlock) {
      try {
        await deleteMessage(token, chatId, messageId);
        const reason = config.quiet_hours_block_all
          ? '当前为安静时段，群聊已关闭'
          : '当前为安静时段，禁止发送媒体文件';
        await sendNotification(token, chatId,
          `🔇 <b>${userName}</b> ${reason}（${config.quiet_hours_start}-${config.quiet_hours_end}）`,
          config, ctx
        );
      } catch (e) { /* 忽略删除失败 */ }
      return;
    }
  }

  // === 命令处理 ===
  // 支持 /command 和 @bot /command 两种格式
  let cmdText = text;
  if (!cmdText.startsWith('/') && cmdText.includes(' /')) {
    // 提取 @bot 后面的 /command
    const parts = text.split(' ');
    const cmdIndex = parts.findIndex(p => p.startsWith('/'));
    if (cmdIndex >= 0) {
      cmdText = parts.slice(cmdIndex).join(' ');
    }
  }
  if (cmdText.startsWith('/')) {
    const [command, ...args] = cmdText.split(' ');
    const cmd = command.toLowerCase();

    switch (cmd) {
      case '/start':
        await handleStart(token, chatId, messageId);
        return;

      case '/help':
        await handleHelp(token, chatId, messageId, config);
        return;

      case '/ai':
      case '/ask':
        if (!config.ai_chat) {
          await replyMessage(token, chatId, messageId, '⚠️ AI 对话功能已关闭。');
          return;
        }
        await handleAIQuery(token, chatId, messageId, args.join(' '), ai, msg.chat.title || '群组', config.ai_chat_model);
        return;

      case '/ban':
      case '/kick':
      case '/mute':
      case '/unmute':
        if (!config.admin_commands) {
          await replyMessage(token, chatId, messageId, '⚠️ 管理命令功能已关闭。');
          return;
        }
        if (cmd === '/ban') await handleBan(token, chatId, userId, msg, args, config, ctx);
        else if (cmd === '/kick') await handleKick(token, chatId, userId, msg, args, config, ctx);
        else if (cmd === '/mute') await handleMute(token, chatId, userId, msg, args, config, ctx);
        else if (cmd === '/unmute') await handleUnmute(token, chatId, userId, msg, config, ctx);
        return;

      case '/ping':
        await replyMessage(token, chatId, messageId, '🏓 Pong！机器人运行正常。');
        return;

      case '/quiet':
      case '/安静模式':
        if (!config.admin_commands) {
          await replyMessage(token, chatId, messageId, '⚠️ 管理命令功能已关闭。');
          return;
        }
        await handleQuietMode(token, db, chatId, userId, messageId, config, ctx);
        return;

      case '/lottery':
      case '/抽奖':
        if (!config.admin_commands) {
          await replyMessage(token, chatId, messageId, '⚠️ 管理命令功能已关闭。');
          return;
        }
        await handleLotteryCmd(token, db, chatId, userId, msg, args, config, ctx);
        return;

      case '/draw':
      case '/开奖':
        if (!config.admin_commands) {
          await replyMessage(token, chatId, messageId, '⚠️ 管理命令功能已关闭。');
          return;
        }
        await handleDrawCmd(token, db, chatId, userId, msg, config, ctx);
        return;

      case '/about':
        await sendMessage(token, chatId,
          `🤖 <b>TG群管理机器人</b>\n\n` +
          `基于 Cloudflare Workers + AI 构建\n` +
          `版本: 1.0.0\n` +
          `功能: AI 问答 · 垃圾检测 · 群管理`
        );
        return;

      default:
        return;
    }
  }

  // === 群组消息处理 ===
  if (chatId < 0) {
    // 0. 检查验证码（用户需先通过验证才能发言）
    if (config.captcha_verification) {
      const session = getCaptchaSession(chatId, userId);
      if (session) {
        // 用户正在验证中，检查是否在回答验证码
        const result = verifyCaptcha(chatId, userId, text.trim());
        if (result.success) {
          await unrestrictMember(token, chatId, userId);
          await replyMessage(token, chatId, messageId, '✅ 验证通过！欢迎加入，现在可以发言了。');
        } else {
          await replyMessage(token, chatId, messageId, result.message);
          // 如果超过尝试次数，踢出
          if (result.message.includes('失败次数过多') || result.message.includes('已过期')) {
            await banMember(token, chatId, userId);
            await unbanMember(token, chatId, userId);
          }
        }
        return;
      }
    }

    // 1. 自定义关键词拦截
    if (text) {
      // 垃圾关键词
      if (config.custom_spam_keywords?.length > 0) {
        for (const kw of config.custom_spam_keywords) {
          if (text.toLowerCase().includes(kw.toLowerCase())) {
            if (config.auto_delete_spam) await deleteMessage(token, chatId, messageId);
            await sendNotification(token, chatId,
              `⚠️ <b>${userName}</b> 消息命中垃圾关键词，${config.auto_delete_spam ? '已删除' : '请注意'}。`,
              config, ctx
            );
            return;
          }
        }
      }
      // 敏感关键词
      if (config.custom_toxic_keywords?.length > 0) {
        for (const kw of config.custom_toxic_keywords) {
          if (text.toLowerCase().includes(kw.toLowerCase())) {
            await deleteMessage(token, chatId, messageId);
            await sendNotification(token, chatId,
              `⚠️ 成员 <b>${userName}</b> 的消息因包含敏感词已被删除。`,
              config, ctx
            );
            return;
          }
        }
      }
    }

    // 2. AI 对话
    if (config.ai_chat && (msg.entities || msg.reply_to_message?.from?.is_bot)) {
      const isMentioned = msg.entities?.some(e => e.type === 'mention');
      if (isMentioned || msg.reply_to_message?.from?.is_bot) {
        const cleanText = text.replace(/@\w+/g, '').trim();
        if (cleanText) {
          await handleAIQuery(token, chatId, messageId, cleanText, ai, msg.chat.title || '群组', config.ai_chat_model);
          return;
        }
      }
    }

    // 3. AI 垃圾消息检测（如果消息包含 @提及 则跳过，避免误判）
    if (config.spam_detection && text && text.length > 5 && !msg.entities?.some(e => e.type === 'mention')) {
      const spamResult = await detectSpam(ai, text, config.ai_classification_model);
      if (spamResult.isSpam) {
        if (config.auto_delete_spam) {
          await deleteMessage(token, chatId, messageId);
        }
        await sendNotification(token, chatId,
          `⚠️ <b>${userName}</b> 你的消息被判定为垃圾广告${config.auto_delete_spam ? '，已被删除' : ''}。\n` +
          `原因: ${spamResult.reason}`,
          config, ctx
        );
        return;
      }
    }

    // 4. 不当内容过滤
    if (config.toxic_filter && text) {
      const toxicResult = await detectToxicContent(ai, text);
      if (toxicResult.isToxic) {
        await deleteMessage(token, chatId, messageId);
        await sendNotification(token, chatId,
          `⚠️ 成员 <b>${userName}</b> 的消息因包含不当内容已被删除。`,
          config, ctx
        );
        return;
      }
    }
  }
}

/**
 * 处理新成员加入
 */
async function handleChatMember(cm, env) {
  const { BOT_TOKEN: token, BOT_DB: db } = env;
  const chatId = cm.chat.id;
  const newUser = cm.new_chat_member;

  if (newUser.status !== 'member') return;
  if (newUser.user.is_bot) return;

  const name = newUser.user.first_name || '新成员';
  const config = await getGroupConfig(db, chatId);

  // 入群验证码
  if (config.captcha_verification) {
    try {
      // 先禁言用户
      await restrictMember(token, chatId, newUser.user.id);
      const { question } = createCaptchaSession(chatId, newUser.user.id, config);
      await sendMessage(token, chatId,
        `🧮 <b>入群验证</b>\n\n` +
        `欢迎 <b>${name}</b>！请在 ${config.captcha_timeout_min || 5} 分钟内回答以下问题以解除禁言：\n\n` +
        `${question}\n\n` +
        `💡 直接输入答案即可，共 3 次机会。`
      );
    } catch (e) {
      console.error('验证码发送失败:', e);
    }
    return;
  }

  // 欢迎消息
  if (config.welcome_message) {
    let welcomeText = config.welcome_text || '👋 欢迎 {name} 加入「{group}」！';
    const groupName = cm.chat.title || '群组';
    welcomeText = welcomeText.replace(/\{name\}/g, name).replace(/\{group\}/g, groupName);
    await sendMessage(token, chatId, welcomeText);
  }
}

/**
 * 处理机器人自己被加入群组
 */
async function handleMyChatMember(mcm, env) {
  const { BOT_TOKEN: token, BOT_DB: db } = env;
  const chatId = mcm.chat.id;
  const newStatus = mcm.new_chat_member.status;

  // 记录群组
  if (mcm.chat.type === 'group' || mcm.chat.type === 'supergroup') {
    await recordGroup(db, chatId, mcm.chat.title);
  }

  if (newStatus === 'member' || newStatus === 'administrator') {
    const chatName = mcm.chat.title || '未知群组';
    await sendMessage(token, chatId,
      `👋 大家好！我是 AI 群管理机器人，已加入 <b>${chatName}</b>\n\n` +
      `输入 /help 查看我能做什么！`
    );
  }

  // 机器人被踢出或离开群组时，清理该群配置
  if (newStatus === 'left' || newStatus === 'kicked') {
    await deleteGroupConfig(db, chatId);
    console.log(`已清理群 ${chatId}（${mcm.chat.title || '未知'}）的配置数据`);
  }
}

// ========== 命令处理函数 ==========

/**
 * /start - 开始使用
 */
async function handleStart(token, chatId, messageId) {
  await replyMessage(token, chatId, messageId,
    `👋 <b>欢迎使用 TG 群管理机器人！</b>\n\n` +
    `我是一个基于 <b>Cloudflare Workers AI</b> 的智能群管理机器人，` +
    `支持 AI 对话、垃圾消息检测、群组管理等功能。\n\n` +
    `把我添加到你的群组并设为管理员，我就可以开始工作了！\n\n` +
    `输入 /help 查看所有命令。`
  );
}

/**
 * /help - 帮助信息
 */
async function handleHelp(token, chatId, messageId, config) {
  const aiStatus = config?.ai_chat ? '✅' : '❌';
  const spamStatus = config?.spam_detection ? '✅' : '❌';
  const toxicStatus = config?.toxic_filter ? '✅' : '❌';
  const adminStatus = config?.admin_commands ? '✅' : '❌';
  const welcomeStatus = config?.welcome_message ? '✅' : '❌';

  const helpText =
    `📖 <b>帮助菜单</b>\n\n` +
    `<b>🤖 AI 功能</b> ${aiStatus}\n` +
    `/ai <i>问题</i> - 让 AI 回答问题\n` +
    `/ask <i>问题</i> - 同上\n` +
    `在群中 @机器人 + 问题 也可触发 AI\n\n` +
    `<b>🛡️ 群管理</b> ${adminStatus}\n` +
    `/ban <i>回复消息</i> - 封禁用户\n` +
    `/kick <i>回复消息</i> - 踢出用户\n` +
    `/mute <i>回复消息 [分钟]</i> - 禁言用户\n` +
    `/unmute <i>回复消息</i> - 解除禁言\n\n` +
    `<b>🔍 自动检测</b>\n` +
    `垃圾检测: ${spamStatus} | 内容过滤: ${toxicStatus}\n` +
    `欢迎消息: ${welcomeStatus}\n\n` +
    `<b>🧮 入群验证</b>\n` +
    `验证码: ${config?.captcha_verification ? '✅ 已开启' : '❌ 已关闭'}\n\n` +
    `<b>ℹ️ 其他</b>\n` +
    `/about - 关于机器人\n` +
    `/ping - 检查机器人状态\n\n` +
    `<b>⚙️ 管理面板:</b> 访问 Worker 域名 /admin 进行配置`;

  await replyMessage(token, chatId, messageId, helpText);
}

/**
 * /ai 或 /ask - AI 对话
 */
async function handleAIQuery(token, chatId, messageId, question, ai, chatTitle, modelName) {
  if (!question) {
    await replyMessage(token, chatId, messageId,
      `请告诉我你想问什么？\n` +
      `例如: /ai 今天天气怎么样？`
    );
    return;
  }

  try {
    const answer = await aiChat(ai, question, chatTitle, modelName);
    await sendMessage(token, chatId, `🤖 <b>AI 回答:</b>\n\n${answer}`);
  } catch (error) {
    console.error('AI chat error:', error);
    await sendMessage(token, chatId,
      `❌ AI 回答失败: ${error.message || '未知错误'}\n` +
      `请稍后再试。`
    );
  }
}

/**
 * /ban - 封禁用户
 */
async function handleBan(token, chatId, adminId, msg, args, config, ctx) {
  // 检查是否回复了消息
  if (!msg.reply_to_message) {
    await replyNotification(token, chatId, msg.message_id,
      '⚠️ 请回复你要封禁的用户的消息。\n用法: /ban (回复某条消息)',
      config, ctx
    );
    return;
  }

  // 检查管理员权限
  const isAdmin = await checkAdmin(token, chatId, adminId);
  if (!isAdmin) {
    await replyNotification(token, chatId, msg.message_id, '⛔ 你没有权限执行此操作（需要管理员权限）。', config, ctx);
    return;
  }

  const targetUser = msg.reply_to_message.from;
  await banMember(token, chatId, targetUser.id);
  await replyNotification(token, chatId, msg.message_id,
    `🔨 用户 <b>${targetUser.first_name}</b> 已被封禁。`,
    config, ctx
  );
}

/**
 * /kick - 踢出用户
 */
async function handleKick(token, chatId, adminId, msg, args, config, ctx) {
  if (!msg.reply_to_message) {
    await replyNotification(token, chatId, msg.message_id,
      '⚠️ 请回复你要踢出的用户的消息。',
      config, ctx
    );
    return;
  }

  const isAdmin = await checkAdmin(token, chatId, adminId);
  if (!isAdmin) {
    await replyNotification(token, chatId, msg.message_id, '⛔ 你没有权限执行此操作。', config, ctx);
    return;
  }

  const targetUser = msg.reply_to_message.from;
  await banMember(token, chatId, targetUser.id);
  // 立即解封，效果等同于踢出
  await unbanMember(token, chatId, targetUser.id);
  await replyNotification(token, chatId, msg.message_id,
    `👢 用户 <b>${targetUser.first_name}</b> 已被移出群组。`,
    config, ctx
  );
}

/**
 * /mute - 禁言用户
 */
async function handleMute(token, chatId, adminId, msg, args, config, ctx) {
  if (!msg.reply_to_message) {
    await replyNotification(token, chatId, msg.message_id, '⚠️ 请回复你要禁言的用户的消息。', config, ctx);
    return;
  }

  const isAdmin = await checkAdmin(token, chatId, adminId);
  if (!isAdmin) {
    await replyNotification(token, chatId, msg.message_id, '⛔ 你没有权限执行此操作。', config, ctx);
    return;
  }

  // 默认为 30 分钟
  let minutes = parseInt(args[0]) || 30;
  if (minutes > 43200) minutes = 43200; // 最长 30天

  const untilDate = Math.floor(Date.now() / 1000) + minutes * 60;
  const targetUser = msg.reply_to_message.from;

  await restrictMember(token, chatId, targetUser.id, untilDate);
  await replyNotification(token, chatId, msg.message_id,
    `🔇 用户 <b>${targetUser.first_name}</b> 已被禁言 ${minutes} 分钟。`,
    config, ctx
  );
}

/**
 * /unmute - 解除禁言
 */
async function handleUnmute(token, chatId, adminId, msg, config, ctx) {
  if (!msg.reply_to_message) {
    await replyNotification(token, chatId, msg.message_id, '⚠️ 请回复你要解除禁言的用户的消息。', config, ctx);
    return;
  }

  const isAdmin = await checkAdmin(token, chatId, adminId);
  if (!isAdmin) {
    await replyNotification(token, chatId, msg.message_id, '⛔ 你没有权限执行此操作。', config, ctx);
    return;
  }

  const targetUser = msg.reply_to_message.from;
  await unrestrictMember(token, chatId, targetUser.id);
  await replyNotification(token, chatId, msg.message_id,
    `🔊 用户 <b>${targetUser.first_name}</b> 已被解除禁言。`,
    config, ctx
  );
}

/**
 * /quiet 或 /安静模式 - 切换安静模式（使用 setChatPermissions 限制全员发言）
 */
async function handleQuietMode(token, db, chatId, userId, messageId, config, ctx) {
  if (chatId > 0) {
    await replyMessage(token, chatId, messageId, '⚠️ 该命令只能在群组中使用。');
    return;
  }

  const isAdmin = await checkAdmin(token, chatId, userId);
  if (!isAdmin) {
    await replyNotification(token, chatId, messageId, '⛔ 你没有权限执行此操作（需要管理员权限）。', config, ctx);
    return;
  }

  const newStatus = !config.quiet_hours_enabled;

  if (newStatus) {
    // === 开启安静模式 ===
    // 限制所有普通成员的发言权限
    await setChatPermissions(token, chatId, PERMISSIONS_RESTRICT_ALL);

    // 计算到结束时间需要等待的毫秒数
    const now = new Date();
    const beijingNow = (now.getUTCHours() * 60 + now.getUTCMinutes() + 480) % 1440;
    const endParts = (config.quiet_hours_end || "08:00").split(":").map(Number);
    let endMin = endParts[0] * 60 + (endParts[1] || 0);
    // 如果结束时间 <= 现在，说明是次日
    if (endMin <= beijingNow) endMin += 1440;
    const delayMs = (endMin - beijingNow) * 60 * 1000;

    // 保存配置状态
    await saveGroupConfig(db, chatId, { quiet_hours_enabled: true });

    await replyNotification(token, chatId, messageId,
      `🔇 安静模式已 <b>开启</b>\n` +
      `普通成员已限制发言，将在 ${config.quiet_hours_end} 自动恢复。\n\n` +
      `管理员可随时输入 /安静模式 手动关闭。`,
      config, ctx
    );

    // 计划自动恢复发言权限
    ctx.waitUntil((async () => {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      try {
        // 恢复发言权限
        await setChatPermissions(token, chatId, PERMISSIONS_RESTORE_ALL);
        // 更新配置状态
        await saveGroupConfig(db, chatId, { quiet_hours_enabled: false });
        await sendMessage(token, chatId, '🔊 安静模式已自动关闭，现在可以发言了。');
      } catch (e) {
        console.error('自动恢复发言权限失败:', e);
      }
    })());
  } else {
    // === 关闭安静模式 ===
    await setChatPermissions(token, chatId, PERMISSIONS_RESTORE_ALL);

    await saveGroupConfig(db, chatId, { quiet_hours_enabled: false });

    await replyNotification(token, chatId, messageId,
      '🔊 安静模式已 <b>关闭</b>，现在可以发言了。',
      config, ctx
    );
  }
}

// ========== 抽奖功能 ==========

/**
 * /lottery 或 /抽奖 - 创建新抽奖（解析参数后委托 lottery.js）
 */
async function handleLotteryCmd(token, db, chatId, userId, msg, args, config, ctx) {
  if (chatId > 0) {
    await replyMessage(token, chatId, msg.message_id, '⚠️ 该命令只能在群组中使用。');
    return;
  }
  const isAdmin = await checkAdmin(token, chatId, userId);
  if (!isAdmin) {
    await replyNotification(token, chatId, msg.message_id, '⛔ 你没有权限创建抽奖（需要管理员权限）。', config, ctx);
    return;
  }
  if (args.length === 0) {
    await replyNotification(token, chatId, msg.message_id,
      '📋 用法: /抽奖 奖品名称 [时长分钟] [中奖人数]\n示例: /抽奖 红包 10 3', config, ctx);
    return;
  }

  let prize = args[0];
  let durationMin = 5;
  let winnerCount = 1;
  if (args.length >= 2) {
    const num2 = parseInt(args[1]);
    if (!isNaN(num2) && num2 > 0) {
      durationMin = num2;
    } else {
      prize = args.slice(0, 2).join(' ');
      if (args.length >= 3) {
        const num3 = parseInt(args[2]);
        if (!isNaN(num3) && num3 > 0) durationMin = num3;
      }
    }
  }
  if (args.length >= 3) {
    const lastNum = parseInt(args[args.length - 1]);
    if (!isNaN(lastNum) && lastNum > 0) winnerCount = lastNum;
  }

  const result = await createLottery(db, token, chatId, userId, prize, durationMin, winnerCount, msg.from, ctx);
  if (result.ok) {
    await deleteMessage(token, chatId, msg.message_id);
  } else {
    await replyNotification(token, chatId, msg.message_id, `⚠️ ${result.message}`, config, ctx);
  }
}

/**
 * /draw 或 /开奖 - 手动开奖
 */
async function handleDrawCmd(token, db, chatId, userId, msg, config, ctx) {
  if (chatId > 0) {
    await replyMessage(token, chatId, msg.message_id, '⚠️ 该命令只能在群组中使用。');
    return;
  }
  const isAdmin = await checkAdmin(token, chatId, userId);
  if (!isAdmin) {
    await replyNotification(token, chatId, msg.message_id, '⛔ 你没有权限执行此操作（需要管理员权限）。', config, ctx);
    return;
  }
  const result = await forceDraw(db, token, chatId);
  if (!result.ok) {
    await replyNotification(token, chatId, msg.message_id, `⚠️ ${result.message}`, config, ctx);
  } else {
    await deleteMessage(token, chatId, msg.message_id);
  }
}

/**
 * 处理 callback_query（委托给 lottery.js）
 */
async function handleCallbackQuery(callbackQuery, env) {
  const { BOT_TOKEN: token, BOT_DB: db } = env;
  try {
    await handleLotteryCallback(db, token, callbackQuery);
  } catch (e) {
    console.error('[handler] callback error:', e.message);
  }
}

/**
 * 自动检查安静模式是否已过结束时间，若过期则恢复发言权限
 * 解决 ctx.waitUntil 无法支持长时间定时器的问题
 */
async function autoRestoreQuietIfExpired(token, db, chatId, config) {
  try {
    const now = new Date();
    const beijingNow = (now.getUTCHours() * 60 + now.getUTCMinutes() + 480) % 1440;
    const endParts = (config.quiet_hours_end || "08:00").split(":").map(Number);
    const endMin = endParts[0] * 60 + (endParts[1] || 0);
    const startParts = (config.quiet_hours_start || "22:00").split(":").map(Number);
    const startMin = startParts[0] * 60 + (startParts[1] || 0);

    // 判断当前是否已过结束时间（不在安静时段内）
    let isPastEnd;
    if (startMin <= endMin) {
      // 同一天: 22:00~08:00 这种跨天情况不会到这里
      isPastEnd = beijingNow >= endMin;
    } else {
      // 跨天: 22:00~08:00，当前时间在 08:00~22:00 之间就是非安静时段
      isPastEnd = beijingNow >= endMin && beijingNow < startMin;
    }

    if (isPastEnd) {
      // 恢复发言权限
      await setChatPermissions(token, chatId, PERMISSIONS_RESTORE_ALL);
      await saveGroupConfig(db, chatId, { quiet_hours_enabled: false });
      console.log(`安静模式自动恢复：群 ${chatId} 已过结束时间 ${config.quiet_hours_end}`);
    }
  } catch (e) {
    console.error('自动恢复安静模式失败:', e);
  }
}

// ========== 通知自动删除辅助函数 ==========

/**
 * 发送通知消息并支持自动删除
 */
async function sendNotification(token, chatId, text, config, ctx) {
  const result = await sendMessage(token, chatId, text);
  await scheduleAutoDelete(token, chatId, result, config, ctx);
  return result;
}

/**
 * 回复通知消息并支持自动删除
 */
async function replyNotification(token, chatId, messageId, text, config, ctx) {
  const result = await replyMessage(token, chatId, messageId, text);
  await scheduleAutoDelete(token, chatId, result, config, ctx);
  return result;
}

/**
 * 如果配置了自动删除时间，计划删除消息
 */
async function scheduleAutoDelete(token, chatId, result, config, ctx) {
  const seconds = config.auto_delete_notification_seconds;
  if (seconds > 0 && result?.result?.message_id) {
    const msgId = result.result.message_id;
    ctx.waitUntil((async () => {
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      try {
        await deleteMessage(token, chatId, msgId);
      } catch (e) { /* 忽略删除失败 */ }
    })());
  }
}

// ========== 工具函数 ==========

/**
 * 检查用户是否为群管理员
 */
async function checkAdmin(token, chatId, userId) {
  try {
    const result = await getChatAdministrators(token, chatId);
    if (result.ok) {
      return result.result.some(admin => admin.user.id === userId);
    }
  } catch (e) {
    console.error('checkAdmin error:', e);
  }
  return false;
}
