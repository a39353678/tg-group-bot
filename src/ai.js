/**
 * Cloudflare Workers AI 集成
 * 提供 AI 聊天、内容审核、垃圾消息检测等功能
 * 支持多种模型切换
 *
 * 模型列表来源: https://developers.cloudflare.com/workers-ai/models/
 * 仅包含活跃、未弃用的模型
 */

// 可用的 AI 对话模型列表
const CHAT_MODELS = {
  // ========== 中文优化（推荐） ==========
  "qwen3-30b":          "@cf/qwen/qwen3-30b-a3b-fp8",
  "glm-4.7-flash":      "@cf/zai-org/glm-4.7-flash",
  "kimi-k2.6":          "@cf/moonshotai/kimi-k2.6",
  "deepseek-r1-32b":    "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "qwq-32b":            "@cf/qwen/qwq-32b",
  "qwen2.5-coder-32b":  "@cf/qwen/qwen2.5-coder-32b-instruct",

  // ========== 通用模型 ==========
  "llama-4-scout":      "@cf/meta/llama-4-scout-17b-16e-instruct",
  "llama-3.3-70b":      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "llama-3.1-8b":       "@cf/meta/llama-3.1-8b-instruct-fp8",
  "llama-3.2-3b":       "@cf/meta/llama-3.2-3b-instruct",
  "llama-3.2-1b":       "@cf/meta/llama-3.2-1b-instruct",
  "mistral-small-3.1":  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "gemma-4-26b":        "@cf/google/gemma-4-26b-a4b-it",
  "gpt-oss-20b":        "@cf/openai/gpt-oss-20b",
};

// 可用的分类模型列表
const CLASSIFICATION_MODELS = {
  "distilbert": "@cf/huggingface/distilbert-sst-2-int8",
};

/**
 * 获取模型完整名称
 */
function getChatModel(name) {
  return CHAT_MODELS[name] || CHAT_MODELS["qwen3-30b"];
}

function getClassificationModel(name) {
  return CLASSIFICATION_MODELS[name] || CLASSIFICATION_MODELS["distilbert"];
}

/**
 * AI 对话回复
 * 让 AI 根据群组上下文回答问题
 */
export async function aiChat(ai, message, chatTitle, modelName) {
  const model = getChatModel(modelName);
  const systemPrompt = `你是一个Telegram群"${chatTitle}"的智能助手。请用友好、专业的态度回答群成员的问题。
要求：
- 使用中文回答
- 回答简洁明了
- 如果不确定，如实说不知道
- 不要回答违法或不当内容
- 对于日常聊天可以适当活泼`;

  let result;
  try {
    result = await ai.run(model, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 512,
      temperature: 0.7,
    });
  } catch (e) {
    console.error('AI run error:', e);
    // 如果模型不可用，尝试用默认模型重试
    if (modelName && modelName !== 'qwen3-30b') {
      console.log('重试默认模型 qwen3-30b');
      result = await ai.run(CHAT_MODELS['qwen3-30b'], {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        max_tokens: 512,
        temperature: 0.7,
      });
    } else {
      throw e;
    }
  }

  // 兼容不同模型的返回格式
  const answer = result?.response?.trim()
    || result?.choices?.[0]?.message?.content?.trim()
    || result?.generated_text?.trim()
    || result?.result?.response?.trim()
    || '';

  if (!answer) {
    // 调试：记录返回的字段名，方便排查
    const keys = result ? Object.keys(result).join(', ') : 'result为空';
    console.error('AI返回为空，字段:', keys);
    return '抱歉，我现在无法回答，请稍后再试。';
  }

  return answer;
}

/**
 * 检测消息是否为垃圾/广告消息
 * 返回: { isSpam: boolean, confidence: number, reason: string }
 */
export async function detectSpam(ai, text, modelName) {
  // 简单的规则预检（快速过滤明显内容）
  const spamPatterns = [
    /\b(赌[博博]|彩[票]|六[合]|投注|下注|盘口)\b/i,
    /\b(裸聊|色情|A[片]|成人[网站]?)\b/i,
    /\b(刷[赞粉]|涨粉|代[挂刷])\b/i,
    /(\+?\d[\d\- ]{7,}\d)/g,  // 疑似电话号码
    /(t\.me\/|https?:\/\/)\S*(赌|博|彩|色|裸)/i,
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(text)) {
      return {
        isSpam: true,
        confidence: 0.95,
        reason: '命中垃圾信息关键字规则',
      };
    }
  }

  // 使用 AI 进行更深度的检测（长文本或可疑但不确定的情况）
  if (text.length > 20) {
    try {
      const model = getClassificationModel(modelName);
      const result = await ai.run(model, {
        text: `判断以下消息是否为垃圾广告：\n---\n${text.substring(0, 500)}\n---\n只回答 spam 或 not_spam`,
      });

      // 模型返回结果判断
      const label = result?.label || '';
      const score = result?.score || 0;

      if (label === 'NEGATIVE' && score > 0.9) {
        return {
          isSpam: true,
          confidence: score,
          reason: 'AI 检测为疑似垃圾消息',
        };
      }
    } catch (e) {
      console.error('AI spam detection error:', e);
    }
  }

  return {
    isSpam: false,
    confidence: 0,
    reason: '',
  };
}

/**
 * 检测消息内容是否不当（需要管理员审核）
 * 返回: { isToxic: boolean, reason: string }
 */
export async function detectToxicContent(ai, text) {
  const toxicKeywords = [
    '傻逼', '操你妈', 'fuck', 'shit', '他妈',
    '草泥马', '尼玛', 'SB', 'cnm', 'nmsl',
    // 政治敏感
    '法轮功', '天安门',
    // 极端
    '自杀', '炸弹',
  ];

  for (const keyword of toxicKeywords) {
    if (text.toLowerCase().includes(keyword.toLowerCase())) {
      return {
        isToxic: true,
        reason: `包含不当关键词`,
        level: 'warn',
      };
    }
  }

  return { isToxic: false, reason: '', level: 'clean' };
}

export { CHAT_MODELS, CLASSIFICATION_MODELS };
