import { Document } from "@langchain/core/documents"
import { BaseStoreInterface } from "@langchain/core/stores"
import { Redis } from "ioredis"
import { createRedisClient } from "@/server/store/redis"

export class RedisDocstore implements BaseStoreInterface<string, Document> {
  _namespace: string
  _client: Redis

  constructor(namespace: string) {
    this._namespace = namespace
    this._client = createRedisClient()
  }

  serializeDocument(doc: Document): string {
    return JSON.stringify(doc)
  }

  deserializeDocument(jsonString: string): Document {
    const obj = JSON.parse(jsonString)
    return new Document(obj)
  }

  getNamespacedKey(key: string): string {
    return `${this._namespace}:${key}`
  }

  getKeys(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const stream = this._client.scanStream({ match: this._namespace + '*' })

      const keys: string[] = []
      stream.on('data', (resultKeys) => {
        keys.push(...resultKeys)
      })

      stream.on('end', () => {
        resolve(keys)
      })

      stream.on('error', (err) => {
        reject(err)
      })
    })
  }

  addText(key: string, value: string) {
    this._client.set(this.getNamespacedKey(key), value)
  }

  async search(search: string): Promise<Document> {
    const result = await this._client.get(this.getNamespacedKey(search))
    if (!result) {
      throw new Error(`ID ${search} not found.`)
    } else {
      const document = this.deserializeDocument(result)
      return document
    }
  }

  /**
   * Adds new documents to the store.
   * @param texts An object where the keys are document IDs and the values are the documents themselves.
   * @returns Void
   */
  async add(texts: Record<string, Document>): Promise<void> {
    for (const [key, value] of Object.entries(texts)) {
      // console.log(`Adding ${key} to the store: ${this.serializeDocument(value)}`);
    }

    const keys = [...await this.getKeys()]
    const overlapping = Object.keys(texts).filter((x) => keys.includes(x))

    if (overlapping.length > 0) {
      throw new Error(`Tried to add ids that already exist: ${overlapping}`)
    }

    for (const [key, value] of Object.entries(texts)) {
      this.addText(key, this.serializeDocument(value))
    }
  }

  async mget(keys: string[]): Promise<Document[]> {
    return Promise.all(keys.map((key) => {
      const document = this.search(key)
      return document
    }))
  }

  async mset(keyValuePairs: [string, Document][]): Promise<void> {
    await Promise.all(
      keyValuePairs.map(([key, value]) => this.add({ [key]: value }))
    )
  }

  async mdelete(_keys: string[]): Promise<void> {
    throw new Error("Not implemented.")
  }

  // eslint-disable-next-line require-yield
  async *yieldKeys(_prefix?: string): AsyncGenerator<string> {
    throw new Error("Not implemented")
  }

  async deleteAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      let cursor = '0'

      const scanCallback = (err, result) => {
        if (err) {
          reject(err)
          return
        }

        const [nextCursor, keys] = result

        // Delete keys matching the prefix
        keys.forEach((key) => {
          this._client.del(key)
        })

        // If the cursor is '0', we've iterated through all keys
        if (nextCursor === '0') {
          resolve()
        } else {
          // Continue scanning with the next cursor
          this._client.scan(nextCursor, 'MATCH', `${this._namespace}:*`, scanCallback)
        }
      }

      // Start the initial SCAN operation
      this._client.scan(cursor, 'MATCH', `${this._namespace}:*`, scanCallback)
    })
  }
}
