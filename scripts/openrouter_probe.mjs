#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
  emitFailure,
  emitResult,
  extractImagePayload,
  extractTextContent,
  getApiKey,
  getBaseUrl,
  imageFileToDataUrl,
  loadLocalEnv,
  requestJson,
  resolveModel,
} from "./_shared.mjs";

const { values } = parseArgs({
  options: {
    model: { type: "string" },
    "task-type": { type: "string" },
    "base-url": { type: "string" },
    "env-file": { type: "string" },
    "input-image": { type: "string" },
    json: { type: "boolean", default: false },
  },
});

try {
  await loadLocalEnv(values["env-file"]);
  const taskType = values["task-type"] || "chat";
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl(values["base-url"]);
  const model = resolveModel({
    explicitModel: values.model,
    taskType,
    fallbackModel: taskType === "chat" ? "openai/gpt-5-mini" : "google/gemini-3.1-flash-image-preview",
  });

  if (!model) {
    throw new Error("No model was resolved for the probe request.");
  }

  let probeResult;

  if (taskType === "chat") {
    const json = await requestJson({
      url: `${baseUrl}/chat/completions`,
      apiKey,
      body: {
        model,
        messages: [{ role: "user", content: "Reply with OK" }],
        max_tokens: 16,
      },
    });
    const text = extractTextContent(json.choices?.[0]?.message);
    probeResult = {
      available: true,
      route_used: "chat_completions",
      evidence: text || "Successful 2xx response from chat/completions.",
    };
  } else {
    const content = [{ type: "text", text: "Generate a simple black square on a white background." }];
    if (taskType === "image-edit") {
      if (!values["input-image"]) {
        throw new Error("Missing --input-image for an image-edit probe.");
      }
      content.push({
        type: "image_url",
        image_url: {
          url: await imageFileToDataUrl(values["input-image"]),
        },
      });
    }

    const json = await requestJson({
      url: `${baseUrl}/chat/completions`,
      apiKey,
      body: {
        model,
        modalities: ["image", "text"],
        messages: [{ role: "user", content }],
        image_config: {
          aspect_ratio: "1:1",
          image_size: "1K",
        },
      },
    });

    probeResult = {
      available: true,
      route_used: "chat_completions_image",
      evidence:
        extractImagePayload(json.choices?.[0]?.message).length > 0
          ? "Image payload returned in response."
          : "Successful 2xx response from image-capable route.",
    };
  }

  const result = {
    ok: true,
    task_type: taskType,
    model,
    probe: probeResult,
  };

  await emitResult(result, {
    json: values.json,
    text: `${model}: ${probeResult.available ? "available" : "unavailable"}`,
  });
} catch (error) {
  await emitFailure(error, { json: values.json });
}
