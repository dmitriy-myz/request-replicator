FROM node:10
ENV CONFIG_FILE /config.json
ADD replicator.js /
ADD config.json /

CMD node replicator.js $CONFIG_FILE

