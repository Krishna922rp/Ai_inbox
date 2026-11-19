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
2. For a URL, resolve all DNS answers and reject the host if any answer is private, local, shared, documentation-only, or otherwise non-global. Pin the selected public address into the HTTP(S) socket lookup, retain the hostname for Host/SNI, reject redirects and non-standard ports, enforce a 12-second total timeout and a 2 MB streaming body cap, then extract readable text.
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
SQLite and in-process vector ranking minimize operational setup for a small assignment. The tradeoff is that all vectors are scanned in application memory on each query. A larger deployment should move to an indexed vector database, add background ingestion jobs, and use durable managed storage. DNS pinning and redirect rejection reduce common SSRF and DNS-rebinding paths. They do not replace host-level egress filtering, rate limiting, or a dedicated fetch service for an unrestricted public deployment.
