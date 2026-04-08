const { check: checkFilter, update: updateFilter } = require('./filter');
const createSqliteStorage = require('./sqliteStorage');

const MAX_LENGTH = 10;
/* eslint-disable no-console */
const logInfo = (message) => {
  console.info(`[whistle.autosave-sqlite] ${message}`);
};
const logError = (message, error) => {
  console.error(`[whistle.autosave-sqlite] ${message}`);
  if (error) {
    console.error(error);
  }
};

module.exports = (server, { storage, config }) => {
  let sessions = [];
  let timer;
  const sqliteStorage = createSqliteStorage({
    username: config.username || '',
    onInfo: logInfo,
    onError: logError,
  });

  const writeSessions = (databasePath) => {
    try {
      const pendingSessions = sessions.slice();
      sessions = [];
      if (!pendingSessions.length) {
        return;
      }
      sqliteStorage.append(databasePath, pendingSessions).catch((error) => {
        logError(`批量写入失败: ${databasePath}`, error);
      });
    } catch (error) {
      logError('收集待写入会话失败', error);
    }
  };
  updateFilter(storage.getProperty('filterText'));
  server.on('request', (req) => {
    // filter
    const active = storage.getProperty('active');
    if (!active) {
      return;
    }
    const databasePath = storage.getProperty('databasePath');
    if (!databasePath || typeof databasePath !== 'string') {
      sessions = [];
      logInfo('未配置 databasePath，跳过自动保存');
      return;
    }
    if (!checkFilter(req.originalReq.url)) {
      return;
    }
    req.getSession((s) => {
      if (!s) {
        return;
      }
      clearTimeout(timer);
      sessions.push(s);
      if (sessions.length >= MAX_LENGTH) {
        writeSessions(databasePath);
      } else {
        // 10秒之内没满10条强制写入
        timer = setTimeout(() => writeSessions(databasePath), 10000);
      }
    });
  });

  server.on('close', () => {
    clearTimeout(timer);
    writeSessions(storage.getProperty('databasePath'));
    sqliteStorage.close().catch((error) => {
      logError('关闭 SQLite 存储失败', error);
    });
  });
};
