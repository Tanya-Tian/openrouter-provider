---
name: openrouter-provider
description: Use this skill whenever the user wants to use OpenRouter models, search or compare OpenRouter models, route requests through OpenRouter or Cloudflare AI Gateway, switch between OpenRouter models, or invoke text, image generation, or image editing capabilities through an OpenRouter-compatible endpoint. Use it even when the user gives a fuzzy model reference such as "banana model", "cheap Gemini image model", or "an OpenRouter image model" instead of a precise model ID.
---

# OpenRouter Provider

## Purpose

Use this skill as a provider layer for OpenRouter-backed work. It is responsible for model discovery, model resolution, and request execution for chat, image generation, and image editing tasks.

This skill is not a business-domain workflow. It should help the agent decide which OpenRouter model to use and how to call it, while leaving domain-specific prompt design to the calling workflow or to the current task.

## Use This Skill When

Use this skill when the user:

- explicitly wants to use OpenRouter
- wants to use Cloudflare AI Gateway with OpenRouter
- wants to search, compare, or inspect OpenRouter models
- gives a fuzzy model reference and needs help finding the right model
- wants to switch models between requests
- wants to invoke text, image generation, or image editing through an OpenRouter-compatible endpoint

## Do Not Use This Skill For

Do not use this skill for:

- domain-specific prompt writing when model routing is not the problem
- banner-specific art direction, design workflows, or review workflows
- storing secrets for the user
- making up model IDs that were not confirmed by the user or discovered through search

## Configuration

### Required environment variables

- `OPENROUTER_API_KEY`

### Optional environment variables

- `OPENROUTER_BASE_URL`
- `OPENROUTER_MODEL`
- `OPENROUTER_CHAT_MODEL`
- `OPENROUTER_IMAGE_MODEL`

### Base URL rules

- If `OPENROUTER_BASE_URL` is not set, default to `https://openrouter.ai/api/v1`.
- If the user routes traffic through Cloudflare AI Gateway, `OPENROUTER_BASE_URL` should usually be set to `https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/openrouter/v1`.
- Treat the base URL as a transport detail. Do not assume OpenRouter direct access and Cloudflare Gateway access behave identically under all provider policies.

### Configuration priority

Resolve values in this order:

1. explicit user instruction in the current request
2. CLI flag, such as `--model` or `--base-url`
3. task-specific environment variable
4. generic environment variable
5. script fallback

Model priority:

1. exact model ID named by the user in the current request
2. `--model`
3. `OPENROUTER_CHAT_MODEL` or `OPENROUTER_IMAGE_MODEL`, depending on the task
4. `OPENROUTER_MODEL`
5. script fallback

Remember that environment variables are defaults, not hard constraints. If the user clearly asks to use a different model for one request, prefer the user's request over the environment default.

## Workflow

### 1. Identify the task type

Classify the request as one of these:

- model discovery
- model description
- chat
- image generation
- image editing
- model probe

Do this before choosing a script or a model.

### 2. Resolve the model reference

First decide whether the user's model reference is exact or fuzzy.

- Exact reference: a precise model ID such as `google/gemini-3.1-flash-image-preview`
- Fuzzy reference: a nickname, family name, capability description, or cost/performance hint such as `banana model`, `cheap Gemini image model`, or `fast OpenRouter coding model`

### 3. Search before guessing

If the user gives a fuzzy reference, search before selecting a model. Do not silently guess.

Use `scripts/openrouter_models.mjs` to search and filter candidate models. Prefer concise candidate summaries with:

- model ID
- model name
- input and output modalities
- context length
- basic pricing fields
- short description
- OpenRouter detail link

### 4. Ask for confirmation when needed

If search returns multiple plausible candidates, ask the user to confirm the model.

If only one candidate is clearly stronger than the others, you may propose it as the default choice, but you should still say that you are making that choice based on the search results.

Never invent a model ID that did not come from:

- an explicit user instruction
- a search result
- a previously confirmed selection

### 5. Validate capabilities before execution

Check that the selected model supports the required task shape:

