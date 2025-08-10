#!/bin/bash
# Install dependencies and run backend

echo "Installing dependencies..."
sudo apt-get update
sudo apt-get install -y nodejs npm

echo "Setting up backend..."
npm install express body-parser

echo "Done. To start the backend, run: node backend.js"
