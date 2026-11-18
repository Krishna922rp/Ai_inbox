# Architecture

```text
React (Vite)
    |
    | /api/*
    v
Express API
    |-- validation + request logging
    |-- URL extraction (server-side)
    |-- source and chunk persistence
    |-- embedding generation (OpenAI)
    |-- cosine-similarity retrieval
    |-- grounded chat completion + citations
    |
    v
SQLite (items + chunks + serialized embeddings)
```

## Ingestion lifecycle
1. Validate the note or URL payload.
2. For a URL, fetch the public page on the server and extract readable text.
3. Store the source record and split content into overlapping chunks.
4. Generate embeddings when the OpenAI key is configured and persist each vector alongside its chunk.
5. Return the saved source metadata to the client.

## Query lifecycle
1. Validate the question and load indexed chunks.
2. Embed the question with the same embedding model.
3. Rank stored vectors using cosine similarity and select the strongest matches.
4. Ask the chat model to answer from only those excerpts.
5. Return the answer and the source identifiers, titles, snippets, and relevance scores.

## Practical tradeoffs
SQLite and in-process vector ranking minimize operational setup for a small assignment. The tradeoff is that all vectors are scanned in application memory on each query. A larger deployment should move to an indexed vector database, add background ingestion jobs, and use durable managed storage. Public URL ingestion should also be isolated behind strict outbound network controls to defend against DNS rebinding and other SSRF variants.
