import Dexie, { type Table } from 'dexie'

export interface Conversation {
  id?: number
  source: 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'grok'
  url: string
  rawText: string
  createdAt: Date
}

class SaviorDB extends Dexie {
  conversations!: Table<Conversation>

  constructor() {
    super('savior-db')
    this.version(1).stores({
      conversations: '++id, source, url, createdAt'
    })
  }
}

export const db = new SaviorDB()