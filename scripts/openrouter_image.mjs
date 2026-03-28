#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
  emitFailure,
  emitResult,
  extractImagePayload,
  getApiKey,
  getBaseUrl,
  imageFileToDataUrl,
  loadLocalEnv,
  readPrompt,
  requestJson,
  resolveModel,
  saveFirstDataUrlImage,
} from "./_shared.mjs";

const { values } = parseArgs({
  options: {
    prompt: { type: "string" },
    "prompt-file": { type: "string" },
    "env-file": { type: "string" },
    model: { type: "string" },
    "base-url": { type: "string" },
    "input-image": { type: "string" },
    "output-dir": { type: "string" },
    "output-name": { type: "string" },
    "aspect-ratio": { type: "string" },
    "image-size": { type: "string" },
    json: { type: "boolean", default: false },
  },
});

async function tryImagesGenerations({ baseUrl, apiKey, model, prompt }) {
  return requestJson({
    url: `${baseUrl}/images/generations`,
    apiKey,
    body: {
      model,
      prompt,
      size: "1536x1024",
      quality: "high",
      background: "transparent",
      output_format: "png",
      n: 1,
    },
  });
}

async function tryChatImage({ baseUrl, apiKey, model, prompt, inputImage, modalities, aspectRatio, imageSize }) {
  const content = [{ type: "text", text: prompt }];
  if (inputImage) {
    content.push({
      type: "image_url",
      image_url: {
        url: await imageFileToDataUrl(inputImage),
      },
    });
  }

  return requestJson({
    url: `${baseUrl}/chat/completions`,
    apiKey,
    body: {
      model,
      modalities,
      messages: [
        {
          role: "user",
          content,
        },
      ],
      image_config: {
        aspect_ratio: aspectRatio || "16:9",
        image_size: imageSize || "4K",
      },
    },
  });
}

function extractImagesFromResponse(json) {
  if (Array.isArray(json.data) && json.data[0]?.b64_json) {
    return [
      {
        url: `data:image/png;base64,${json.data[0].b64_json}`,
        mime_type: "image/png",
      },
    ];
  }

  const message = json.choices?.[0]?.message;
  return extractImagePayload(message);
}

try {
  await loadLocalEnv(values["env-file"]);
  const apiKey = getApiKey();
  const taskType = values["input-image"] ? "image-edit" : "image-generate";
  const baseUrl = getBaseUrl(values["base-url"]);
  const model = resolveModel({
    explicitModel: values.model,
    taskType,
    fallbackModel: "google/gemini-3.1-flash-image-preview",
  });

  if (!model) {
    throw new Error("No image model was resolved.");
  }

  const prompt = await readPrompt({
    prompt: values.prompt,
    promptFile: values["prompt-file"],
  });

  let json;
  let routeUsed = null;

  if (taskType === "image-generate") {
    try {
      json = await tryImagesGenerations({ baseUrl, apiKey, model, prompt });
      routeUsed = "images_generations";
    } catch (error) {
      if (error?.details?.provider_status !== 404) {
        throw error;
      }
    }
  }

  if (!json) {
    try {
      json = await tryChatImage({
        baseUrl,
        apiKey,
        model,
        prompt,
        inputImage: values["input-image"],
        modalities: ["image", "text"],
        aspectRatio: values["aspect-ratio"],
        imageSize: values["image-size"],
      });
      routeUsed = "chat_completions_image_text";
    } catch (error) {
      const raw = error?.details?.raw || "";
      if (!raw.includes("\"modalities\"") && !raw.includes("modalities")) {
        throw error;
      }
    }
  }

  if (!json) {
    json = await tryChatImage({
      baseUrl,
      apiKey,
      model,
      prompt,
      inputImage: values["input-image"],
      modalities: ["image"],
      aspectRatio: values["aspect-ratio"],
      imageSize: values["image-size"],
    });
    routeUsed = "chat_completions_image_only";
  }

  const images = extractImagesFromResponse(json);
  const saved = await saveFirstDataUrlImage(images, {
    outputDir: values["output-dir"],
    outputName: values["output-name"],
  });

  const result = {
    ok: true,
    task_type: taskType,
    model,
    base_url: baseUrl,
    result: {
      ...saved,
      route_used: routeUsed,
    },
  };

  await emitResult(result, {
    json: values.json,
    text: saved.output_path,
  });
} catch (error) {
  await emitFailure(error, { json: values.json });
}
