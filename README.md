# Recall — AI Knowledge Inbox

A personal knowledge inbox for saving notes and web pages, then asking grounded questions across the saved material.

## Stack
- **Frontend:** React 18, Vite, Lucide icons
- **API:** Node.js 22 LTS, Express
- **Storage:** SQLite via better-sqlite3
- **AI:** OpenAI embeddings and chat completions
- **Retrieval:** text chunking, persisted embeddings, cosine-similarity ranking

## Features
- Save text notes and public web pages
- Fetch and extract readable page content on the server
- Persist source metadata, original text and chunks in SQLite
- Generate embeddings when an OpenAI key is configured
- Retrieve relevant chunks and answer with numbered source references
- Search saved titles and the full text of notes/pages (case-insensitive)
- Filter by note or web page, open saved links, and delete sources
- Health endpoint, input validation, request logs and API error responses

## Architecture

The React client sends requests to the Express API. The API validates input, stores original source text and overlapping chunks in SQLite, and uses OpenAI embeddings for semantic indexing and question vectors. Queries rank stored chunks with cosine similarity, pass only the best excerpts to the chat model, and return a numbered answer with matching source snippets. Public URLs are fetched and extracted server-side.

```text
React + Vite
    |
    v
Express API -----> Public URL fetcher
    |                    |
    |                    v
    |               Extracted text
    v
SQLite <-------- OpenAI embeddings
    |
    v
Cosine retrieval -> OpenAI chat -> Answer + source citations
```

See [docs/architecture.md](docs/architecture.md) for ingestion/query lifecycles and scaling tradeoffs.

## Local setup

**Requirements:** Node.js 22 LTS and npm. The current better-sqlite3 native dependency is tested on Node 22; Node 24 is not supported by this project yet.

From PowerShell:

~~~powershell
# Clone the repository
git clone https://github.com/Krishna922rp/Ai_inbox.git
cd Ai_inbox
git switch feat/recall-app-foundation

# Create the shared environment file
Copy-Item .env.example .env
notepad .env

# Install, verify, and start
npm install
npm test
npm run build
npm run dev
~~~

Open **http://localhost:5173**. The Express API listens on **http://localhost:4000**.

Add your OpenAI key to **OPENAI_API_KEY** in the root .env file to enable embeddings and AI Q&A. Saving notes and fetching URLs still work without a key, but saved sources will not be indexed for semantic Q&A. Re-ingest those sources after configuring the key.

On Windows, keep the project in a normal development folder such as **C:\Projects\Ai_inbox** rather than a OneDrive-synchronised folder if installs fail with EPERM file-lock errors. Close running Node processes and VS Code before deleting node_modules and reinstalling.

## Environment

The root .env is loaded by both the API workspace and Vite. Relative DATABASE_PATH values are resolved from the repository root.

| Variable | Purpose | Default |
|---|---|---|
| PORT | API port | 4000 |
| CLIENT_ORIGIN | Comma-separated allowed browser origins | http://localhost:5173 |
| OPENAI_API_KEY | OpenAI API key | blank; required for AI |
| OPENAI_EMBEDDING_MODEL | Embedding model | text-embedding-3-small |
| OPENAI_CHAT_MODEL | Answer model | gpt-4o-mini |
| DATABASE_PATH | SQLite file path; relative paths use the repository root | ./data/recall.db |
| VITE_API_BASE_URL | API origin for a separately hosted frontend; blank uses the local Vite proxy | blank |

Never commit .env or a real API key.

## API

- **GET /api/health** — returns `{ "status": "ok" }`.
- **GET /api/items** — returns `{ "items": [...], "counts": { "total": 2, "notes": 1, "links": 1 } }`. Each item contains `id`, `type`, `title`, `url`, `content_preview` (first 220 characters), and `created_at`.
- **GET /api/items?q=keyword** — searches the complete saved title and body, case-insensitively; the counts still describe the whole library. Search text is limited to 200 characters.
- **POST /api/ingest** — accepts either `{ "type": "note", "title": "...", "content": "..." }` (content up to 100,000 characters) or `{ "type": "url", "url": "https://..." }` (URL up to 2,048 characters). Returns HTTP 201 with `{ "item": { "id", "type", "title", "url", "created_at", "chunks" } }`. URL content is fetched and extracted by the API server; redirects and non-public hosts are rejected.
- **POST /api/query** — accepts `{ "question": "..." }` (up to 2,000 characters). Returns `{ "answer": "... [1]", "sources": [{ "chunk_id", "item_id", "title", "url", "snippet", "score" }] }`. Source order matches the numbered citations in the answer. Embedding vectors are never returned to the browser. If no relevant chunks exist, the API returns an explanatory answer and an empty sources array.
- **DELETE /api/items/:id** — deletes a source; SQLite cascades the deletion to its chunks.

Validation failures return HTTP 400 (or 413 for oversized note content); missing AI configuration returns HTTP 503 for semantic Q&A. Unexpected server errors return a generic HTTP 500 message while structured logs retain the error type and status.

## Checks

~~~powershell
npm test
npm run build
~~~

The Node test suite covers chunking and similarity, SQLite schema/cascade behavior, atomic note and URL ingestion, URL-fetch SSRF/size/redirect safeguards, validation, full-content search, and HTTP route behavior for list, ingest, and semantic query. Route tests use an in-memory SQLite database and deterministic embedding/LLM fakes; they do not call OpenAI or depend on live external websites. The GitHub Actions workflow runs `npm install`, `npm test`, and `npm run build` on Node.js 22.

## Design notes and limitations

- SQLite keeps setup simple for a single-user assignment; use a managed database and dedicated vector store as data volume grows.
- Cosine similarity is calculated in-process over stored embedding JSON. This is intentionally lightweight and should be replaced with indexed vector search at larger scale.
- URL ingestion accepts public HTTP(S) HTML/text only. It resolves and validates every DNS answer, pins the selected public address into the outbound socket lookup (preventing a second DNS resolution), rejects non-standard ports and redirects, and enforces a 2 MB streaming response cap plus a 12-second total timeout. This is a stronger assignment-level SSRF safeguard, but it is not a substitute for network egress controls in a public production service. Production hosting should still isolate outbound fetching, deny private/special-use ranges at the network layer, and apply rate limits.
- No authentication is included, per the assignment's scope. Do not expose this instance publicly with private notes until access control is added.
- URL redirects are rejected to reduce SSRF risk. Some sites block automated requests or render content only in a browser.
- If the OpenAI key is missing, ingestion stores content without embeddings; re-ingest those sources after configuring AI to index them.

## Hosting handoff

This repository does not deploy itself. For a user-managed host:

1. Build the frontend with npm run build; the static files are in client/dist.
2. Run the API with npm start on a Node.js 22 runtime.
3. Set OPENAI_API_KEY, CLIENT_ORIGIN, PORT, and DATABASE_PATH in the API host's environment.
4. Attach a durable writable volume for the SQLite file. Do not use ephemeral storage for data/recall.db.
5. For a separate frontend host, set VITE_API_BASE_URL to the API origin at frontend build time. For a same-origin reverse-proxy setup, leave it blank and route /api/* to Express.
6. Keep the API private until authentication and stronger outbound URL-fetch protections are added.

The included Vite proxy is for local development only. No hosting provider, deployment, or production database is configured by this project.
