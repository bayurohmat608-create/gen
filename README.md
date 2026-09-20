# Blind Agent Room

A local-first experiment where **two LLMs talk directly to each other** using your own API keys. It now ships with both a terminal interface and a responsive chatroom-style web UI.

The project started as a small lab for the future Droide multi-agent idea: give two models different providers/personas, hide their identities, then watch the conversation evolve.

## What it does

- Two agents alternate automatically.
- Providers: OpenAI, Anthropic, Gemini, and OpenAI-compatible endpoints.
- Personas: `default`, `calm`, `focus`, `mbul`.
- Responsive mobile/desktop chat UI.
- Live room state over Server-Sent Events.
- Typing indicator, pause, stop, turn counter, and human intervention.
- Room modes: Free, Debate, Brainstorm, Review.
- In-app **Hubungkan Penyedia** flow for OpenAI, Anthropic, Gemini, and OpenAI-compatible endpoints.
- Live model discovery after authentication, so available model IDs populate automatically.
- In-app provider/model/persona settings.
- API keys entered in the web UI are **memory-only**.
- JSON transcript export.
- Demo mode for testing the UI without spending API credits.
- CLI remains available.
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
```

You now get two commands:

```bash
blindroom --version
blindroom-web
```

Start the web app:

```bash
blindroom-web
```

Then open:

```text
http://127.0.0.1:8765
```

The server binds to localhost by default so the room and in-memory API keys are not exposed to other devices on your network.

## First run

You can configure providers from the Settings panel in the web UI, or use the CLI:

```bash
blindroom init
```

For shell-based keys:

```bash
export OPENAI_API_KEY='YOUR_KEY'
export GEMINI_API_KEY='YOUR_KEY'
export ANTHROPIC_API_KEY='YOUR_KEY'
```

Do not commit real API keys. `blindroom.json`, `.env`, and transcripts are ignored by Git.

The web Settings panel also lets you connect a provider, validates the credential against that provider, and loads the models that credential can access. The value lives in memory only and disappears when the server stops.

### OpenAI / ChatGPT account note

Blind Agent Room connects to the **OpenAI API Platform**, not to a consumer ChatGPT session. OpenAI's public API authentication uses API keys, and ChatGPT subscription billing is separate from API Platform billing. After connecting an OpenAI Platform key, BlindRoom calls the Models API and fills the model picker with the model IDs available to that API credential.

## Demo without an API key

Open Settings and choose **Demo tanpa API**. This runs synthetic Focus/Mbul responses so you can test the whole chatroom flow without making provider requests.

## Chatroom controls

- **Free**: natural conversation.
- **Debate**: challenge claims and surface trade-offs.
- **Brainstorm**: generate and combine ideas.
- **Review**: inspect risks, gaps, and improvements.
- **Pause / Resume**: temporarily stop agent turns.
- **Stop**: end the active room.
- **Human message**: type while a room is running to enter the transcript.
- **Export transcript**: save the current room as JSON.

## CLI

The original terminal experiment still works:

```bash
blindroom doctor

blindroom run \
  --topic "Debatkan static typing vs dynamic typing" \
  --turns 8
```

## Persona isolation

Persona changes presentation and interaction style only. It does **not** grant tools, permissions, filesystem access, terminal access, or different security rules.

That separation is intentional, so `mbul` can yap without magically acquiring a terminal.

## Security model

- Web server defaults to `127.0.0.1`.
- API key values are never returned by the state API.
- Keys entered through the UI are stored only in the running Python process.
- API key values are not written into config or transcript exports.
- A Content Security Policy and basic browser security headers are enabled.
- OpenAI-compatible custom endpoints must use HTTPS, except localhost endpoints.

If you intentionally bind the server to a LAN-facing address, treat the machine and network as trusted because local session data can become reachable.

## Provider notes

The core provider adapters live in `blindroom.py`. Model IDs are intentionally data-driven rather than hardcoded because provider catalogs change.

Each agent turn is a real API request unless Demo mode is active. Longer rooms repeatedly include conversation context, so API usage can grow quickly. Start with a small turn count.

## Project structure

```text
blindroom.py      provider adapters + original CLI
roomcore.py       room state, persona orchestration, room modes
webhandler.py     localhost HTTP/SSE API
webroom.py        web server launcher
web/              responsive chatroom client
```

## License

MIT. See `LICENSE`.
