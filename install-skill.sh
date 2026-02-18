#!/bin/bash
# Install ClawGate skill globally from GitHub

set -e

SKILL_NAME="clawgate"
INSTALL_DIR="${HOME}/.openclaw/skills/${SKILL_NAME}"
REPO_URL="https://github.com/alubarikanikoko/clawgate.git"
TEMP_DIR=$(mktemp -d)

echo "Installing ClawGate skill from GitHub..."

# Clone to temp directory
git clone --depth 1 "$REPO_URL" "$TEMP_DIR" 2>/dev/null || {
    echo "Error: Failed to clone repository"
    rm -rf "$TEMP_DIR"
    exit 1
}

# Remove existing skill installation
if [ -d "$INSTALL_DIR" ]; then
    echo "Removing existing skill installation..."
    rm -rf "$INSTALL_DIR"
fi

# Copy skill to global skills directory
mkdir -p "$INSTALL_DIR"
cp -r "$TEMP_DIR/skills/${SKILL_NAME}/"* "$INSTALL_DIR/"

# Cleanup
rm -rf "$TEMP_DIR"

echo "✅ ClawGate skill installed to: $INSTALL_DIR"
echo ""
echo "Skill contents:"
ls -la "$INSTALL_DIR/"
