#!/bin/bash

# Color definitions
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}   CodeSentinel - AI Code Review & Bug Tracker     ${NC}"
echo -e "${BLUE}==================================================${NC}"

# Get directory where run.sh is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

# Check Python installation
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 is not installed. Please install Python to continue.${NC}"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment (venv)...${NC}"
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to create virtual environment.${NC}"
        exit 1
    fi
fi

# Install/update dependencies
echo -e "${YELLOW}Verifying/installing dependencies...${NC}"
./venv/bin/pip install -r backend/requirements.txt
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Dependency installation failed.${NC}"
    exit 1
fi

echo -e "${GREEN}Dependencies verified successfully!${NC}"
echo -e "${GREEN}Starting CodeSentinel server...${NC}"
echo -e "${BLUE}Open your browser and navigate to: http://localhost:8000${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop the server.${NC}"
echo -e "${BLUE}==================================================${NC}"

# Start the server
PYTHONPATH=backend ./venv/bin/python3 backend/main.py
