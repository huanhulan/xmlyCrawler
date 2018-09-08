const eventEmitter = require('event-emitter');

function evtHubCreator(process) {
    const eventHub = eventEmitter({});
    process.on('message', (message => {
        const evt = message.evt;
        const payload = message.payload;
        eventHub.emit(evt, payload);
    }));

    eventHub.send = function (evt, payload) {
        try {
            process.send({
                evt,
                payload
            });
        } catch (e) {
            console.error('error when communicating, retry...');
            setTimeout(() => {
                process.send({
                    evt,
                    payload
                });
            }, 100);
        }
    }
    return eventHub
}

module.exports = evtHubCreator