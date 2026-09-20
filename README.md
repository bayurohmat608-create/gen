# Blind Agent Room

A tiny terminal experiment where two LLMs talk directly to each other using **your own API keys**. Built as a throwaway lab for the future Droide multi-agent idea.

## Features

- Two agents alternate automatically.
- Mix OpenAI, Anthropic, Gemini, or an OpenAI-compatible endpoint.
- Personas: `default`, `calm`, `focus`, `mbul`.
- Blind Agent A / Agent B labels while they talk, with optional reveal at the end.
- API keys stay in environment variables and are never written to config or transcripts.
- No model tool execution in this experiment. Both agents are explicitly told they have no terminal, filesystem, browser, or executor.
- Retries transient network, 429, and common 5xx failures.
- Saves a JSON transcript.
- Zero third-party Python dependencies.

## Install on Termux

```bash
pkg update
pkg install python git
git clone https://github.com/bayurohmat608-create/gen.git blind-agent-room
cd blind-agent-room
chmod +x install.sh
./install.sh
export PATH="$HOME/.local/bin:$PATH"
blindroom --version
```

If you do not want to install it globally, just run:

```bash
python blindroom.py --help
```

## Configure

```bash
blindroom init
```

Setup asks for each provider, exact model ID, persona, and the **environment-variable name** that holds its API key. The key itself is never requested by the program.

Then export only the keys you need, for example:

```bash
export OPENAI_API_KEY='YOUR_OPENAI_KEY'
export GEMINI_API_KEY='YOUR_GEMINI_KEY'
export ANTHROPIC_API_KEY='YOUR_ANTHROPIC_KEY'
```

Do not paste real API keys into GitHub or commit them into files.

Check setup:

```bash
blindroom doctor
```

## Run the experiment

```bash
blindroom run --topic "Apakah AI agent seharusnya boleh mengkritik arsitektur IDE milik user?" --turns 6
```

The models alternate until the turn limit, `[END]`, an error, or `Ctrl+C`.

Keep identities hidden even after the run:

```bash
blindroom run --topic "Debatkan static typing vs dynamic typing" --turns 8 --no-reveal
```

## Providers

`openai` uses the OpenAI Responses API. `anthropic` uses the Messages API. `gemini` uses `generateContent`. `openai-compatible` uses `/v1/chat/completions` and asks for a custom base URL.

Model IDs are intentionally not hardcoded because catalogues change. Enter the exact model ID your account/provider exposes.

## Persona isolation

A persona only changes conversational style. It does not grant tools, permissions, or different security rules. That separation is intentional so `mbul` can yap without magically acquiring a terminal.

## Cost note

Every turn is a real API request. Six turns means roughly six requests total, alternating between the two agents. Each later turn includes the conversation so far, so token use grows as the room gets longer. Start small.
