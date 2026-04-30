const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { ensureContextTable, ensureContext } = require('./contextDb');

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  scene TEXT,
  description TEXT,
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

const EXTRA_COLUMNS = [
  { name: 'scene', type: 'TEXT' },
  { name: 'description', type: 'TEXT' },
  { name: 'context_id', type: 'INTEGER' },
];

const INSERT_SESSION_SQL = `
INSERT INTO sessions (
  username,
  scene,
  description,
  context_id,
  url,
  method,
  req_id,
  status_code,
  start_time,
  end_time,
  created_at,
  session_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const getNumber = (value) => {
  value = Number(value);
  return Number.isFinite(value) ? value : null;
};

const rollback = (db, error, callback) => {
  db.run('ROLLBACK', () => callback(error));
};

const runStatement = (database, sql) => new Promise((resolve, reject) => {
  database.run(sql, (error) => {
    if (error) {
      reject(error);
      return;
    }
    resolve();
  });
});

const getTableColumns = (database, tableName) => new Promise((resolve, reject) => {
  database.all(`PRAGMA table_info(${tableName})`, (error, rows) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(rows || []);
  });
});

const ensureColumns = (database) => getTableColumns(database, 'sessions').then((rows) => {
  const columnMap = {};
  rows.forEach(({ name }) => {
    columnMap[name] = true;
  });

  return EXTRA_COLUMNS.reduce((promise, column) => {
    if (columnMap[column.name]) {
      return promise;
    }
    return promise.then(() => runStatement(database, `ALTER TABLE sessions ADD COLUMN ${column.name} ${column.type}`));
  }, Promise.resolve());
});

const normalizeText = (value) => {
  value = typeof value === 'string' ? value.trim() : '';
  return value || null;
};

const getBackupPath = (databasePath) => {
  const dir = path.dirname(databasePath);
  const ext = path.extname(databasePath);
  const base = path.basename(databasePath, ext);
  const stamp = new Date().toISOString().replace(/[\-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  return path.join(dir, `${base}.${stamp}.bak${ext}`);
};

const statFile = (filePath) => new Promise((resolve, reject) => {
  fs.stat(filePath, (error, stats) => {
    if (error) {
      if (error.code === 'ENOENT') {
        resolve(null);
        return;
      }
      reject(error);
      return;
    }
    resolve(stats);
  });
});

const renameFile = (fromPath, toPath) => new Promise((resolve, reject) => {
  fs.rename(fromPath, toPath, (error) => {
    if (error) {
      reject(error);
      return;
    }
    resolve();
  });
});

const normalizeSession = (item, settings) => {
  const session = item && item.session;
  const req = session && session.req;
  const res = session && session.res;
  const url = session ? session.url : null;
  const method = req ? req.method : null;
  const reqId = session ? session.id : null;

  return [
    normalizeText(settings && settings.username),
    normalizeText(item && item.scene),
    normalizeText(item && item.description),
    item && item.contextId ? item.contextId : null,
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

module.exports = ({ username, onInfo, onError, getMaxDbSizeBytes }) => {
  let currentPath;
  let db;
  let queue = Promise.resolve();
  const contextCache = {};

  const closeCurrentDb = () => {
    if (!db) {
      return Promise.resolve();
    }

    const currentDb = db;
    const closedPath = currentPath;
    db = null;
    currentPath = null;
    Object.keys(contextCache).forEach((key) => delete contextCache[key]);

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

  const rotateDatabaseIfNeeded = (databasePath) => statFile(databasePath).then((stats) => {
    const maxDbSizeBytes = typeof getMaxDbSizeBytes === 'function' ? getMaxDbSizeBytes() : 100 * 1024 * 1024;
    const maxDbSizeMB = Math.round(maxDbSizeBytes / 1024 / 1024);
    if (!stats || !stats.isFile() || stats.size < maxDbSizeBytes) {
      return;
    }

    const backupPath = getBackupPath(databasePath);
    return closeCurrentDb().then(() => renameFile(databasePath, backupPath).then(() => {
      if (onInfo) {
        onInfo(`SQLite 文件超过 ${maxDbSizeMB}MB，已备份到: ${backupPath}`);
      }
    }));
  });

  const openDb = (databasePath) => rotateDatabaseIfNeeded(databasePath).then(() => {
    if (db && currentPath === databasePath) {
      return db;
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
              ensureColumns(nextDb).then(() => ensureContextTable(nextDb)).then(() => {
                db = nextDb;
                currentPath = databasePath;
                resolve(nextDb);
              }).catch((columnErr) => {
                if (onError) {
                  onError(`更新 sessions 表字段失败: ${databasePath}`, columnErr);
                }
                nextDb.close(() => reject(columnErr));
              });
            });
          });
        });
      });
    }));
  });

  const hydrateContextIds = (currentDb, sessions) => {
    const uniqueContexts = [];
    const keyMap = {};

    sessions.forEach((item) => {
      const context = item && item.context;
      const key = JSON.stringify([
        context && context.scene || '',
        context && context.description || '',
        context && context.sceneMappings || '',
        context && context.filterText || '',
        context && context.databasePath || '',
        context && context.maxDbSizeMB || 100,
      ]);
      item.contextKey = key;
      if (!keyMap[key]) {
        keyMap[key] = true;
        uniqueContexts.push({ key, context });
      }
    });

    return uniqueContexts.reduce((promise, item) => promise.then(() => {
      if (contextCache[item.key]) {
        return;
      }
      return ensureContext(currentDb, item.context).then((contextId) => {
        contextCache[item.key] = contextId;
      });
    }), Promise.resolve()).then(() => {
      sessions.forEach((item) => {
        item.contextId = contextCache[item.contextKey] || null;
      });
    });
  };

  const writeBatch = (databasePath, sessions) => {
    if (onInfo) {
      onInfo(`准备写入 SQLite: ${databasePath}, 条数: ${sessions.length}`);
    }
    return openDb(databasePath).then((currentDb) => hydrateContextIds(currentDb, sessions).then(() => new Promise((resolve, reject) => {
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
              stmt.run(normalizeSession(session, { username }), (err) => {
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
    })));
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
