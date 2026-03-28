#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
  emitFailure,
  emitResult,
  getModelDetailUrl,
  normalizeString,
  requestGetJson,
  summarizeModel,
  supportsTask,
} from "./_shared.mjs";

const { values } = parseArgs({
  options: {
    query: { type: "string" },
    "task-type": { type: "string" },
    limit: { type: "string" },
    "base-url": { type: "string" },
    json: { type: "boolean", default: false },
  },
});

function getCatalogBaseUrl(explicitBaseUrl) {
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/$/, "");
  return "https://openrouter.ai/api/v1";
}

function scoreModel(model, query) {
  if (!query) return { score: 1, matchReason: "No query provided" };

  const normalizedQuery = normalizeString(query);
  const id = normalizeString(model.id);
  const slug = normalizeString(model.canonical_slug || "");
  const name = normalizeString(model.name || "");
  const description = normalizeString(model.description || "");

  if (normalizedQuery === id) return { score: 100, matchReason: "Exact model ID match" };
  if (normalizedQuery === slug) return { score: 95, matchReason: "Exact canonical slug match" };
  if (normalizedQuery === name) return { score: 90, matchReason: "Exact model name match" };
  if (id.includes(normalizedQuery)) return { score: 80, matchReason: "Matched query in model ID" };
  if (slug.includes(normalizedQuery)) return { score: 70, matchReason: "Matched query in canonical slug" };
  if (name.includes(normalizedQuery)) return { score: 60, matchReason: "Matched query in model name" };
  if (description.includes(normalizedQuery)) return { score: 30, matchReason: "Matched query in model description" };
  return { score: 0, matchReason: null };
}

function formatSummary(payload) {
  if (payload.models.length === 0) {
    return payload.query
      ? `No OpenRouter models matched "${payload.query}".`
      : "No OpenRouter models matched the current filters.";
  }

  const header = payload.query
    ? `Found ${payload.count} OpenRouter model${payload.count === 1 ? "" : "s"} for "${payload.query}":`
    : `Found ${payload.count} OpenRouter model${payload.count === 1 ? "" : "s"}:`;

  const lines = [header];
  payload.models.forEach((model, index) => {
    lines.push(`${index + 1}. ${model.id}`);
    lines.push(`   Input: ${model.input_modalities.join(", ") || "unknown"}`);
    lines.push(`   Output: ${model.output_modalities.join(", ") || "unknown"}`);
    lines.push(`   Context: ${model.context_length ?? "unknown"}`);
    if (model.match_reason) {
      lines.push(`   Why it matches: ${model.match_reason}`);
    }
    lines.push(`   Details: ${getModelDetailUrl(model.id)}`);
  });
  return lines.join("\n");
}

try {
  const taskType = values["task-type"] || "discover";
  const limit = Number.parseInt(values.limit || "5", 10);
  const baseUrl = getCatalogBaseUrl(values["base-url"]);
  const response = await requestGetJson(`${baseUrl}/models`);
  const models = Array.isArray(response.data) ? response.data : [];

  const filtered = models
    .map((model) => {
      const { score, matchReason } = scoreModel(model, values.query);
      return { model, score, matchReason };
    })
    .filter((item) => item.score > 0 || !values.query)
    .filter((item) => supportsTask(item.model, taskType === "discover" ? null : taskType))
    .sort((a, b) => b.score - a.score || String(a.model.id).localeCompare(String(b.model.id)))
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 5)
    .map((item) => summarizeModel(item.model, item.matchReason));

  const result = {
    ok: true,
    query: values.query || "",
    task_type: taskType,
    count: filtered.length,
    models: filtered,
  };

  await emitResult(result, {
    json: values.json,
    text: formatSummary(result),
  });
} catch (error) {
  await emitFailure(error, { json: values.json });
}
