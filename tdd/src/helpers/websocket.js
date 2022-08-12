const WebSocket = require('ws');
const axios = require('axios');
const R = require('ramda');

const wsCreateServer = async ({
    host = 'localhost',
    port = '1337',
    endpoints,
    stream,
    request,
    response,
    stayOpen = false,
    delay = 500,
    onConnection = () => {},
}) => {
    try {
        await new Promise((resolve) => {
            const ti = setInterval(async () => {
                await axios(`http://${host}:${port}`)
                    .then(() => {})
                    .catch((err) => {
                        clearInterval(ti);
                        resolve();
                    });
            }, 500);
        });
        const wss = new WebSocket.Server({ host, port });

        wss.on('connection', (socket) => {
            try {
                onConnection();
                socket.on('message', (message) => {
                    if (endpoints) {
                        endpoints; //?
                        let messageObject = JSON.parse(message);

                        for (const endpoint of endpoints) {
                            if (R.equals(messageObject, JSON.parse(endpoint.request))) {
                                socket.send(endpoint.response);
                                if (!stayOpen) {
                                    socket.close();
                                    wss.close();
                                }
                            }
                        }
                    }
                    if (stream) {
                        let messageObject = JSON.parse(message);
                        if (R.equals(messageObject, JSON.parse(stream.request))) {
                            if (stream.response.constructor === Array) {
                                for (let msg of stream.response) {
                                    setInterval(() => socket.send(msg), delay);
                                }
                            } else {
                                socket.send(stream.response);
                            }
                        }
                    }
                    if (message === request) {
                        socket.send(response);
                        if (!stayOpen) {
                            socket.close();
                            wss.close();
                        }
                    }
                    if (message === JSON.stringify({ type: 'STOP' })) {
                        socket.close();
                        wss.close();
                    }
                });
            } catch (error) {
                socket.send(error);
            }
        });

        wss.on('error', (error) => {
            console.log('WebSocket server error: ', error);
        });

        wss.on('close', () => {
            console.log('WebSocket server: connection closed');
        });

        return async () => await closeWsServer({ host, port });
    } catch (error) {
        console.error(error);
    }
};

async function closeWsServer({ host = 'localhost', port = '1337' }) {
    try {
        const endpoint = `${host}:${port}`;
        console.log('🚀 ~ closeWsServer ~ endpoint', endpoint);

        await axios(`http://${endpoint}`)
            .then(() => {
                wsCreateAndSendMessage(JSON.stringify({ type: 'STOP' }), `ws://${endpoint}`)
                    .then(() => {
                        ({ res, socket }) => {
                            socket.close();
                            return res;
                        };
                    })
                    .catch((error) => {
                        // console.log(`closeWsServer error`, error);
                    });
            })
            .catch((error) => {
                // error;
            });

        await new Promise((resolve) => {
            const tm = setTimeout(async () => {
                await axios(endpoint)
                    .then((res) => {
                        res; //?
                    })
                    .catch((error) => {
                        error;
                    });
                clearTimeout(tm);
                resolve();
            }, 500);
        });
    } catch (error) {
        console.error(error);
    }
}

/**
 * Creating a `WebSocket` client and sending a message to `host`
 *
 * @param {string} message - the message sent through the created `WebSocket` server
 * @returns {string} response from server
 */
const wsCreateAndSendMessage = (message, host = 'ws://localhost:1337', timeout) => {
    try {
        return new Promise(async (resolve, reject) => {
            const socket = new WebSocket(host);
            const messages = [];

            socket.on('open', () => {
                socket.send(message);

                socket.on('message', async (message) => {
                    if (timeout) {
                        messages.push(message);
                    } else {
                        resolve({ socket, res: message });
                    }
                });

                socket.on('error', (error) => {
                    reject({ res: error, socket });
                });
            });
            if (timeout) {
                await new Promise((resolvePromise) => {
                    const tm = setTimeout(() => {
                        clearTimeout(tm);
                        resolve({ socket, res: messages });
                        resolvePromise();
                    }, timeout);
                });
            }
        });
    } catch (error) {
        console.error(error);
    }
};

async function waitForResponse(cb, timeout = 200) {
    return await new Promise((resolve) => {
        const tm = setTimeout(async () => {
            cb();
            clearTimeout(tm);
            resolve();
        }, timeout);
    });
}

// console.log(
//   JSON.stringify({

//     type: "CONNECT",
//     payload: {
//       exchanges: [
//         {
//           id: 74,
//           exchange: "binance",
//           publicKey:
//             "ADrY1a8Xlqmkl7auCyXCViddJiQs6DgnbGePEk4mEkOLNPmVrUbNVAKbxTMfumYQ",
//           secretKey:
//             "lsmxIP6jtQuoBrhImtkmGRPPqykLZx7S290U3zsd1NFRX6RXucX6pzi0iK7QU9ff",
//         },
//       ],
//     },
//   })
// );

module.exports = {
    waitForResponse,
    closeWsServer,
    wsCreateServer,
    wsCreateAndSendMessage,
};
