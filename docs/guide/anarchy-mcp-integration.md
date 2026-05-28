# Using ANARCHY as an MCP Server in ChatOllama

[ANARCHY](https://github.com/psfr4590-afk/ANARCHY) is a fully local AI shell with persistent memory backed by a FAISS vector store. Its MCP server exposes that memory layer — and any installed ANARCHY skills — as tools that ChatOllama can call during conversations.

This means you can ask ChatOllama to **remember things across sessions**, **search your stored notes semantically**, and **run ANARCHY skills** — all without leaving the ChatOllama interface.

---

## Prerequisites

- Python 3.10+
- ANARCHY cloned and its dependencies installed:
  ```bash
  git clone https://github.com/psfr4590-afk/ANARCHY.git
  cd ANARCHY
  pip install -r requirements.txt
  ```
- ChatOllama running with MCP enabled (`NUXT_MCP_ENABLED=true` or `MCP_ENABLED=true`)

---

## What tools are exposed

The ANARCHY MCP server exposes four tools:

| Tool | Description |
|------|-------------|
| `memory_store` | Embed and persist a fact or note in ANARCHY's FAISS vector store |
| `memory_search` | Semantic search over all stored memories — returns the top-k most relevant results |
| `memory_list` | Return the N most recently stored memories |
| `skill_list` | List all installed ANARCHY skills with their descriptions |

---

## Adding the MCP server to ChatOllama

1. Open ChatOllama and navigate to **Settings → MCP Servers**
2. Click **Add Server**
3. Fill in the form:

   | Field | Value |
   |-------|-------|
   | Name | `ANARCHY Memory` |
   | Transport | `stdio` |
   | Command | `python` |
   | Arguments | `/absolute/path/to/ANARCHY/mcp_server.py` |

4. Click **Create** — the server will appear in your MCP server list
5. Toggle it **Enabled**
6. In **Settings → Chat Settings**, ensure **Enable Tool Usage** is on

Now when you chat, the AI can call `memory_store`, `memory_search`, `memory_list`, and `skill_list` automatically.

---

## Example interactions

Once the server is enabled, you can prompt ChatOllama naturally:

> **"Remember that my production database is PostgreSQL 15 on port 5433."**
>
> *ChatOllama calls `memory_store` with that fact. It's now persisted in ANARCHY's vector store across sessions.*

> **"What do I know about my database setup?"**
>
> *ChatOllama calls `memory_search("database setup")` and retrieves your stored notes semantically.*

> **"What ANARCHY skills do I have installed?"**
>
> *ChatOllama calls `skill_list` and returns a formatted list of your installed skills and their descriptions.*

---

## Environment variables

The MCP server respects the same environment variables as ANARCHY:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANARCHY_MEMORY_DIR` | `~/.anarchy/memory` | Path to the FAISS index and metadata store |
| `ANARCHY_SKILLS_DIR` | `~/.anarchy/skills` | Path to installed ANARCHY skills |
Set these in the **Environment Variables** section of the MCP server form in ChatOllama if your paths differ from the defaults.

> **Note on embeddings:** ANARCHY uses `sentence-transformers` (`all-MiniLM-L6-v2`) for local embedding — no Ollama model is required for memory operations. Ensure `sentence-transformers` and `faiss-cpu` are installed (`pip install sentence-transformers faiss-cpu`). If they are absent, ANARCHY gracefully falls back to recency-based JSON retrieval.

---

## Troubleshooting

**Server shows as disconnected**
- Ensure Python is in your PATH (test: `python --version` in a terminal)
- Use the full absolute path to `mcp_server.py`, not a relative one
- Check that ANARCHY's dependencies are installed in the same Python environment

**`memory_search` returns no results**
- The FAISS index is empty until you store at least one memory via `memory_store`
- Verify `ANARCHY_MEMORY_DIR` points to an existing directory

**Embedding errors**
- Make sure Ollama is running (`ollama serve`) and `nomic-embed-text` is pulled: `ollama pull nomic-embed-text`
