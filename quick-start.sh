#!/bin/bash

# Call Tagging Service - Quick Start Script

echo "================================"
echo "Call Tagging Service Quick Start"
echo "================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "✓ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env file and add your:"
    echo "   - Database credentials"
    echo "   - OpenRouter API key"
    echo ""
    echo "Press Enter after updating .env to continue..."
    read
fi

# Check if Docker is available
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo "Docker detected. Would you like to use Docker? (y/n)"
    read -r USE_DOCKER
    
    if [ "$USE_DOCKER" = "y" ] || [ "$USE_DOCKER" = "Y" ]; then
        echo "Starting services with Docker Compose..."
        docker-compose up -d
        
        echo ""
        echo "✓ Services started!"
        echo ""
        echo "Services are running:"
        echo "  - Database: localhost:5432"
        echo "  - API: http://localhost:3000"
        echo ""
        echo "View logs: docker-compose logs -f app"
        echo "Stop services: docker-compose down"
        exit 0
    fi
fi

# Local installation
echo "Setting up local installation..."
echo ""

# Check Node.js version
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "⚠️  Warning: Node.js version 18+ required. Current version: $(node -v)"
        echo "Please upgrade Node.js and try again."
        exit 1
    fi
    echo "✓ Node.js $(node -v) detected"
else
    echo "❌ Node.js not found. Please install Node.js 18+ and try again."
    exit 1
fi

# Check PostgreSQL
echo ""
echo "Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "✓ PostgreSQL detected"
    echo ""
    echo "Would you like to run database migration? (y/n)"
    read -r RUN_MIGRATION
else
    echo "⚠️  PostgreSQL not detected. Make sure PostgreSQL is running and accessible."
    RUN_MIGRATION="n"
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install
echo "✓ Dependencies installed"

# Run migration if requested
if [ "$RUN_MIGRATION" = "y" ] || [ "$RUN_MIGRATION" = "Y" ]; then
    echo ""
    echo "Running database migration..."
    npm run migrate
    echo "✓ Database migration complete"
fi

# Load sample data
echo ""
echo "Would you like to load sample data for testing? (y/n)"
read -r LOAD_SAMPLES

if [ "$LOAD_SAMPLES" = "y" ] || [ "$LOAD_SAMPLES" = "Y" ]; then
    echo "Loading sample data..."
    node src/utils/sampleDataLoader.js
    echo "✓ Sample data loaded"
fi

# Start the service
echo ""
echo "Would you like to start the service now? (y/n)"
read -r START_SERVICE

if [ "$START_SERVICE" = "y" ] || [ "$START_SERVICE" = "Y" ]; then
    echo ""
    echo "Starting Call Tagging Service..."
    echo "Press Ctrl+C to stop"
    echo ""
    npm start
else
    echo ""
    echo "Setup complete! Run 'npm start' to start the service."
fi

echo ""
echo "================================"
echo "Setup Complete!"
echo "================================"
echo ""
echo "Available commands:"
echo "  npm start         - Start the service"
echo "  npm run dev       - Start with auto-reload"
echo "  npm run migrate   - Run database migrations"
echo "  npm test          - Run tests"
echo ""
echo "API Endpoints available at http://localhost:3000"
echo "  GET  /health"
echo "  POST /api/process"
echo "  GET  /api/analytics"
echo "  GET  /api/high-priority"
echo "  GET  /api/tags/stats"
echo ""
