# OpenRouter Provider Skill

A reusable local skill for Codex, Claude Code, and similar terminal AI agents that need to discover and call OpenRouter models for:

- chat and text generation
- image generation
- image editing with an input image
- model search and model inspection
- Cloudflare AI Gateway routing on top of OpenRouter

This repository is designed for practical day-to-day use, especially for designers and creative operators who want a single provider skill that can switch between different OpenRouter models without rewriting local tooling.

## Why this skill exists

Most local agent workflows break down at the provider layer:

- one script is hard-coded to one model
- model names are fuzzy and need search first
- image models and chat models need different routes
- OpenRouter direct access and Cloudflare AI Gateway use different base URLs

This skill solves that by separating model discovery from model execution.

## What it does

The skill supports five core actions:

1. Search OpenRouter models by fuzzy query
2. Summarize candidate models with modality and pricing metadata
3. Call chat models through an OpenRouter-compatible endpoint
4. Generate images through OpenRouter-compatible routes
5. Probe whether a model is callable with the current key and base URL

## Who this is for

This repository is useful if you:

- use Codex or another local coding agent
- want designers to run image models through OpenRouter without changing scripts every time
- want to switch between chat models and image models per request
- want to route OpenRouter traffic through Cloudflare AI Gateway

## Repository structure

```text
openrouter-provider/
├── SKILL.md
├── README.md
├── .gitignore
├── .env.local.example
├── agents/
│   └── openai.yaml
├── evals/
│   └── evals.json
├── references/
│   └── routing.md
└── scripts/
    ├── _shared.mjs
    ├── openrouter_chat.mjs
    ├── openrouter_image.mjs
    ├── openrouter_models.mjs
    └── openrouter_probe.mjs
```

## Requirements

- Node.js 20+ with built-in `fetch`
- An `OPENROUTER_API_KEY`
- Optional: a Cloudflare AI Gateway base URL if you do not want to call OpenRouter directly

## Configuration

Create a local `.env.local` file in the workspace where you run the scripts.

Example:

```env
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-5-mini
OPENROUTER_CHAT_MODEL=openai/gpt-5-mini
OPENROUTER_IMAGE_MODEL=google/gemini-3.1-flash-image-preview
```

If you route through Cloudflare AI Gateway, set:

```env
OPENROUTER_BASE_URL=https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/openrouter/v1
```

The scripts treat environment variables as defaults. You can override the model per request with `--model`.

## Install in Codex

Copy this folder into your Codex skills directory:

```bash
mkdir -p ~/.codex/skills
cp -R /path/to/openrouter-provider ~/.codex/skills/openrouter-provider
```

After that, Codex can trigger the skill by reading the metadata from `SKILL.md`.

## Use the scripts directly

### Search models

```bash
node scripts/openrouter_models.mjs --query banana --task-type image-generate --limit 5
```

### Chat

```bash
node scripts/openrouter_chat.mjs \
  --model openai/gpt-5-mini \
  --prompt "Reply with OK"
```

### Generate an image

```bash
node scripts/openrouter_image.mjs \
  --model google/gemini-3.1-flash-image-preview \
  --prompt "Minimal geometric fintech icon cluster, transparent background, no text" \
  --output-name result.png
```

### Edit an existing image

```bash
node scripts/openrouter_image.mjs \
  --model google/gemini-3.1-flash-image-preview \
  --input-image /absolute/path/to/input.png \
  --prompt "Preserve the background and add a right-side hero object" \
  --output-name edited.png
```

### Probe a model

```bash
node scripts/openrouter_probe.mjs \
  --task-type chat \
  --model openai/gpt-5-mini \
  --json
```

## How model selection works

The skill is intentionally not tied to one model.

Selection priority:

1. model explicitly requested by the user
2. `--model`
3. `OPENROUTER_CHAT_MODEL` or `OPENROUTER_IMAGE_MODEL`
4. `OPENROUTER_MODEL`
5. script fallback

This means a designer can use model A for one request and model B for the next request without editing global config every time.

## How fuzzy model names work

If the user gives a fuzzy name like:

- `banana model`
- `cheap Gemini image model`
- `fast OpenRouter coding model`

the skill should search first and present plausible candidates instead of silently guessing.

That behavior is defined in `SKILL.md` and supported by `scripts/openrouter_models.mjs`.

## Notes for design teams

This repository is useful as a shared provider layer:

- one place to define default models
- one place to define OpenRouter or Cloudflare Gateway transport
- one consistent interface for both image and chat work
- one skill that higher-level design workflows can call

Typical pattern:

- a banner or design skill handles prompt logic
- this provider skill handles model search, routing, and execution

## Validation

The skill structure validates with the local `skill-creator` validator:

```bash
python3 /Users/ty123456/.codex/skills/skill-creator/scripts/quick_validate.py /path/to/openrouter-provider
```

## License

Add your preferred license before wider distribution if needed.
