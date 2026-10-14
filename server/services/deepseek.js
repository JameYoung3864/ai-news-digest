/**
 * DeepSeek Chat API 客户端。
 * 只用 Node 内置 fetch，不引 SDK，便于审计「密钥不外泄」这条硬要求。
 */
import config from '../config.js';
import { AppError, notConfigured, upstreamError } from '../lib/errors.js';
import { fetchJson } from '../lib/httpClient.js';
import logger from '../lib/logger.js';

const ENDPOINT = '/chat/completions';

function ensureConfigured() {
  if (!config.deepseek.apiKey) {
    throw notConfigured(
      '服务端未配置 DEEPSEEK_API_KEY，AI 总结不可用。请在 .env 中设置后重启，或临时设置 AI_MOCK=1 体验界面。',
    );
  }
}

/**
 * 基础对话补全。
 * @param {{messages:Array<{role:string,content:string}>, temperature?:number, maxTokens?:number, json?:boolean}} params
 */
export async function chat({ messages, temperature = 0.3, maxTokens = 1200, json = false, label = 'deepseek' }) {
  ensureConfigured();

  const body = {
    model: config.deepseek.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  if (json) body.response_format = { type: 'json_object' };

  const started = Date.now();
  const response = await fetchJson(`${config.deepseek.baseUrl}${ENDPOINT}`, {
    label,
    method: 'POST',
    timeoutMs: Math.max(config.request.timeoutMs, 45_000),
    retry: 0,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.deepseek.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const choice = response?.choices?.[0]?.message?.content;
  if (typeof choice !== 'string' || !choice.trim()) {
    throw upstreamError('DeepSeek 返回了空内容', { finishReason: response?.choices?.[0]?.finish_reason });
  }

  logger.info('deepseek completion ok', {
    label,
    model: config.deepseek.model,
    ms: Date.now() - started,
    usage: response.usage,
  });

  return {
    content: choice,
    usage: response.usage || null,
    model: response.model || config.deepseek.model,
    latencyMs: Date.now() - started,
  };
}

/**
 * 要求模型返回 JSON 并做容错解析(模型偶尔会包 ```json 代码块)。
 */
export async function chatJson(params) {
  const result = await chat({ ...params, json: true });
  return { ...result, data: parseJsonLoose(result.content) };
}

export function parseJsonLoose(raw) {
  const text = String(raw).trim();
  const candidates = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* 继续尝试下一种 */
    }
  }
  throw new AppError('AI 返回内容无法解析为 JSON', {
    status: 502,
    code: 'AI_BAD_JSON',
    details: { preview: text.slice(0, 200) },
  });
}

export default { chat, chatJson, parseJsonLoose };
