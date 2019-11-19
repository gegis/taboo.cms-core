const socketIO = require('socket.io');
const Logger = require('./Logger');
const EventsEmitter = require('./EventsEmitter');

class SocketsServer {
  constructor(config) {
    this.config = config;
    this.io = null;
    this.eventsToRegister = [];
  }

  start(server) {
    if (this.config.sockets.port) {
      Logger.info(`Starting sockets server on port ${this.config.sockets.port}`);
      this.io = socketIO(this.config.sockets.port, {
        path: this.config.sockets.path,
      });
    } else {
      Logger.info(`Starting sockets server on port ${this.config.server.port}`);
      this.io = socketIO(server, { path: this.config.sockets.path });
    }

    // On New Socket Connection From Client
    this.io.on('connection', socket => {
      socket.on('disconnect', this.onClientDisconnect.bind(this, socket));
      socket.on('join', this.onClientJoin.bind(this, socket));
      socket.on('leave', this.onClientLeave.bind(this, socket));
    });
  }

  onClientDisconnect(socket) {
    // On client socket disconnect - leave the rooms
    this.config.sockets.rooms.map(room => {
      socket.leave(room);
      return room;
    });
  }

  onClientJoin(socket, room, cb) {
    if (this.config.sockets.rooms.indexOf(room) !== -1) {
      socket.join(room);
      this.io.to(room).emit('join', { clients: this.getClientsCountInRoom(room) });
      EventsEmitter.emit('socket-client-join', {
        socket,
        room,
      });
      this.registerEvents(socket);
      if (cb && typeof cb === 'function') {
        cb(null, room);
      }
    }
  }

  registerEvents(socket) {
    this.eventsToRegister.map(item => {
      socket.on(item.event, item.next);
    });
  }

  onClientLeave(socket, room, cb) {
    if (this.config.sockets.rooms.indexOf(room) !== -1) {
      socket.leave(room);
      if (cb && typeof cb === 'function') {
        cb(null, room);
      }
    }
  }

  getClientsCountInRoom(room) {
    if (Object.prototype.hasOwnProperty.call(this.io.sockets.adapter.rooms, room)) {
      return this.io.sockets.adapter.rooms[room].length;
    }
    return 0;
  }

  emit(room, event, data) {
    if (this.config.sockets.rooms.indexOf(room) !== -1) {
      this.io.to(room).emit(event, data);
    }
  }

  register(event, next) {
    this.eventsToRegister.push({
      event: event,
      next: next,
    });
  }
}

module.exports = SocketsServer;
