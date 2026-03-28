import fs from "node:fs/promises";
import path from "node:path";

export const cwd = process.cwd();

export async function loadLocalEnv(envFile) {
  const envPath = envFile ? path.resolve(envFile) : path.join(cwd, ".env.local");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // Fall back to the process environment when no env file exists.
  }
}

export function getBaseUrl(explicitBaseUrl, fallback = "https://openrouter.ai/api/v1") {
  return (explicitBaseUrl || process.env.OPENROUTER_BASE_URL || fallback).replace(/\/$/, "");
}

export function getApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw createScriptError("config_error", "missing_api_key", "Missing OPENROUTER_API_KEY.", {
      hint: "Set OPENROUTER_API_KEY in your environment or .env.local.",
    });
  }
  return apiKey;
}

export function resolveModel({ explicitModel, taskType, fallbackModel }) {
  if (explicitModel) return explicitModel;
  if (taskType === "chat" && process.env.OPENROUTER_CHAT_MODEL) {
    return process.env.OPENROUTER_CHAT_MODEL;
  }
  if ((taskType === "image-generate" || taskType === "image-edit") && process.env.OPENROUTER_IMAGE_MODEL) {
    return process.env.OPENROUTER_IMAGE_MODEL;
  }
  return process.env.OPENROUTER_MODEL || fallbackModel || null;
}

export async function readPrompt({ prompt, promptFile }) {
  const finalPrompt = prompt || (promptFile ? await fs.readFile(path.resolve(promptFile), "utf8") : "");
  const trimmed = finalPrompt.trim();
  if (!trimmed) {
    throw createScriptError("config_error", "missing_prompt", "Missing prompt. Pass --prompt or --prompt-file.");
  }
  return trimmed;
}

export function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export async function imageFileToDataUrl(filePath) {
  const resolved = path.resolve(filePath);
  const base64 = await fs.readFile(resolved, "base64");
  return `data:${mimeTypeFor(resolved)};base64,${base64}`;
}

export function createScriptError(type, code, message, extra = {}) {
  const error = new Error(message);
  error.type = type;
  error.code = code;
  error.details = extra;
  return error;
}

export async function requestJson({ url, apiKey, body }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw createScriptError("provider_error", "request_failed", `OpenRouter request failed with status ${response.status}.`, {
      provider_status: response.status,
      raw,
      json,
      url,
    });
  }

  return json ?? {};
}

export async function requestGetJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  const raw = await response.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw createScriptError("provider_error", "request_failed", `OpenRouter request failed with status ${response.status}.`, {
      provider_status: response.status,
      raw,
      json,
      url,
    });
  }

  return json ?? {};
}

export function extractTextContent(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text || "";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function extractImagePayload(message) {
  const images = [];

  for (const image of message?.images ?? []) {
    const url = image?.image_url?.url || image?.imageUrl?.url || null;
    if (url) {
      images.push({
        url,
        mime_type: url.startsWith("data:") ? url.slice(5).split(";", 1)[0] : null,
      });
    }
  }

  for (const item of message?.content ?? []) {
    const url = item?.image_url?.url || item?.imageUrl?.url || null;
    if (url) {
      images.push({
        url,
        mime_type: url.startsWith("data:") ? url.slice(5).split(";", 1)[0] : null,
      });
    }
  }

  return images;
}

export async function saveFirstDataUrlImage(images, { outputDir, outputName }) {
  const first = images.find((item) => typeof item.url === "string" && item.url.startsWith("data:"));
  if (!first) {
    throw createScriptError("provider_error", "missing_image", "No image data was returned by the provider.");
  }

  const [header, data] = first.url.split(",", 2);
  const mimeType = first.mime_type || header.slice(5).split(";", 1)[0] || "image/png";
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const finalDir = path.resolve(outputDir || "illustrations");
  const finalName = outputName || `openrouter-image.${ext}`;
  const finalPath = path.join(finalDir, finalName);

  await fs.mkdir(finalDir, { recursive: true });
  await fs.writeFile(finalPath, Buffer.from(data, "base64"));

  return {
    output_path: finalPath,
    mime_type: mimeType,
  };
}

export async function emitResult(result, { json = false, text = "" } = {}) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (text) {
    console.log(text);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

export async function emitFailure(error, { json = false } = {}) {
  const payload = {
    ok: false,
    error: {
      type: error.type || "unknown_error",
      code: error.code || "unknown_error",
      message: error.message || "Unknown error.",
      ...(error.details || {}),
    },
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(payload.error.message);
    if (payload.error.provider_status) {
      console.error(`Provider status: ${payload.error.provider_status}`);
    }
    if (payload.error.raw) {
      console.error(payload.error.raw);
    }
  }

  process.exit(1);
}

export function normalizeString(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getModelModalities(model) {
  const input = model?.architecture?.input_modalities || model?.input_modalities || [];
  const output = model?.architecture?.output_modalities || model?.output_modalities || [];
  return {
    input_modalities: Array.isArray(input) ? input : [],
    output_modalities: Array.isArray(output) ? output : [],
  };
}

export function getModelDetailUrl(modelId) {
  return `https://openrouter.ai/${modelId}`;
}

export function summarizeModel(model, matchReason = null) {
  const { input_modalities, output_modalities } = getModelModalities(model);
  return {
    id: model.id,
    canonical_slug: model.canonical_slug || null,
    name: model.name || model.id,
    description: model.description || "",
    input_modalities,
    output_modalities,
    context_length: model.context_length || null,
    pricing: model.pricing || {},
    supported_parameters: model.supported_parameters || [],
    detail_url: getModelDetailUrl(model.id),
    match_reason: matchReason,
  };
}

export function supportsTask(model, taskType) {
  const { input_modalities, output_modalities } = getModelModalities(model);
  if (taskType === "chat") {
    return output_modalities.includes("text");
  }
  if (taskType === "image-generate") {
    return output_modalities.includes("image");
  }
  if (taskType === "image-edit") {
    return input_modalities.includes("image") && output_modalities.includes("image");
  }
  return true;
}