- `chat`: output should support text
- `image generation`: output should support image
- `image editing`: input should support image and output should support image

If the model does not support the required modalities, do not proceed. Explain the mismatch and offer alternatives from the search results.

### 6. Execute the request

Route requests as follows:

- model discovery or comparison: `scripts/openrouter_models.mjs`
- chat: `scripts/openrouter_chat.mjs`
- image generation: `scripts/openrouter_image.mjs`
- image editing: `scripts/openrouter_image.mjs` with `--input-image`
- availability check or low-cost validation: `scripts/openrouter_probe.mjs`

### 7. Report errors clearly

Keep provider errors meaningful. Preserve important details such as:

- provider status code
- region restriction messages
- invalid model errors
- unsupported endpoint errors

Do not flatten everything into a generic "request failed" message if the provider supplied a useful reason.

## Model Resolution Rules

### Exact model IDs

If the user provides an exact model ID, use it directly unless there is a clear capability mismatch.

### Fuzzy model names

If the user gives a fuzzy model reference, search first. Do not pretend certainty.

### Ambiguous matches

If more than one candidate is plausible, ask the user to choose.

### Strong single match

If the search result contains one clearly dominant match, you may recommend it and proceed after stating that choice explicitly.

## Task Routing Rules

### Chat

Use `scripts/openrouter_chat.mjs` for standard chat or text completion tasks routed through OpenRouter-compatible endpoints.

### Image generation

Use `scripts/openrouter_image.mjs` without `--input-image`.

Prefer an image generation endpoint first. If that route is unsupported for the chosen model or transport, allow the script to fall back to a chat-based multimodal route when implemented.

### Image editing

Use `scripts/openrouter_image.mjs` with `--input-image`.

Prefer a multimodal chat route when the selected model supports image input and image output.

### Model discovery

Use `scripts/openrouter_models.mjs` whenever the user needs help finding a model or understanding what OpenRouter currently offers.

### Model probe

Use `scripts/openrouter_probe.mjs` when you need a low-cost validation of whether a model is currently available through the configured key and base URL.

## Scripts

### `scripts/openrouter_models.mjs`

Search and summarize OpenRouter models. Use it to:

- search by fuzzy text
- filter candidates by task type
- present concise model summaries

### `scripts/openrouter_chat.mjs`

Send text requests to an OpenRouter-compatible chat endpoint. Use it for:

- text generation
- standard chat tasks
- provider-level routing checks for chat models

### `scripts/openrouter_image.mjs`

Send image generation or image editing requests through an OpenRouter-compatible endpoint. Use it for:

- text-to-image generation
- image-to-image or edit flows
- transport-specific fallback logic between image and chat routes

### `scripts/openrouter_probe.mjs`

Run a minimal request to check whether a model is currently callable for a given task type.

## Output Rules

- Keep model search summaries concise.
- Always include the selected model ID when executing a request.
- Include model detail links when showing search results to the user.
- Preserve meaningful provider errors.
- Prefer structured JSON output from scripts when downstream automation or reliable parsing matters.

## Examples

**Example 1: Exact text model**

User: "Use `openai/gpt-5-mini` through OpenRouter and answer this question."

Action: route directly to `scripts/openrouter_chat.mjs` with the exact model ID.

**Example 2: Fuzzy image model**

User: "I want the Gemini banana image model."

Action: search first with `scripts/openrouter_models.mjs`, show plausible candidates, then confirm the final model if needed.

**Example 3: Cheap Gemini image model**

User: "Find a cheap Gemini image model on OpenRouter."

Action: search, filter by image output, summarize pricing-relevant fields, and recommend a short list.

**Example 4: Exact image model**

User: "Generate an image with `google/gemini-3.1-flash-image-preview`."

Action: validate image output support, then route to `scripts/openrouter_image.mjs`.

**Example 5: Cloudflare AI Gateway**

User: "Use my Cloudflare AI Gateway endpoint with OpenRouter."

Action: honor the configured base URL, keep the OpenRouter API key, and use the same routing logic as direct OpenRouter access.
