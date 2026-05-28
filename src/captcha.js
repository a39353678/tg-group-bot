/**
 * 入群验证模块 - 算术验证码
 * 新成员需计算加减法才能解除禁言
 */

import { getConfig, isFeatureEnabled } from './config.js';

// 验证码会话存储（在 Worker 内存中，使用全局 Map）
const captchaSessions = new Map();

/**
 * 生成算术验证码
 * @param {number} digits - 数字位数
 * @returns {{ question: string, answer: number }}
 */
export function generateCaptcha(digits = 2) {
  const max = Math.pow(10, digits) - 1;
  const min = Math.pow(10, digits - 1);

  const a = randInt(min, max);
  const b = randInt(min / 2, max / 2);
  const op = Math.random() > 0.5 ? '+' : '-';

  let answer;
  let displayB = b;

  if (op === '+') {
    answer = a + b;
  } else {
    // 确保结果为正数
    if (a < b) {
      displayB = a;
      answer = a - a;
    } else {
      answer = a - b;
    }
  }

  const question = `🧮 验证: ${a} ${op} ${displayB} = ?`;
  return { question, answer };
}

/**
 * 创建验证码会话
 * @returns {{ sessionId: string, question: string }}
 */
export function createCaptchaSession(chatId, userId, config) {
  const digits = config.captcha_digits || 2;
  const timeoutMin = config.captcha_timeout_min || 5;

  const { question, answer } = generateCaptcha(digits);
  const sessionId = `${chatId}:${userId}`;

  captchaSessions.set(sessionId, {
    answer,
    chatId,
    userId,
    timestamp: Date.now(),
    timeoutMs: timeoutMin * 60 * 1000,
    attempts: 0,
  });

  // 自动清理超时会话
  setTimeout(() => {
    captchaSessions.delete(sessionId);
  }, timeoutMin * 60 * 1000 + 5000);

  return { sessionId, question };
}

/**
 * 尝试验证码答案
 * @returns {{ success: boolean, message: string }}
 */
export function verifyCaptcha(chatId, userId, userAnswer) {
  const sessionId = `${chatId}:${userId}`;
  const session = captchaSessions.get(sessionId);

  if (!session) {
    return { success: false, message: '⏰ 验证码已过期，请重新加入。' };
  }

  // 检查是否超时
  if (Date.now() - session.timestamp > session.timeoutMs) {
    captchaSessions.delete(sessionId);
    return { success: false, message: '⏰ 验证超时，请重新加入。' };
  }

  // 检查尝试次数
  session.attempts++;
  if (session.attempts >= 3) {
    captchaSessions.delete(sessionId);
    return { success: false, message: '❌ 验证失败次数过多，请重新加入。' };
  }

  if (parseInt(userAnswer) === session.answer) {
    captchaSessions.delete(sessionId);
    return { success: true, message: '✅ 验证通过！欢迎加入！' };
  }

  return {
    success: false,
    message: `❌ 答案错误，还剩 ${3 - session.attempts} 次机会。`,
  };
}

/**
 * 获取验证码会话信息
 */
export function getCaptchaSession(chatId, userId) {
  const sessionId = `${chatId}:${userId}`;
  return captchaSessions.get(sessionId) || null;
}

/**
 * 检查是否需要验证码
 */
export async function needsCaptcha(env, chatId, userId) {
  const enabled = await isFeatureEnabled(env.BOT_DB, 'captcha_verification');
  if (!enabled) return false;

  const session = getCaptchaSession(chatId, userId);
  return session !== null;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 清理函数（导出用于测试）
export function _clearSessions() {
  captchaSessions.clear();
}
