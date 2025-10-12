import subprocess
import re
from langchain_core.tools import tool
from pydantic import BaseModel, Field


_base_path = "/Users/sifatul/coding/cli-agent/agent/tmp/project1"
_dangerous_commands = [
    "del",
    "format",
    "mkfs",  # File deletion
    "dd",  # Disk operations
    "sudo",
    "su",
    "doas",  # Privilege escalation
    "shutdown",
    "reboot",
    "halt",
    "poweroff",  # System control
    "kill",
    "killall",
    "pkill",  # Process killing
    "chmod",
    "chown",
    "chgrp",  # Permission changes
    "crontab",  # Scheduled tasks
    "systemctl",
    "service",  # Service management
    "iptables",
    "ufw",
    "firewall-cmd",  # Firewall
    "passwd",
    "useradd",
    "userdel",
    "groupadd",  # User management
    "curl -X POST",
    "curl -X PUT",
    "curl -X DELETE",  # Write operations via curl
    "wget --post",
    "wget --method=POST",  # Write operations via wget
]
_dangerous_patterns = [
    r">\s*/dev/",  # Writing to device files
    r">\s*/etc/",  # Writing to system config
    r">\s*/sys/",  # Writing to sysfs
    r">\s*/proc/",  # Writing to procfs
    r":\(\)\s*\{",  # Fork bomb pattern
    r"chmod\s+(-R\s+)?777",  # Dangerous permissions
    r"eval\s+",  # Code evaluation
    r"exec\s+",  # Code execution
    r"\$\(.*\)",  # Command substitution (potential injection)
    r"`.*`",  # Command substitution (backticks)
]


def _is_command_safe(command: str) -> tuple[bool, str]:
    command_lower = command.lower().strip()
    if len(command) > 10000:
        return False, "Command exceeds maximum length (10000 characters)"
    for dangerous_cmd in _dangerous_commands:
        if re.search(r"\b" + re.escape(dangerous_cmd) + r"\b", command_lower):
            return False, f"Dangerous command detected: {dangerous_cmd}"
    for pattern in _dangerous_patterns:
        if re.search(pattern, command):
            return False, f"Dangerous pattern detected: {pattern}"
    return True, ""


def _format_result(stdout: str, stderr: str, returncode: int):
    formatted = f"""\
Success: {"Yes" if returncode == 0 else "No"}
Returncode: {returncode}"""
    if stdout:
        formatted = formatted + f"\n=== STDOUT ===\n{stdout}"
    if stderr:
        formatted = formatted + f"\n=== STDERR ===\n{stderr}"
    return formatted.strip()


class BashToolArgsSchema(BaseModel):
    command: str = Field(
        ...,
        description="The bash command to execute. Do not prefix the bash command with something like '/bin/bash' or 'bash -lc' provide the actual command to execute.",
    )
    timeout: int | None = Field(
        10,
        description="A timeout value in seconds for the command. Default is 10 seconds.",
    )


@tool(
    "bash",
    description="Use this tool to execute any bash commands within the working directory. \
    The tool will execute your bash command and return to you the stdout and the stderr.",
    args_schema=BashToolArgsSchema,
    parse_docstring=False,
)
def bash_tool(args: BashToolArgsSchema) -> str:
    is_safe, reason = _is_command_safe(args.command)
    if not is_safe:
        return _format_result("", f"SECURITY: Command blocked - {reason}", -1)

    try:
        result = subprocess.run(
            args.command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=args.timeout,
            cwd=_base_path,
        )
        return _format_result(result.stdout, result.stderr, result.returncode)

    except subprocess.TimeoutExpired:
        return _format_result("", f"Command timed out after {args.timeout} seconds", -1)
    except Exception as e:
        return _format_result("", f"Error executing command: {str(e)}", -1)
