///<reference path="./typings/index.d.ts"/>
import * as Net from 'net';
import * as _ from 'lodash';
import { getProperIP } from 'utils';
import Client from 'client';
import ServerDetails from 'serverdetails';
import GlobalHandlers from 'globalhandlers';
import { ConfigServer, ConfigOptions } from 'configloader';
import RoutingServer from 'routingserver';
import Blacklist from 'blacklist';
import PacketTypes from 'packettypes';
import {PacketFactory} from 'utils';
import GlobalTracking from 'globaltracking';
import Logger from 'logger';

class ListenServer {
  idCounter: number;
  clients: Client[];
  servers: { [id: string]: RoutingServer };
  options: ConfigOptions;
  port: number;
  routingServers: RoutingServer[];
  serversDetails: { [id: string]: ServerDetails };
  globalHandlers: GlobalHandlers;
  ServerHandleError: (error: Error) => void;
  ServerHandleSocket: (socket: Net.Socket) => void;
  ServerHandleStart: () => void;
  server: Net.Server;
  globalTracking: GlobalTracking;
  logging: Logger;

  constructor(info: ConfigServer, serversDetails: { [id: string]: ServerDetails }, globalHandlers: GlobalHandlers, servers: { [id: string]: RoutingServer }, options: ConfigOptions, globalTracking: GlobalTracking, logging: Logger) {
    this.idCounter = 0;
    this.clients = [];
    this.servers = servers;
    this.options = options;
    this.port = info.listenPort;
    this.routingServers = info.routingServers;
    this.serversDetails = serversDetails;
    this.globalHandlers = globalHandlers;
    this.globalTracking = globalTracking;
    this.logging = logging;

    for (var i = 0; i < this.routingServers.length; i++) {
      this.serversDetails[this.routingServers[i].name] = {
        clientCount: 0,
        disabled: false,
        failedConnAttempts: 0
      };
    }


    this.ServerHandleError = this.handleError.bind(this);
    this.ServerHandleStart = this.handleStart.bind(this);

    // Listen Server
    this.server = Net.createServer();
    this.server.on('connection', (socket) => {
      this.handleSocket(socket)
        .catch((e) => {
          if (this.options.log.clientError) {
            if (this.options.log.outputToConsole) {
              console.log(`Socket Error: ${e}`);
            }
            this.logging.appendLine(e);
          }
        });
    });
    this.server.listen(this.port, this.ServerHandleStart);
    this.server.on('error', this.ServerHandleError);
  }

  // Finds server with lowest client count
  chooseServer(): RoutingServer | null {
    let chosenServer: RoutingServer | null = null;
    let currentClientCount: number | null = null;
    let details: ServerDetails;
    for (let i: number = 0; i < this.routingServers.length; i++) {
      details = this.serversDetails[this.routingServers[i].name];

      // Even if the server has been disabled, if we have no current choice, we must use it
      if (!details.disabled || currentClientCount === null) {
        // Favour either lower player count or non-disability
        if (currentClientCount === null || chosenServer === null || details.clientCount < currentClientCount || this.serversDetails[chosenServer.name].disabled) {
          chosenServer = this.routingServers[i];
          currentClientCount = details.clientCount;
        }
      }
    }

    return chosenServer;
  }

  updateInfo(info: ConfigServer): void {
    this.port = info.listenPort;
    this.routingServers = info.routingServers;

    // Reset disabled and failedConnAttempts but only
    // reset counts if it didn't already exist as a server
     let details;
     for (let i = 0; i < this.routingServers.length; i++) {
      if (this.serversDetails[this.routingServers[i].name]) {
        details = this.serversDetails[this.routingServers[i].name]
        details.disabled = false;
        details.failedConnAttempts = 0;
      } else {
        this.serversDetails[this.routingServers[i].name] = {
          clientCount: 0,
          disabled: false,
          failedConnAttempts: 0
        };
      }
     }
  }

  shutdown(): void {
    if (this.options.log.outputToConsole) {
      console.log(`\u001b[33m[${process.pid}] Server on ${this.port} is now shutting down.\u001b[0m`);
    }
    
    this.logging.appendLine(`[${process.pid}] Server on ${this.port} is now shutting down.`);
    for (let i: number = 0; i < this.clients.length; i++) {
      this.clients[i].server.socket.removeListener('data', this.clients[i].ServerHandleData);
      this.clients[i].server.socket.removeListener('error', this.clients[i].ServerHandleError);
      this.clients[i].server.socket.removeListener('close', this.clients[i].ServerHandleClose);
      this.clients[i].handleClose = function () { };
      this.clients[i].socket.destroy();
    }
    this.clients = [];
    this.server.removeListener('error', this.ServerHandleError);
    this.server.close();

    // Reset counts
    let details: ServerDetails;
    for (var i = 0; i < this.routingServers.length; i++) {
      details = this.serversDetails[this.routingServers[i].name];
      details.clientCount = 0;
    }
  }

  handleStart(): void {
    if (this.options.log.outputToConsole) {
      console.log(`\u001b[32m[${process.pid}] Server on ${this.port} started.\u001b[0m`);
    }

    this.logging.appendLine(`[${process.pid}] Server on ${this.port} started.`);
  }

