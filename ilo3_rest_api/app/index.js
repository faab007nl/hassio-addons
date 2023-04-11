const express = require('express');
const rateLimit = require('express-rate-limit')
const app = express();
const port = 3547;
const { NodeSSH } = require('node-ssh');
require('dotenv').config();

const limiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 10, // limit each IP to 10 requests per windowMs
    standardHeaders: true,
    legacyHeaders: true,
    message: async (request, response) => {
        return {
            "code": 429,
            "message": 'Too many requests, please try again later.'
        };
    },
})
app.use(limiter);

let sshConfig = {
    host: process.env.SSH_HOST,
    port: process.env.SSH_PORT,
    username: process.env.SSH_USERNAME,
    password: process.env.SSH_PASSWORD,
    algorithms: {
        kex: [
            "diffie-hellman-group14-sha1"
        ],
        serverHostKey: [ 'ssh-rsa', 'ssh-dss' ],
    }
};

const ssh = new NodeSSH();
const POWER = {
    OFF: 'off',
    ON: 'on',
    STARTED: 'started',
    STOPPED: 'stopped',
    UNKNOWN: 'unknown'
};
const COMMAND = {
    POWER: "power",
    POWER_ON: "power on",
    POWER_OFF: "power off"
};

let sshConnected = false;
let firstConnect = true;
let requestedPowerState = POWER.UNKNOWN;
let powerState = POWER.UNKNOWN;
let commandQueue = [];

const connect = () => {
    console.log("");
    console.log('Connecting to ILO...');
    console.log("-----------------------");
    console.log('Host:     ' + sshConfig.host + ':' + sshConfig.port);
    console.log('Username: ' + sshConfig.username);
    console.log("-----------------------");

    try{
        ssh.connect(sshConfig).then(() => {
            console.log("");
            console.log('Connected to SSH');
            setTimeout(() => {
                sshConnected = true;
                if(firstConnect){
                    firstConnect = false;
                    startProcessLoop();
                }
            }, 500);

            setTimeout(() => {
                console.log("");
                console.log('Disconnecting from SSH');
                ssh.disconnect();
                setTimeout(() => {
                    connect();
                }, 500);
            }, 1000 * 60 * 5);
        });
    }catch (e) {
        console.log('connect', e);
    }
};

const processCommandResult = (command, response) => {
    let parts = response.split(":");
    let power_state = parts[parts.length - 1].toLowerCase().trim();

    if(command === COMMAND.POWER){
        if (requestedPowerState === POWER.ON && powerState === POWER.STARTED) {
            requestedPowerState = POWER.UNKNOWN;
        }
        if (requestedPowerState === POWER.OFF && powerState === POWER.STOPPED) {
            requestedPowerState = POWER.UNKNOWN;
        }
        if(power_state === "on") {
            powerState = POWER.STARTED;
        }
        if(power_state === "off") {
            powerState = POWER.STOPPED;
        }
    }
};

const startServer = () => {
    if (!sshConnected) return;
    console.log('Starting server...');
    try{
        ssh.execCommand(COMMAND.POWER_ON).then((result) => {
            processCommandResult(COMMAND.POWER_ON, result.stdout);
        });
    }catch (e) {
        console.log('start', e);
    }
}
const stopServer = () => {
    if (!sshConnected) return;
    console.log('Stopping server...');
    try{
        ssh.execCommand(COMMAND.POWER_OFF).then((result) => {
            processCommandResult(COMMAND.POWER_OFF, result.stdout);
        });
    }catch (e) {
        console.log('stop', e);
    }
}
const fetchPowerState = () => {
    if (!sshConnected) return;
    console.log('Fetching power state...');
    try{
        ssh.execCommand(COMMAND.POWER).then((result) => {
            processCommandResult(COMMAND.POWER, result.stdout);
        });
    }catch (e) {
        console.log('power', e);
    }
}


const startProcessLoop = () => {
    console.log('Starting fetch loop...');
    setInterval(() => {
        console.log('Pushing command to queue...');
        commandQueue.push(COMMAND.POWER);

        if (requestedPowerState === POWER.ON && powerState === POWER.STOPPED) {
            commandQueue.push(COMMAND.POWER_ON);
        }
        if (requestedPowerState === POWER.OFF && powerState === POWER.STARTED) {
            commandQueue.push(COMMAND.POWER_OFF);
        }
    }, 4000);
    setInterval(() => {
        console.log('Processing command from queue...');
        if (commandQueue.length > 0) {
            let command = commandQueue.shift();
            if (command === COMMAND.POWER_ON) {
                startServer();
            }
            if (command === COMMAND.POWER_OFF) {
                stopServer();
            }
            if (command === COMMAND.POWER) {
                fetchPowerState();
            }
        }
    }, 2000);
};

app.get('/', (req, res) => {
    res.status(200).json({
        "message": "ILO Rest API up and running!",
        "code": 200
    });
});

app.get('/power', (req, res) => {
    if(!sshConnected){
        res.status(503).json({
            "message": "SSH not connected",
            "code": 503
        });
        return;
    }

    res.status(200).json({
        "powered_on": powerState === POWER.STARTED,
        "power_state": powerState,
        "code": 200
    });
});
app.get('/power/on', (req, res) => {
    if(!sshConnected){
        res.status(503).json({
            "message": "SSH not connected",
            "code": 503
        });
        return;
    }
    if(powerState === POWER.STARTED){
        res.status(409).json({
            "message": "Already on",
            "code": 409
        });
        return;
    }

    requestedPowerState = POWER.ON;
    res.status(202).json({
        'message': 'Starting server...',
        "power_state": powerState,
        "code": 202
    });
});
app.get('/power/off', (req, res) => {
    if(!sshConnected){
        res.status(503).json({
            "message": "SSH not connected",
            "code": 503
        });
        return;
    }
    if(powerState === POWER.STOPPED){
        res.status(409).json({
            "message": "Already off",
            "code": 409
        });
        return;
    }

    requestedPowerState = POWER.OFF;
    res.status(202).json({
        'message': 'Stopping server...',
        "power_state": powerState,
        "code": 202
    });
});

app.listen(port, () => {
    console.log(`ILO3 REST API listening on port ${port}`);
    connect();
});