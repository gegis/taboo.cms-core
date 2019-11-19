const EventEmitter = require('events');

class EventsEmitter extends EventEmitter {
  constructor(config) {
    const { server: { eventsMaxListeners = null } = {} } = config;
    super();
    this.config = config;
    if (eventsMaxListeners) {
      this.setMaxListeners(eventsMaxListeners);
    }
  }
}

module.exports = EventsEmitter;
