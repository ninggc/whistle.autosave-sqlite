const sqlite3 = require('sqlite3');

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  url TEXT,
  method TEXT,
  req_id TEXT,
  status_code INTEGER,
  start_time INTEGER,
  end_time INTEGER,
  created_at INTEGER NOT NULL,
  session_json TEXT NOT NULL
)`;

const CREATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_sessions_created_at
ON sessions (created_at)`;

const INSERT_SESSION_SQL = `
INSERT INTO sessions (
  username,
  url,
  method,
  req_id,
  status_code,
  start_time,
  end_time,
  created_at,
  session_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const getNumber = (value) => {
  value = Number(value);
  return Number.isFinite(value) ? value : null;
};

const rollback = (db, error, callback) => {
  db.run('ROLLBACK', () => callback(error));
};

const normalizeSession = (session, username) => {
  const req = session && session.req;
  const res = session && session.res;
  const url = session ? session.url : null;
  const method = req ? req.method : null;
  const reqId = session ? session.id : null;

  return [
    username || null,
    url || null,
    method || null,
    reqId || null,
    getNumber(res && res.statusCode),
    getNumber(session && session.startTime),
    getNumber(session && session.endTime),
    Date.now(),
    JSON.stringify(session),
  ];
};

module.exports = ({ username, onInfo, onError }) => {
  let currentPath;
  let db;
  let queue = Promise.resolve();

  const closeCurrentDb = () => {
    if (!db) {
      return Promise.resolve();
    }

    const currentDb = db;
    const closedPath = currentPath;
    db = null;
    currentPath = null;

    return new Promise((resolve, reject) => {
      currentDb.close((err) => {
        if (err) {
          if (onError) {
            onError(`关闭 SQLite 数据库失败: ${closedPath}`, err);
          }
          reject(err);
          return;
        }
        if (onInfo) {
          onInfo(`关闭 SQLite 数据库连接: ${closedPath}`);
        }
        resolve();
      });
    });
  };

  const openDb = (databasePath) => {
    if (db && currentPath === databasePath) {
      return Promise.resolve(db);
    }

    return closeCurrentDb().then(() => new Promise((resolve, reject) => {
      if (onInfo) {
        onInfo(`打开 SQLite 数据库: ${databasePath}`);
      }
      const nextDb = new sqlite3.Database(databasePath, (err) => {
        if (err) {
          if (onError) {
            onError(`打开 SQLite 数据库失败: ${databasePath}`, err);
          }
          reject(err);
          return;
        }

        nextDb.serialize(() => {
          nextDb.run(CREATE_TABLE_SQL, (tableErr) => {
            if (tableErr) {
              if (onError) {
                onError(`创建 sessions 表失败: ${databasePath}`, tableErr);
              }
              nextDb.close(() => reject(tableErr));
              return;
            }
            nextDb.run(CREATE_INDEX_SQL, (indexErr) => {
              if (indexErr) {
                if (onError) {
                  onError(`创建 sessions 索引失败: ${databasePath}`, indexErr);
                }
                nextDb.close(() => reject(indexErr));
                return;
              }
              db = nextDb;
              currentPath = databasePath;
              resolve(nextDb);
            });
          });
        });
      });
    }));
  };

  const writeBatch = (databasePath, sessions) => {
    if (onInfo) {
      onInfo(`准备写入 SQLite: ${databasePath}, 条数: ${sessions.length}`);
    }
    return openDb(databasePath).then((currentDb) => new Promise((resolve, reject) => {
      currentDb.serialize(() => {
        currentDb.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            if (onError) {
              onError(`开启事务失败: ${databasePath}`, beginErr);
            }
            reject(beginErr);
            return;
          }

          const stmt = currentDb.prepare(INSERT_SESSION_SQL, (prepareErr) => {
            if (prepareErr) {
              if (onError) {
                onError(`预编译插入语句失败: ${databasePath}`, prepareErr);
              }
              rollback(currentDb, prepareErr, reject);
              return;
            }

            let insertError;
            sessions.forEach((session) => {
              stmt.run(normalizeSession(session, username), (err) => {
                if (err && !insertError) {
                  insertError = err;
                }
              });
            });

            stmt.finalize((finalizeErr) => {
              const error = insertError || finalizeErr;
              if (error) {
                if (onError) {
                  onError(`写入 sessions 表失败: ${databasePath}`, error);
                }
                rollback(currentDb, error, reject);
                return;
              }
              currentDb.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  if (onError) {
                    onError(`提交事务失败: ${databasePath}`, commitErr);
                  }
                  rollback(currentDb, commitErr, reject);
                  return;
                }
                if (onInfo) {
                  onInfo(`写入 SQLite 成功: ${databasePath}, 条数: ${sessions.length}`);
                }
                resolve();
              });
            });
          });
        });
      });
    }));
  };

  return {
    append(databasePath, sessions) {
      if (!databasePath || !Array.isArray(sessions) || !sessions.length) {
        return queue;
      }

      queue = queue.catch(() => {}).then(() => writeBatch(databasePath, sessions));
      return queue;
    },
    close() {
      queue = queue.catch(() => {}).then(() => closeCurrentDb());
      return queue;
    },
  };
};
