// Copy from https://github.com/langchain-ai/langchainjs/blob/e1f21e6d6c7651800895c940cd6ace4f3a5325bc/langchain/src/document_loaders/web/recursive_url.ts

import { JSDOM } from 'jsdom'
import { Document } from '@langchain/core/documents'
import { AsyncCaller } from '@langchain/core/utils/async_caller'
import { BaseDocumentLoader, DocumentLoader } from 'langchain/document_loaders/base'
import { urlGlob2Regexp } from '~/composables/utils'

interface Metadata {
  source: string,
  title?: string
  description?: string
  language?: string
}

export interface RecursiveUrlLoaderOptions {
  excludeDirs?: string[]
  extractor?: (text: string) => string
  extractMetadata?: (text: string, url: string) => Metadata
  maxDepth?: number
  timeout?: number
  preventOutside?: boolean
  callerOptions?: ConstructorParameters<typeof AsyncCaller>[0]
  fetch?: typeof fetch
  excludeGlobs?: string[]
}

export class RecursiveUrlLoader extends BaseDocumentLoader implements DocumentLoader {
  private caller: AsyncCaller

  private url: string

  private excludeDirs: string[]

  private extractor: (text: string) => string

  private extractMetadata: Required<RecursiveUrlLoaderOptions>['extractMetadata']

  private maxDepth: number

  private timeout: number

  private preventOutside: boolean

  private fetch: RecursiveUrlLoaderOptions['fetch']

  private excludeGlobs: RegExp[]

  constructor(url: string, options: RecursiveUrlLoaderOptions) {
    super()

    this.caller = new AsyncCaller({
      maxConcurrency: 64,
      maxRetries: 0,
      ...options.callerOptions,
    })

    this.url = url
    this.excludeDirs = options.excludeDirs ?? []
    this.extractor = options.extractor ?? ((s: string) => s)
    this.extractMetadata = options.extractMetadata ?? this.extractMetadataFn
    this.maxDepth = options.maxDepth ?? 2
    this.timeout = options.timeout ?? 10000
    this.preventOutside = options.preventOutside ?? true
    this.fetch = options.fetch
    this.excludeGlobs = options.excludeGlobs?.map(s => urlGlob2Regexp(s)) || []
  }

  private async fetchWithTimeout(
    resource: string,
    options: { timeout: number } & RequestInit,
    isGetChildLinks = false
  ): Promise<Response> {
    const { timeout, ...rest } = options
    return this.caller.call(() =>
      this.fetch && !isGetChildLinks
        ? this.fetch(resource, { ...rest, signal: AbortSignal.timeout(timeout) })
        : fetch(resource, { ...rest, signal: AbortSignal.timeout(timeout) })
    )
  }

  private getChildLinks(html: string, baseUrl: string): Array<string> {
    const allLinks = Array.from(
      new JSDOM(html).window.document.querySelectorAll('a')
    ).map((a) => a.href)

    console.log("All Links: ", allLinks)

    const absolutePaths = []
    // eslint-disable-next-line no-script-url
    const invalidPrefixes = ['javascript:', 'mailto:', '#']
    const invalidSuffixes = [
      '.css',
      '.js',
      '.ico',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.svg',
    ]

    for (const link of allLinks) {
      if (
        invalidPrefixes.some((prefix) => link.startsWith(prefix)) ||
        invalidSuffixes.some((suffix) => link.endsWith(suffix))
      )
        continue

      let standardizedLink: string

      if (link.startsWith('http')) {
        standardizedLink = link
      } else if (link.startsWith('//')) {
        const base = new URL(baseUrl)
        standardizedLink = base.protocol + link
      } else {
        standardizedLink = new URL(link, baseUrl).href
      }

      if (
        this.excludeDirs.some((exDir) => standardizedLink.startsWith(exDir))
        ||
        this.excludeGlobs.some(r => r.test(standardizedLink))
      ) {
        console.log("URL excluded: ", standardizedLink)
        continue
      }

      if (link.startsWith('http')) {
        const isAllowed = !this.preventOutside || link.startsWith(baseUrl)
        console.log(`URL ${link} is allowed: ${isAllowed}`)
        if (isAllowed) absolutePaths.push(link)
      } else if (link.startsWith('//')) {
        const base = new URL(baseUrl)
        absolutePaths.push(base.protocol + link)
      } else {
        const newLink = new URL(link, baseUrl).href
        absolutePaths.push(newLink)
      }
    }

    return Array.from(new Set(absolutePaths))
  }

  private extractMetadataFn(rawHtml: string, url: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata: Metadata = { source: url }
    const { document } = new JSDOM(rawHtml).window

    const title = document.getElementsByTagName('title')[0]
    if (title) {
      metadata.title = title.textContent ?? ''
    }

    const description = document.querySelector('meta[name=description]')
    if (description) {
      metadata.description = description.getAttribute('content') ?? ''
    }

    const html = document.getElementsByTagName('html')[0]
    if (html) {
      metadata.language = html.getAttribute('lang') ?? ''
    }

    return metadata
  }

  private async getUrlAsDoc(url: string): Promise<Document | null> {
    let res
    try {
      res = await this.fetchWithTimeout(url, { timeout: this.timeout })
      res = await res.text()
    } catch (e) {
      return null
    }

    return {
      pageContent: this.extractor(res),
      metadata: this.extractMetadata(res, url),
    }
  }

  async getChildUrlsRecursive(
    inputUrl: string,
    visited: Set<string> = new Set<string>(),
    depth = 0
  ): Promise<Document[]> {
    console.log(`URL ${inputUrl} at depth ${depth}`)
    if (depth >= this.maxDepth) return []

    const url = inputUrl

    const isExcluded = this.excludeDirs.some((exDir) => url.startsWith(exDir)) || this.excludeGlobs.some(r => r.test(url))
    if (isExcluded) return []

    let res
    try {
      res = await this.fetchWithTimeout(url, { timeout: this.timeout }, true)
      res = await res.text()
    } catch (e) {
      return []
    }

    const childUrls: string[] = this.getChildLinks(res, url)

    console.log("Input URL: ", inputUrl)
    console.log("Child URLs: ", childUrls)

    const results = await Promise.all(
      childUrls.map((childUrl) =>
        (async () => {
          if (visited.has(childUrl)) return null
          visited.add(childUrl)

          const childDoc = await this.getUrlAsDoc(childUrl)
          if (!childDoc) return null


          const childUrlResponses = await this.getChildUrlsRecursive(
            childUrl,
            visited,
            depth + 1
          )

          return [childDoc, ...childUrlResponses]
        })()
      )
    )

    return results.flat().filter((docs) => docs !== null) as Document[]
  }

  async load(): Promise<Document[]> {
    const rootDoc = await this.getUrlAsDoc(this.url)
    if (!rootDoc) return []

    const docs = [rootDoc]
    docs.push(
      ...(await this.getChildUrlsRecursive(this.url, new Set([this.url])))
    )
    return docs
  }
}
