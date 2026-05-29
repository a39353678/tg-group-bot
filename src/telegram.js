/**
 * Telegram API 封装
 * 提供发送消息、管理群组等功能的便捷方法
 */

const TG_API = 'https://api.telegram.org/bot';

/**
 * 调用 Telegram Bot API
 */
async function callApi(token, method, params = {}) {
  const url = `${TG_API}${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return await response.json();
}

/**
 * 发送消息
 */
export async function sendMessage(token, chatId, text, options = {}) {
  return callApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options,
  });
}

/**
 * 回复消息（直接回复某条消息）
 */
export async function replyMessage(token, chatId, messageId, text, options = {}) {
  return sendMessage(token, chatId, text, {
    reply_to_message_id: messageId,
    ...options,
  });
}

/**
 * 发送操作按钮（Inline Keyboard）
 */
export async function sendWithKeyboard(token, chatId, text, buttons, options = {}) {
  return callApi(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: JSON.stringify({ inline_keyboard: buttons }),
    ...options,
  });
}

/**
 * 删除消息
 */
export async function deleteMessage(token, chatId, messageId) {
  return callApi(token, 'deleteMessage', {
    chat_id: chatId,
    message_id: messageId,
  });
}

/**
 * 禁言成员
 * until_date: 解封时间戳（秒），不传则永远禁言
 */
export async function restrictMember(token, chatId, userId, untilDate = null) {
  const params = {
    chat_id: chatId,
    user_id: userId,
    permissions: {
      can_send_messages: false,
      can_send_media_messages: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false,
    },
  };
  if (untilDate) {
    params.until_date = untilDate;
  }
  return callApi(token, 'restrictChatMember', params);
}

/**
 * 解除禁言
 */
export async function unrestrictMember(token, chatId, userId) {
  return callApi(token, 'restrictChatMember', {
    chat_id: chatId,
    user_id: userId,
    permissions: {
      can_send_messages: true,
      can_send_media_messages: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
    },
  });
}

/**
 * 踢出成员
 */
export async function banMember(token, chatId, userId) {
  return callApi(token, 'banChatMember', {
    chat_id: chatId,
    user_id: userId,
  });
}

/**
 * 解除封禁
 */
export async function unbanMember(token, chatId, userId) {
  return callApi(token, 'unbanChatMember', {
    chat_id: chatId,
    user_id: userId,
    only_if_banned: true,
  });
}

/**
 * 获取聊天管理员列表
 */
export async function getChatAdministrators(token, chatId) {
  return callApi(token, 'getChatAdministrators', {
    chat_id: chatId,
  });
}

/**
 * 获取聊天成员信息
 */
export async function getChatMember(token, chatId, userId) {
  return callApi(token, 'getChatMember', {
    chat_id: chatId,
    user_id: userId,
  });
}

/**
 * 发送欢迎消息（针对新成员）
 */
export async function sendWelcome(token, chatId, userName) {
  const welcomeText = `👋 欢迎 <b>${userName}</b> 加入群组！\n\n` +
    `请阅读群规并遵守规则。\n` +
    `如有问题，可以输入 /help 查看帮助。`;

  return sendMessage(token, chatId, welcomeText);
}

/**
 * 设置群组权限（限制所有普通成员）
 */
export async function setChatPermissions(token, chatId, permissions) {
  return callApi(token, 'setChatPermissions', {
    chat_id: chatId,
    permissions,
  });
}

/** 全禁言权限配置（禁止所有消息） */
export const PERMISSIONS_RESTRICT_ALL = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false,
  can_manage_topics: false,
};

/** 恢复发言权限配置 */
export const PERMISSIONS_RESTORE_ALL = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
  can_change_info: false,
  can_invite_users: true,
  can_pin_messages: false,
  can_manage_topics: false,
};

/**
 * 回应回调查询（inline 按钮点击）
 */
export async function answerCallbackQuery(token, callbackQueryId, text) {
  return callApi(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

/**
 * 编辑消息文本
 */
export async function editMessageText(token, chatId, messageId, text, options = {}) {
  return callApi(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    ...options,
  });
}

/**
 * 编辑消息回复键盘
 */
export async function editMessageReplyMarkup(token, chatId, messageId, replyMarkup) {
  return callApi(token, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

/**
 * 离开群组
 */
export async function leaveChat(token, chatId) {
  return callApi(token, 'leaveChat', { chat_id: chatId });
}
