const { EventEmitter } = require('events');

const notificationEmitter = new EventEmitter();
// Allow many SSE listeners without warnings
notificationEmitter.setMaxListeners(0);

const emitNotification = (notification) => {
  if (!notification) return;
  notificationEmitter.emit('notification', notification);
};

module.exports = {
  notificationEmitter,
  emitNotification
};
