#!/bin/bash

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the backend directory
cd "$DIR"

# Check if running in development mode
if [ "$1" = "dev" ]; then
  echo "Starting server in development mode..."
  npm run dev
else
  echo "Starting server in production mode..."
  npm start
fi 