  /* Gets a server to connect to for a new socket connection, sets up the appropriate handlers
   * and checks if their IP is blacklisted */
  async handleSocket(socket: Net.Socket) {
    let i = 0;
    let chosenServer: RoutingServer | null = this.chooseServer();
    if (chosenServer === null) {
      if (this.options.log.outputToConsole) {
        console.log(`No servers available for ListenServer[Port: ${this.port}]`)
      }

      this.logging.appendLine(`No servers available for ListenServer[Port: ${this.port}]`);
      socket.destroy();
      return;
    }
    
    let client = new Client(this.idCounter++, socket, chosenServer, this.serversDetails, this.globalHandlers, this.servers, this.options, this.globalTracking, this.logging);
    this.clients.push(client);

    socket.on('error', (e: Error) => {
      try {
        client.handleError(e);
      } catch (error) {
        if (this.options.log.clientError) {
          if (this.options.log.outputToConsole) {
            console.log(`handleError ERROR: ${e}`);
          }

          this.logging.appendLine(`handleError Error: ${e}`)
        }
      }
    });

    // Close inactive sockets
    socket.on('timeout', () => {
      if (this.options.log.clientTimeouts) {
        if (this.options.log.outputToConsole) {
          console.log(`Socket Timeout: ${client.getName()} ${client.ID}`);
        }

        this.logging.appendLine(`Socket Timeout: ${client.getName()} ${client.ID}`);
      }
      socket.destroy();
    });

    socket.on('close', () => {
      try {
        if (this.options.log.clientDisconnect) {
          if (this.options.log.outputToConsole) {
            console.log(`[${process.pid}] Client: ${getProperIP(socket.remoteAddress)} disconnected ${client.server.name}: ${this.serversDetails[client.server.name].clientCount-1}]`);
          }

          this.logging.appendLine(`[${process.pid}] Client: ${getProperIP(socket.remoteAddress)} disconnected ${client.server.name}: ${this.serversDetails[client.server.name].clientCount-1}]`);
        }
        client.handleClose();
        for (let i: number = 0; i < this.clients.length; i++) {
          if (this.clients[i].ID === client.ID) {
            this.clients.splice(i, 1);
            break;
          }
        }
      } catch (e) {
        if (this.options.log.clientError) {
          if (this.options.log.outputToConsole) {
            console.log(`SocketCloseEvent ERROR: ${e}`);
          }

          this.logging.appendLine(`SocketCloseEvent ERROR: ${e}`);
        }
      }
    });

    if (this.options.blacklist.enabled) {
      try {
        // Update client on current operation
        let statusPacket: string = (new PacketFactory())
          .setType(PacketTypes.Status)
          .packInt32(1)
          .packString("Checking IP... ")
          .data();

        socket.write(new Buffer(statusPacket, 'hex'));
        
        // Get blocked status
        let blocked: boolean = await Blacklist.checkIP(getProperIP(socket.remoteAddress), this.options.blacklist.apiKey);
        if (blocked) {
          let kickPacket: string = (new PacketFactory())
            .setType(PacketTypes.Disconnect)
            .packString("Connecting using a Host Provider is not allowed.")
            .data();
          socket.write(new Buffer(kickPacket, 'hex'));

          // Allow time for client to receive and process kick packet
          setTimeout(() => {
            socket.destroy();
          }, 1000);

          if (this.options.log.clientBlocked) {
            if (this.options.log.outputToConsole) {
              console.log(`${process.pid}] Client: ${getProperIP(socket.remoteAddress)} was blocked from joining.`);
            }

            this.logging.appendLine(`${process.pid}] Client: ${getProperIP(socket.remoteAddress)} was blocked from joining.`);
          }
          return;
        }
      } catch (e) {
        if (this.options.log.outputToConsole) {
          console.log("Blacklist check failed: ");
          console.log(e);
        }

        this.logging.appendLine("Blacklist check failed: ");
        this.logging.appendLine(e);
      }
    }

    if (this.options.log.clientConnect) {
      if (this.options.log.outputToConsole) {
        console.log(`[${process.pid} Client: ${getProperIP(socket.remoteAddress)}  connected [${chosenServer.name}: ${this.serversDetails[chosenServer.name].clientCount + 1}]`);
      }

      this.logging.appendLine(`[${process.pid} Client: ${getProperIP(socket.remoteAddress)}  connected [${chosenServer.name}: ${this.serversDetails[chosenServer.name].clientCount + 1}]`);
    }

    socket.on('data', (data: Buffer) => {
      try {
        client.handleDataSend(data);
      } catch (e) {
        if (this.options.log.clientError) {
          if (this.options.log.outputToConsole) {
            console.log(`HandleDataSend ERROR: ${e}`);
          }

          this.logging.appendLine(`HandleDataSend ERROR: ${e}`);
        }
      }
    });

    socket.setTimeout(this.options.socketTimeout);
  }

  handleError(error: Error) {
    if (this.options.log.outputToConsole) {
      console.log(`\u001b[31m Server on ${this.port} encountered an error: ${error}.\u001b[0m`);
    }

    this.logging.appendLine(`Server on ${this.port} encountered an error: ${error}.`);
  }
}

export default ListenServer;