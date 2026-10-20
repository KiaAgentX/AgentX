import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.isProd ? 'info' : 'debug',
  base: { app: 'KIA-DropAgentX' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,app' },
        },
      }),
});
