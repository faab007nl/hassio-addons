#!/usr/bin/with-contenv bashio

export SSH_HOST=$(bashio::config 'SSH_HOST')
export SSH_PORT=$(bashio::config 'SSH_PORT')
export SSH_USERNAME=$(bashio::config 'SSH_USERNAME')
export SSH_PASSWORD=$(bashio::config 'SSH_PASSWORD')

npm install

node index.js