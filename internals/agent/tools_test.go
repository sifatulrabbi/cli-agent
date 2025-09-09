package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sifatulrabbi/cli-agent/internals/configs"
)

func TestListProjectFiles(t *testing.T) {
	configs.Prepare()
	cleanup := setupTempProject(t)
	defer cleanup()

	mustWriteFile(t, filepath.Join(configs.WorkingPath, "README.md"), "hello\nworld")
	mustMkdirAll(t, filepath.Join(configs.WorkingPath, "dir1"))
	mustWriteFile(t, filepath.Join(configs.WorkingPath, "dir1", "file.txt"), "alpha\nbeta")

	out, err := handleLs("")
	if err != nil {
		t.Fatalf("ls tool error: %v", err)
	}
	fmt.Println(out)
	assertContains(t, out, "<project-entries>")
	assertContains(t, out, "./README.md")
	assertContains(t, out, "./dir1/")
	assertContains(t, out, "./dir1/file.txt")
}

func TestReadFiles(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustMkdirAll(t, configs.WorkingPath+"/newdir")
	mustWriteFile(t, filepath.Join(configs.WorkingPath, "./newdir", "./README.md"), "hello\nworld")

	rfArgs := fmt.Sprintf(`{"filePaths":[%q]}`, "./newdir/README.md")
	out, err := handleReadFiles(rfArgs)
	if err != nil {
		t.Fatalf("read_files error: %v", err)
	}
	assertContains(t, out, "File: ./newdir/README.md")
	assertContains(t, out, "1 | hello")
	assertContains(t, out, "2 | world")
}

func TestCreateEntity_Dir(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	args := fmt.Sprintf(`{"entityPath":%q,"entityType":"dir","entityName":%q,"content":""}`,
		"./newdir",
		"./newdir")
	out, err := handleCreateEntity(args)
	if err != nil {
		t.Fatalf("create_entity dir error: %v", err)
	}
	assertContains(t, out, "has been created")
	assertDirExists(t, filepath.Join(configs.WorkingPath, "newdir"))
}

func TestCreateEntity_File(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	args := fmt.Sprintf(`{"entityPath":%q,"entityType":"file","entityName":%q,"content":"first\nsecond"}`,
		"./newdir/note.txt",
		"./newdir/note.txt")
	_, err := handleCreateEntity(args)
	if err != nil {
		t.Fatalf("create_entity file error: %v", err)
	}
	assertFileExists(t, filepath.Join(configs.WorkingPath, "newdir", "note.txt"))
}

func TestInsertIntoTextFile(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustWriteFile(t, filepath.Join(configs.WorkingPath, "newdir", "note.txt"), "first\nsecond")

	args := fmt.Sprintf(`{"filePath":%q,"inserts":[{"insertAfter":1,"content":"inserted"}]}`, "./newdir/note.txt")
	out, err := handleInsertIntoTextFile(args)
	if err != nil {
		t.Fatalf("insert_into_text_file error: %v", err)
	}
	assertContains(t, out, "File: ./newdir/note.txt")
	assertContains(t, out, "1 | first")
	assertContains(t, out, "2 | inserted")
	assertContains(t, out, "3 | second")
}

func TestPatchTextFile(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustWriteFile(t, filepath.Join(configs.WorkingPath, "newdir", "note.txt"), "first\ninserted\nsecond")

	args := fmt.Sprintf(`{"filePath":%q,"patches":[{"startLine":2,"endLine":2,"content":"REPLACED"}]}`, "./newdir/note.txt")
	out, err := handlePatchTextFile(args)
	if err != nil {
		t.Fatalf("patch_text_file error: %v", err)
	}
	assertContains(t, out, "File: ./newdir/note.txt")
	assertContains(t, out, "1 | first")
	assertContains(t, out, "2 | REPLACED")
}

func TestGrep(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustWriteFile(t, filepath.Join(configs.WorkingPath, "newdir", "note.txt"), "first\ninserted\nsecond")

	// Basic grep for a known word
	args := fmt.Sprintf(`{"cmd":%q}`, "grep -R -n inserted .")
	out, err := handleGrep(args)
	if err != nil {
		t.Fatalf("grep error: %v", err)
	}
	fmt.Println(out)
	// Expect output to include file path and line number
	if !strings.Contains(out, "inserted") {
		t.Fatalf("expected grep output to contain 'inserted', got: %s", out)
	}
}

func TestRemoveEntity_File(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustWriteFile(t, filepath.Join(configs.WorkingPath, "newdir", "note.txt"), "content")

	args := fmt.Sprintf(`{"entityPath":%q}`, "./newdir/note.txt")
	_, err := handleRemoveEntity(args)
	if err != nil {
		t.Fatalf("remove_entity file error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(configs.WorkingPath, "newdir", "note.txt")); !os.IsNotExist(err) {
		t.Fatalf("expected note.txt to be removed, stat err: %v", err)
	}
}

func TestRemoveEntity_Dir(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustMkdirAll(t, filepath.Join(configs.WorkingPath, "newdir"))

	args := fmt.Sprintf(`{"entityPath":%q}`, "./newdir")
	_, err := handleRemoveEntity(args)
	if err != nil {
		t.Fatalf("remove_entity dir error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(configs.WorkingPath, "newdir")); !os.IsNotExist(err) {
		t.Fatalf("expected newdir to be removed, stat err: %v", err)
	}
}

// -----------------
// Test helpers
// -----------------

func setupTempProject(t *testing.T) func() {
	t.Helper()
	configs.WorkingPath = filepath.Join(configs.WorkingPath, "../../tmp/test-tools")
	if err := os.Mkdir(configs.WorkingPath, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", configs.WorkingPath, err)
	}
	projectRootName = filepath.Base(configs.WorkingPath)
	return func() { _ = os.RemoveAll(configs.WorkingPath) }
}

func mustMkdirAll(t *testing.T, p string) {
	t.Helper()
	if err := os.MkdirAll(p, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", p, err)
	}
}

func mustWriteFile(t *testing.T, p, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatalf("mkdir for %s: %v", p, err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", p, err)
	}
}

func assertContains(t *testing.T, s, sub string) {
	t.Helper()
	if !strings.Contains(s, sub) {
		t.Fatalf("expected output to contain %q, got:\n%s", sub, s)
	}
}

func assertFileExists(t *testing.T, p string) {
	t.Helper()
	info, err := os.Stat(p)
	if err != nil {
		t.Fatalf("stat %s: %v", p, err)
	}
	if info.IsDir() {
		t.Fatalf("expected file but found directory: %s", p)
	}
}

func assertDirExists(t *testing.T, p string) {
	t.Helper()
	info, err := os.Stat(p)
	if err != nil {
		t.Fatalf("stat %s: %v", p, err)
	}
	if !info.IsDir() {
		t.Fatalf("expected directory but found file: %s", p)
	}
}
