FROM node:20-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv sqlite3 git curl jq sudo \
    tmux htop vim nano ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp (required for YouTube transcript fallback)
# Pin version for reproducibility - update periodically
RUN pip3 install yt-dlp==2025.12.8 --break-system-packages

# Use existing 'node' user (UID 1000) - required for claude --dangerously-skip-permissions
# The node:20-bookworm image already has this user
RUN echo node ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

# Install uv (required by CC-v2) - as root first
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Install qlty (code quality - required by CC-v2)
RUN curl -fsSL https://qlty.sh/install.sh | sh
ENV PATH="/root/.qlty/bin:$PATH"

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Setup for non-root user (node)
USER node
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/home/node/.local/bin:$PATH"

WORKDIR /workspace
