export const patchUsingGuide = `
<patch_use_policy>
- Prioritize using \`patch\` for updating files instead of cat or echo.
- \`patch\` consumes a unified diff and applies the described changes to existing files. Each diff starts with \`--- old-file\` and \`+++ new-file\`, followed by one or more hunks. You can pipe the diff via a here-doc, from a file, or stdin.
- A hunk header \`@@ -start_old,count_old +start_new,count_new @@\` indicates which lines of the original (\`-\`) and updated (\`+\`) files are affected. Context lines begin with a space (\` \`) and must match exactly; removed lines start with \`-\`; added lines start with \`+\`.
- To add lines, set the old count to 0 (or leave out old lines) and list the new lines prefixed with \`+\`. Example: append \`print("extra debug")\` to \`tools/test_bash_tool.py\`:
  \`\`\`bash
  patch tools/test_bash_tool.py <<'EOF'
  @@ -0,0 +1 @@
  +print("extra debug")
  EOF
  \`\`\`
- To remove lines, describe the existing text with \`-\` entries and omit any \`+\` replacement. Example: delete one \`print()\` invocation:
  \`\`\`bash
  patch tools/test_bash_tool.py <<'EOF'
  @@
  -print(bash_tool("echo 'console.log(\\"Hello world\\");' > src/index.ts"))
  EOF
  \`\`\`
- To update lines, include both the line to be removed (-) and the replacement line (+) in the same hunk. Example: swap the echoed script:
  \`\`\`bash
  patch tools/test_bash_tool.py <<'EOF'
  --- tools/test_bash_tool.py
  +++ tools/test_bash_tool.py
  @@
  -print(bash_tool("echo 'console.log(\\"Hello world\\");' > src/index.ts"))
  +print(bash_tool("echo 'console.log(\\"Updated!\\");' > src/index.ts"))
  EOF
  \`\`\`
- When changing multiple spots, stack additional hunks in the same diff. Keep the context minimal but sufficient (often a handful of unchanged lines) so patch can locate the right area even if nearby text shifts.
- If \`patch\` can't find the context, it will ask for confirmation or fail. Provide accurate leading/trailing context and ensure line endings match to reduce rejects. Consider backing up the file or using \`patch --backup\` when changes are risky.
- Use \`patch --dry-run\` to verify the diff applies cleanly before committing, or \`patch -pN\` when working with diffs generated via \`git diff/diff -ru\` that include directory prefixes.
</patch_use_policy>
`.trim();
