const { vi } = require("vitest") || {};

const fn = typeof vi?.fn === 'function' ? vi.fn : (() => {
  const f = (...args) => f._impl ? f._impl(...args) : undefined;
  f.mockImplementation = (impl) => { f._impl = impl; return f; };
  f.mockReturnValue = (val) => { f._impl = () => val; return f; };
  f.mockClear = () => { f._impl = null; };
  f.mock = { calls: [] };
  return f;
});

module.exports = {
  app: {
    whenReady: () => ({ then: (cb) => { module.exports._whenReadyCb = cb; } }),
    on: fn(),
    dock: { hide: fn() },
    quit: fn(),
    setLoginItemSettings: fn(),
    isReady: () => true,
  },
  Tray: fn().mockImplementation(() => ({
    setContextMenu: fn(),
    setTitle: fn(),
    setToolTip: fn(),
  })),
  Menu: { buildFromTemplate: fn().mockImplementation((t) => t) },
  Notification: fn().mockImplementation(() => ({ show: fn() })),
  nativeImage: { createEmpty: fn().mockImplementation(() => "empty") },
  powerMonitor: { on: fn() },
};
