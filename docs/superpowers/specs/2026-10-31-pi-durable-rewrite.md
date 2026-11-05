# Chat Ollama rewrite: agreed design

Confirmed by the user on 2026-10-31 after a grilling interview.

## Outcome and scope

Rewrite the whole application as a single-user, self-hosted chatbot with knowledge bases and MCP. Use SvelteKit with TypeScript and replace agent execution with pi durable. Prefer simple implementation over extensible frameworks. Existing data migration is deferred; no old database is modified or imported.

## Runtime and communication

One application process owns persistent SQLite storage and local uploaded files. Deploy through Docker Compose. One durable session per conversation, one active run per conversation; distinct conversations can run concurrently. Reject new input while busy. Browser closure does not cancel work. Restarting the application resumes unfinished work. Stop explicitly cancels a run.

The browser uses application-owned HTTP commands and SSE state updates. It never depends directly on pi durable objects. Reconnection recovers committed messages, tool activity, and run status. A snapshot may replace missed incremental events; a permanent second event journal is unnecessary.

Selected MCP servers authorize tool calls without individual approval. An interrupted action with an uncertain external outcome must not run again automatically; display uncertainty and allow a deliberate user decision. Do not build a general approval engine.

## Models and tools

Chat configuration uses an OpenAI-compatible API with configurable base URL, API key, and model ID. No Ollama-specific integration. Embeddings have independent endpoint, key, and model settings. An embedding configuration change requires explicit reindexing.

Knowledge bases are outside the agent core, accessed through a tool. Users create named collections, upload text-based PDF, Markdown, or plain text, observe indexing status, retry failures, and delete documents. A conversation selects collections; the agent chooses when to search them. Return passages and stable source references for citations. Support English and Chinese and a personal collection up to roughly 100,000 chunks without adding external search infrastructure by default.

MCP supports local stdio and remote HTTP servers, globally configured and selected per conversation. Credentials remain on the server.

## Interface and access

One administrator login. Conversation sidebar, streaming Markdown, expandable tool activity, source citations, Stop, and settings for chat models, embeddings, knowledge bases, and MCP. Defer voice, skills, OCR, crawlers, external ingestion connectors, branching, message editing, regeneration, and advanced agent controls.

## Acceptance

Verify login; configure an endpoint; upload and index a document; ask a question and inspect citations; invoke an MCP tool; cancel a run; disconnect and reconnect during execution; kill and restart the server and recover unfinished work. Verify uncertain MCP outcomes do not trigger duplicate actions. Do not claim host-loss or power-loss guarantees.
