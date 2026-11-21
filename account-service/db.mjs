/**
 * 每个用户一行。打卡、对话、其余个人数据都带 user_id。
 */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      username_lower TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visits (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS emotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_id TEXT NOT NULL,
      date TEXT,
      weekday TEXT,
      emotion TEXT,
      text TEXT,
      image TEXT,
      UNIQUE (user_id, client_id)
    );
    CREATE TABLE IF NOT EXISTS user_state (
      user_id INTEGER PRIMARY KEY,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_emotions_user ON emotions(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, conversation_id, id);
    CREATE TABLE IF NOT EXISTS chat_guidance (
      user_id INTEGER NOT NULL,
      conversation_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY(user_id, conversation_id)
    );
  `)
  const columns = new Set(db.prepare('PRAGMA table_info(emotions)').all().map((column) => column.name))
  if (!columns.has('day')) db.exec('ALTER TABLE emotions ADD COLUMN day TEXT')
  if (!columns.has('images')) db.exec('ALTER TABLE emotions ADD COLUMN images TEXT')
  return db
}

function emotionImages(row) {
  if (Array.isArray(row.images)) {
    return row.images.filter((item) => typeof item === 'string' && item.startsWith('data:image/')).slice(0, 3)
  }
  if (typeof row.image === 'string' && row.image.startsWith('[')) {
    try {
      const parsed = JSON.parse(row.image)
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === 'string' && item.startsWith('data:image/')).slice(0, 3)
      }
    } catch { /* 旧数据只有一张图 */ }
  }
  if (typeof row.image === 'string' && row.image.startsWith('data:image/')) return [row.image]
  return []
}

function mapUser(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    username: row.username,
    usernameLower: row.username_lower,
    salt: row.salt,
    passwordHash: row.password_hash,
    createdAt: Number(row.created_at)
  }
}

const DEMO_TEXTS = new Set([
  '今天和朋友一起去了公园散步，阳光很好。',
  '工作有点多，但总算完成了，需要好好休息。',
  '明天有个重要的会议要准备，有点紧张。',
  '一个人在家看书，很安静，享受这种时刻。',
  '收到了喜欢的礼物，好开心！',
  '周一总是很忙，但坚持下来了。',
  '去了趟书店，买了几本新书。',
  '和家人一起吃了顿大餐。'
])

function parseEmotions(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const texts = parsed.map((row) => row?.text)
    if (parsed.length === DEMO_TEXTS.size && texts.every((text) => DEMO_TEXTS.has(text))) return []
    return parsed
  } catch {
    return []
  }
}

export function createStore(db) {
  const findUserByName = db.prepare('SELECT * FROM users WHERE username_lower = ?')
  const insertUser = db.prepare(`
    INSERT INTO users (username, username_lower, salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const insertUserWithId = db.prepare(`
    INSERT INTO users (id, username, username_lower, salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const insertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
  const deleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?')
  const userByToken = db.prepare(`
    SELECT u.* FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `)
  const insertVisit = db.prepare('INSERT OR IGNORE INTO visits (user_id, day) VALUES (?, ?)')
  const deleteOldVisits = db.prepare('DELETE FROM visits WHERE day < ?')
  const countVisit = db.prepare('SELECT COUNT(*) AS n FROM visits WHERE day = ?')
  const countUsers = db.prepare('SELECT COUNT(*) AS n FROM users')
  const deleteEmotions = db.prepare('DELETE FROM emotions WHERE user_id = ?')
  const insertEmotion = db.prepare(`
    INSERT INTO emotions (user_id, client_id, date, weekday, emotion, text, image, day, images)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const listEmotions = db.prepare(`
    SELECT client_id, date, weekday, emotion, text, image, day, images
    FROM emotions WHERE user_id = ? ORDER BY id
  `)
  const upsertState = db.prepare(`
    INSERT INTO user_state (user_id, payload) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload
  `)
  const readState = db.prepare('SELECT payload FROM user_state WHERE user_id = ?')
  const readGuidance = db.prepare('SELECT payload FROM chat_guidance WHERE user_id = ? AND conversation_id = ?')
  const writeGuidance = db.prepare('INSERT INTO chat_guidance (user_id, conversation_id, payload) VALUES (?, ?, ?) ON CONFLICT(user_id, conversation_id) DO UPDATE SET payload = excluded.payload')
  const insertChat = db.prepare(`
    INSERT INTO chat_messages (user_id, conversation_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const listChat = db.prepare(`
    SELECT role, content FROM chat_messages
    WHERE user_id = ? AND conversation_id = ?
    ORDER BY id DESC LIMIT ?
  `)
  const trimChat = db.prepare(`
    DELETE FROM chat_messages
    WHERE user_id = ? AND conversation_id = ? AND id NOT IN (
      SELECT id FROM chat_messages
      WHERE user_id = ? AND conversation_id = ?
      ORDER BY id DESC LIMIT 12
    )
  `)

  function saveVault(userId, vault) {
    const emotions = parseEmotions(vault.nuo_emotions)
    const rest = { ...vault }
    delete rest.nuo_emotions
    db.exec('BEGIN')
    try {
      deleteEmotions.run(userId)
      emotions.forEach((row, index) => {
        if (!row || typeof row !== 'object') return
        const images = emotionImages(row)
        insertEmotion.run(
          userId,
          String(row.id ?? `row-${index}`),
          typeof row.date === 'string' ? row.date : '',
          typeof row.weekday === 'string' ? row.weekday : '',
          typeof row.emotion === 'string' ? row.emotion : '',
          typeof row.text === 'string' ? row.text : '',
          images[0] || null,
          typeof row.day === 'string' ? row.day.slice(0, 10) : '',
          JSON.stringify(images)
        )
      })
      upsertState.run(userId, JSON.stringify(rest))
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  function loadVault(userId) {
    const stateRow = readState.get(userId)
    const rest = stateRow ? JSON.parse(stateRow.payload) : {}
    const records = listEmotions.all(userId).map((row) => {
      let images = []
      try {
        const parsed = JSON.parse(row.images || '[]')
        if (Array.isArray(parsed)) images = parsed.filter((item) => typeof item === 'string')
      } catch { /* 没有照片列表时退回单张 */ }
      if (!images.length && row.image) images = [row.image]
      return {
        id: /^\d+$/.test(String(row.client_id)) ? Number(row.client_id) : row.client_id,
        date: row.date || '',
        weekday: row.weekday || '',
        emotion: row.emotion || '',
        text: row.text || '',
        day: row.day || '',
        images,
        image: images[0] || null
      }
    })
    rest.nuo_emotions = JSON.stringify(records)
    return rest
  }

  return {
    findUserByName(username) {
      return mapUser(findUserByName.get(String(username).toLowerCase()))
    },
    createUser({ username, usernameLower, salt, passwordHash, createdAt }) {
      const result = insertUser.run(username, usernameLower, salt, passwordHash, createdAt)
      return Number(result.lastInsertRowid)
    },
    createSession(userId, token, expiresAt) {
      deleteExpiredSessions.run(Date.now())
      insertSession.run(token, userId, expiresAt)
    },
    deleteSession(token) {
      deleteSession.run(token)
    },
    userFromToken(token) {
      if (!token) return null
      return mapUser(userByToken.get(token, Date.now()))
    },
    recordVisit(userId, day, cutoff) {
      insertVisit.run(userId, day)
      deleteOldVisits.run(cutoff)
    },
    visitCount(day) {
      return Number(countVisit.get(day).n)
    },
    userCount() {
      return Number(countUsers.get().n)
    },
    saveVault,
    loadVault,
    addChat(userId, conversationId, role, content) {
      insertChat.run(userId, conversationId, role, content.slice(0, 2000), Date.now())
      trimChat.run(userId, conversationId, userId, conversationId)
    },
    guidance(userId, conversationId) {
      try { return JSON.parse(readGuidance.get(userId, conversationId)?.payload || 'null') } catch { return null }
    },
    saveGuidance(userId, conversationId, value) {
      writeGuidance.run(userId, conversationId, JSON.stringify(value))
    },
    chatHistory(userId, conversationId) {
      return listChat.all(userId, conversationId, 12).reverse().map((row) => ({
        role: row.role,
        content: row.content
      }))
    },
    importLegacy(accountsPath) {
      if (this.userCount() > 0) return
      let parsed
      try {
        parsed = JSON.parse(fs.readFileSync(accountsPath, 'utf8'))
      } catch {
        return
      }
      if (!parsed || !Array.isArray(parsed.users) || parsed.users.length === 0) return
      db.exec('BEGIN')
      try {
        let maxId = 0
        for (const user of parsed.users) {
          const id = Number(user.id)
          if (!id || !user.username || !user.salt || !user.passwordHash) continue
          insertUserWithId.run(
            id,
            user.username,
            user.usernameLower || String(user.username).toLowerCase(),
            user.salt,
            user.passwordHash,
            Number(user.createdAt) || Date.now()
          )
          maxId = Math.max(maxId, id)
        }
        db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'users'`).run()
        db.prepare(`INSERT INTO sqlite_sequence (name, seq) VALUES ('users', ?)`).run(maxId)
        const now = Date.now()
        for (const session of parsed.sessions || []) {
          if (!session?.token || !session.userId || Number(session.expiresAt) <= now) continue
          insertSession.run(session.token, Number(session.userId), Number(session.expiresAt))
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      for (const user of parsed.users) {
        if (user?.vault && user.id) saveVault(Number(user.id), user.vault)
      }
      const visits = parsed.visits && typeof parsed.visits === 'object' ? parsed.visits : {}
      for (const [day, ids] of Object.entries(visits)) {
        if (!Array.isArray(ids)) continue
        for (const id of ids) insertVisit.run(Number(id), day)
      }
      try {
        fs.renameSync(accountsPath, `${accountsPath}.imported`)
      } catch { /* 保留原文件也可以 */ }
    }
  }
}
