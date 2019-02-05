'use strict';

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf, colorize } = format;
const _ = require('lodash');

const myFormat = printf(info => {
    return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
});

const defaultLabel = 'common';

class LoggerFactory {
    constructor(config) {

        config = config || {};

        var configDefaults = {};
        configDefaults.debug = {};
        configDefaults.debug.loggingLevel = 'info';
        configDefaults.debug.logFile = 'logger.log';

        // merge opt with default config
        _.defaults(config, configDefaults);

       this.loggerTransports = {
            console: new transports.Console({ level: config.debug.loggingLevel }),
            file: new transports.File({ filename: config.debug.logFile, level: config.debug.loggingLevel, options: { flags: 'w' } })
        };

        this.logger = createLogger({
            format: combine(
                timestamp(),
                myFormat
            ),
            transports: [
                this.loggerTransports.console,
                this.loggerTransports.file
            ]
        });

    }

    info(label, message) {
        this.log(
                'info',
                message,
                label
        );
    }

    debug(label, message) {
        this.log(
                'debug',
                message,
                label
        );
    }

    error(label, message) {
        this.log(
                'error',
                message,
                label
        );
    }

    verbose(label, message) {
        this.log(
            'verbose',
            message,
            label
        );
    }

    log(level, message, label) {
        this.logger.log({
            level,
            message,
            label
        });
    }

}

module.exports = {
    LoggerFactory
};