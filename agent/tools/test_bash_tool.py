import subprocess

_base_path = "/Users/sifatul/coding/cli-agent/agent/tmp/project1"
result = subprocess.run(
    "which npm",
    shell=True,
    capture_output=True,
    text=True,
    timeout=10,
    cwd=_base_path,
)
print(result.stdout)

