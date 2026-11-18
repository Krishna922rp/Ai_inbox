# Recall — AI Knowledge Inbox

A small single-user knowledge workspace for saving notes and web pages, then asking questions over that saved material.

## What it does

- Save plain-text notes.
- Save a URL and extract readable page content on the server.
- Split saved content into chunks and create embeddings.
- Retrieve relevant chunks for a question.
- Generate an answer using the retrieved context and return source references.

## Stack

- React + Vite
- Node.js + Express
- SQLite
- OpenAI API for embeddings and answer generation

## Project status

The approved UI direction is being implemented in stages. This repository will contain the working application, not just the visual prototype. AI responses must come from retrieved saved content; sample data is only for local UI development.

## Local setup

Requirements: Node.js 20 or newer and an OpenAI API key.

```bash
npm install
npm run dev
```

Create a `.env` file in the project root:

```env
PORT=4000
OPENAI_API_KEY=your_key_here
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4o-mini
DATABASE_PATH=./data/recall.db
```

Never commit `.env` or real API keys.

## API

- `POST /api/ingest` — save a note or URL.
- `GET /api/items` — list saved sources.
- `POST /api/query` — retrieve relevant chunks and answer a question.
- `GET /api/health` — service health check.

## Development approach

Keep routes thin, move database and RAG work into separate modules, validate inputs at the API boundary, and add tests around ingestion and retrieval as those modules are implemented.

## Trade-offs

SQLite keeps the assignment easy to run locally and is appropriate for a single-user prototype. A dedicated vector database and background job queue would be considered if the number of users or documents grows.
