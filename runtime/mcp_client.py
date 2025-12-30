"""
Simple MCP Client for calling MCP tools via subprocess and JSON-RPC.
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict


def wsl_to_windows_path(linux_path: str) -> str:
    """Convert WSL Linux path to Windows path"""
    try:
        result = subprocess.run(
            ['wslpath', '-w', linux_path],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except:
        pass

    # Fallback: manual conversion for /home paths
    if linux_path.startswith('/home/'):
        # Convert /home/user/... to \\wsl$\Ubuntu\home\user\...
        return f"\\\\wsl$\\Ubuntu{linux_path}"

    return linux_path


def resolve_command(command: str) -> str:
    """Resolve command path, handling WSL node.exe specially"""
    if command == 'node':
        # Check for node in common WSL locations
        wsl_node = '/mnt/c/Program Files/nodejs/node.exe'
        if os.path.exists(wsl_node):
            return wsl_node

    return command


def load_mcp_config() -> Dict[str, Any]:
    """Load MCP server configuration from .mcp.json"""
    config_path = Path(__file__).parent.parent / ".mcp.json"

    if not config_path.exists():
        raise FileNotFoundError(f"MCP configuration not found at {config_path}")

    with open(config_path, 'r') as f:
        return json.load(f)


def get_server_command(server_name: str) -> tuple[str, list]:
    """Get the command and args for a specific MCP server"""
    config = load_mcp_config()

    if server_name not in config.get('mcpServers', {}):
        raise ValueError(f"MCP server '{server_name}' not found in configuration")

    server_config = config['mcpServers'][server_name]
    command = server_config['command']
    args = server_config.get('args', [])

    return command, args


def call_mcp_tool(tool_id: str, params: Dict[str, Any]) -> Any:
    """
    Call an MCP tool via JSON-RPC.

    Args:
        tool_id: Tool identifier in format "server__tool" (e.g., "youtube-transcript__get_transcript")
        params: Tool parameters as a dictionary

    Returns:
        Tool result (parsed from JSON response)

    Raises:
        ValueError: If tool_id format is invalid or server not found
        RuntimeError: If MCP server returns an error
    """
    # Parse tool_id into server and tool name
    if '__' not in tool_id:
        raise ValueError(f"Invalid tool_id format: {tool_id}. Expected 'server__tool'")

    server_name, tool_name = tool_id.split('__', 1)

    # Get server command
    command, args = get_server_command(server_name)

    # Resolve command path (handles WSL node.exe)
    command = resolve_command(command)

    # Convert args to Windows paths if using Windows node.exe
    if command.endswith('.exe'):
        args = [wsl_to_windows_path(arg) if arg.startswith('/') else arg for arg in args]

    # Build JSON-RPC request for tool call
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": params
        }
    }

    # Call MCP server via subprocess
    try:
        process = subprocess.Popen(
            [command] + args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Send request
        stdout, stderr = process.communicate(
            input=json.dumps(request) + '\n',
            timeout=60
        )

        # Parse response
        if not stdout.strip():
            error_msg = stderr.strip() if stderr else "No response from MCP server"
            raise RuntimeError(f"MCP server error: {error_msg}")

        # MCP servers may send multiple JSON-RPC messages, find the response
        for line in stdout.strip().split('\n'):
            try:
                response = json.loads(line)

                # Check for JSON-RPC error
                if 'error' in response:
                    raise RuntimeError(f"MCP tool error: {response['error']}")

                # Extract result
                if 'result' in response:
                    result = response['result']

                    # Extract content from MCP response
                    if isinstance(result, dict) and 'content' in result:
                        content = result['content']

                        # If content is a list, get first text item
                        if isinstance(content, list) and len(content) > 0:
                            first_item = content[0]

                            if isinstance(first_item, dict) and 'text' in first_item:
                                text_content = first_item['text']

                                # Try to parse as JSON
                                try:
                                    return json.loads(text_content)
                                except json.JSONDecodeError:
                                    return text_content

                        return content

                    return result

            except json.JSONDecodeError:
                continue

        # If we get here, no valid response was found
        raise RuntimeError(f"Failed to parse MCP response: {stdout}")

    except subprocess.TimeoutExpired:
        process.kill()
        raise RuntimeError(f"MCP server '{server_name}' timed out")
    except FileNotFoundError:
        raise RuntimeError(f"MCP server command not found: {command}")
    except Exception as e:
        raise RuntimeError(f"Failed to call MCP tool '{tool_id}': {e}")
