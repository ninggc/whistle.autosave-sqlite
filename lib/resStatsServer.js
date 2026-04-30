const { check: checkFilter, update: updateFilter } = require('./filter');
const createSqliteStorage = require('./sqliteStorage');
const { normalizeContext } = require('./contextDb');

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

const normalizeText = (value) => {
  value = typeof value === 'string' ? value.trim() : '';
  return value || '';
};

const normalizeMaxDbSize = (value) => {
  value = Number(value);
  if (!Number.isFinite(value) || value < 1) {
    return 100;
  }
  return Math.round(value);
};

module.exports = (server, { storage, config }) => {
  let sessions = [];
  let timer;
  const sqliteStorage = createSqliteStorage({
    username: config.username || '',
    onInfo: logInfo,
    onError: logError,
    getMaxDbSizeBytes() {
      return normalizeMaxDbSize(storage.getProperty('maxDbSizeMB')) * 1024 * 1024;
    },
  });

  const getCurrentContext = (databasePath) => normalizeContext({
    scene: normalizeText(storage.getProperty('scene')),
    description: normalizeText(storage.getProperty('description')),
    sceneMappings: normalizeText(storage.getProperty('sceneMappings')),
    filterText: normalizeText(storage.getProperty('filterText')),
    databasePath,
    maxDbSizeMB: normalizeMaxDbSize(storage.getProperty('maxDbSizeMB')),
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
    req.getSession((session) => {
      if (!session) {
        return;
      }
      clearTimeout(timer);
      const context = getCurrentContext(databasePath);
      sessions.push({
        session,
        scene: context.scene,
        description: context.description,
        context,
      });
      if (sessions.length >= MAX_LENGTH) {
        writeSessions(databasePath);
      } else {
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
