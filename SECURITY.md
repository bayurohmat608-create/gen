# Security

Blind Agent Room is designed to run locally.

## API keys

- Prefer environment variables when possible.
- Keys entered in the web Settings panel are kept only in the running Python process.
- Key values are never returned by the state endpoint or written into transcript exports.
- Never commit `blindroom.json` if you add secrets to it manually, and never commit `.env` files.

## Network exposure

The web server binds to `127.0.0.1` by default. Do not bind it to `0.0.0.0` or another LAN-facing address unless you understand that other devices may be able to reach the local room server.

## Reports

Please avoid including real API keys, tokens, private transcripts, or personal data in public issue reports.
