from bash_tool import bash_tool


print(bash_tool("mkdir src"))
print()
print(bash_tool("touch src/index.ts"))
print()
print(bash_tool("ls -Al"))
print()
print(bash_tool("cd src"))
print()
print(bash_tool("ls -Al"))
print()
print(bash_tool("echo 'console.log(\"Hello world\");' > src/index.ts"))
print()
print(bash_tool("cat src/index.ts"))
print()
print(bash_tool("patch src/index.ts"))
