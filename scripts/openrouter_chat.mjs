#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  emitFailure,
  emitResult,
  extractTextContent,
  getApiKey,
  getBaseUrl,
  loadLocalEnv,
  readPrompt,
  requestJson,
  resolveModel,
} from "./_shared.mjs";

const { values } = parseArgs({
  options: {
    prompt: { type: "string" },
    "prompt-file": { type: "string" },
    "env-file": { type: "string" },
    model: { type: "string" },
    "base-url": { type: "string" },
    system: { type: "string" },
    "output-file": { type: "string" },
    json: { type: "boolean", default: false },
  },
});

try {
  await loadLocalEnv(values["env-file"]);
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl(values["base-url"]);
  const model = resolveModel({
    explicitModel: values.model,
    taskType: "chat",
    fallbackModel: "openai/gpt-5-mini",
  });

  if (!model) {
    throw new Error("No chat model was resolved.");
  }

  const prompt = await readPrompt({
    prompt: values.prompt,
    promptFile: values["prompt-file"],
  });

  const messages = [];
  if (values.system) {
    messages.push({ role: "system", content: values.system });
  }
  messages.push({ role: "user", content: prompt });

  const json = await requestJson({
    url: `${baseUrl}/chat/completions`,
    apiKey,
    body: {
      model,
      messages,
      max_tokens: 512,
    },
  });

  const message = json.choices?.[0]?.message || {};
  const text = extractTextContent(message);

  if (values["output-file"]) {
    const outputPath = path.resolve(values["output-file"]);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, text, "utf8");
  }

  const result = {
    ok: true,
    task_type: "chat",
    model,
    base_url: baseUrl,
    result: {
      text,
      finish_reason: json.choices?.[0]?.finish_reason || null,
      usage: json.usage || null,
      output_file: values["output-file"] ? path.resolve(values["output-file"]) : null,
    },
  };

  await emitResult(result, {
    json: values.json,
    text,
  });
} catch (error) {
  await emitFailure(error, { json: values.json });
}
