# Recall — AI Knowledge Inbox

A personal knowledge inbox for saving notes and web pages, then asking grounded questions across the saved material.

## Stack
- **Frontend:** React 18, Vite, Lucide icons
- **API:** Node.js 20+, Express
- **Storage:** SQLite via better-sqlite3
- **AI:** OpenAI embeddings and chat completions
- **Retrieval:** text chunking, persisted embeddings, cosine-similarity ranking

## Features
- Save text notes and public web pages
- Fetch and extract readable page content on the server
- Persist source metadata, original text and chunks in SQLite
- Generate embeddings when an OpenAI key is configured
- Retrieve relevant chunks and answer with numbered source references
- Search/filter the library and remove saved items
- Health endpoint, input validation, request logs and API error responses

## Local setup
1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env` and add an OpenAI API key for AI search.
3. Run `npm install` from the repository root.
4. Run `npm run dev`.
5. Open the Vite URL (normally http://localhost:5173). The API listens on port 4000.

Without an API key, notes and URLs can still be stored, but embeddings and AI Q&A are unavailable. Existing content saved without embeddings must be re-ingested after configuring the key.

## Environment
| Variable | Purpose | Default |
|---|---|---|
| PORT | API port | 4000 |
| CLIENT_ORIGIN | Allowed browser origin | http://localhost:5173 |
| OPENAI_API_KEY | OpenAI API key | required for AI |
| OPENAI_EMBEDDING_MODEL | Embedding model | text-embedding-3-small |
| OPENAI_CHAT_MODEL | Answer model | gpt-4o-mini |
| DATABASE_PATH | SQLite file path | ./data/recall.db |

## API
- `GET /api/health` — process health
- `GET /api/items` — saved sources
- `POST /api/ingest` — `{ "type":"note", "title":"...", "content":"..." }` or `{ "type":"url", "url":"https://..." }`
- `POST /api/query` — `{ "question":"..." }`; returns an answer and source snippets
- `DELETE /api/items/:id` — delete a source and its chunks

## Checks
Run `npm test` for the API utility tests and `npm run build` for the frontend production build.

## Design notes and limitations
- SQLite keeps setup simple for a single-user assignment; use a managed database and dedicated vector store as data volume grows.
- Cosine similarity is calculated in-process over stored embedding JSON. This is intentionally lightweight and should be replaced with indexed vector search at larger scale.
- URL ingestion accepts public HTTP(S) HTML/text only and has basic private-network address checks; production deployments should add robust DNS-rebinding protection, fetch egress controls, content limits, and background jobs.
- No authentication is included, per the assignment's scope. Do not expose this instance publicly with private notes until access control is added.
- URL redirects are rejected to reduce SSRF risk. Some sites block automated requests or render content only in a browser.
- If the OpenAI key is missing, ingestion stores content without embeddings; re-ingest those sources after configuring AI to index them.

## Hosting handoff
Deploy the frontend and API as separate services or serve the built frontend from a static host. Configure `CLIENT_ORIGIN`, `PORT`, `DATABASE_PATH`, and the OpenAI variables on the API host. Persist the SQLite data directory on a durable volume. Set the frontend API base/proxy for your chosen host (the included Vite proxy is for local development). Run `npm run build` before publishing the client.
