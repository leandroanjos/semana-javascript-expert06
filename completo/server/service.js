import fs from "fs";
import fsPromises from "fs/promises";
import { join, extname } from "path";
import { PassThrough, Writable, pipeline } from "stream";
//import streamsPromises from "stream/promises";
import childProcess from "child_process";
import { randomUUID } from "crypto";
import Throttle from "throttle";
import { once } from "events";
import config from "./config.js";
import { logger } from "./util.js";

const {
  dir: { publicDir },
  constants: { fallbackBitRate, englishConversation, bitRateDivisor },
} = config;

export class Service {
  constructor() {
    this.clientStreams = new Map();
    this.currentSong = englishConversation;
    this.currentBitRate = 0;
    this.currentReadable = {};
    this.throttleTransform = {};

    this.startStreamming();
  }

  createClientStream() {
    const id = randomUUID();
    const clientStream = new PassThrough();
    this.clientStreams.set(id, clientStream);

    return {
      id,
      clientStream,
    };
  }

  removeClientStream(id) {
    this.clientStreams.delete(id);
  }

  _executeSoxCommand(args) {
    return childProcess.spawn("sox", args);
  }

  async getBitRate(song) {
    try {
      const args = ["--i", "-B", song];
      const {
        stderr, // Erros
        stdout, // Logs
        // stdin, // Enviar Dados como stream
      } = this._executeSoxCommand(args);

      await Promise.all([once(stdout, "readable"), once(stderr, "readable")]);

      const [success, error] = [stdout, stderr].map((stream) => stream.read());

      if (error) {
        return await Promise.reject(error);
      }

      return success.toString().trim().replace("/k/", "000");
    } catch (error) {
      logger.error(`Deu ruim no bitRate: ${error}`);
      return fallbackBitRate;
    }
  }

  broadCast() {
    return Writable({
      write: (chunk, enc, cb) => {
        for (const [id, stream] of this.clientStreams) {
          if (stream.writableEnded) {
            this.removeClientStream(id);
            continue;
          }
          stream.white(chunk);
        }
        cb();
      },
    });
  }

  async startStreamming() {
    logger.info(`Starting with ${this.currentSong}`);
    const bitRate = (this.currentBitRate =
      (await this.getBitRate(this.currentSong)) / bitRateDivisor);
    const throttleTransform = (this.throttleTransform = new Throttle(bitRate));

    const songReadable = (this.currentReadable = await this.createFileStream(
      this.currentSong
    ));

    return await pipeline(songReadable, throttleTransform, this.broadCast());
  }

  async createFileStream(filename) {
    return await fs.createReadStream(filename);
  }

  async getFileInfo(file) {
    // file = "home/index.html"
    const fullFilePath = join(publicDir, file);
    // valida se o arquivo existe
    await fsPromises.access(fullFilePath);
    const fileType = extname(fullFilePath);
    return {
      type: fileType,
      name: fullFilePath,
    };
  }

  async getFileStream(file) {
    const { name, type } = await this.getFileInfo(file);
    return {
      stream: await this.createFileStream(name),
      type: type,
    };
  }
}
