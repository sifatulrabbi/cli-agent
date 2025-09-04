package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestListProjectFiles(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustWriteFile(t, filepath.Join(projectRootDir, "README.md"), "hello\nworld")
	mustMkdirAll(t, filepath.Join(projectRootDir, "dir1"))
	mustWriteFile(t, filepath.Join(projectRootDir, "dir1", "file.txt"), "alpha\nbeta")

	out, err := handleListProjectFiles("")
	if err != nil {
		t.Fatalf("ls tool error: %v", err)
	}
	fmt.Println("out:", out)
	assertContains(t, out, "<project-entries>")
	assertContains(t, out, projectRootName+"/README.md")
	assertContains(t, out, projectRootName+"/dir1/")
	assertContains(t, out, projectRootName+"/dir1/file.txt")
}

func TestReadFiles(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustWriteFile(t, filepath.Join(projectRootDir, "README.md"), "hello\nworld")

	rfArgs := fmt.Sprintf(`{"filePaths":[%q]}`, projectRootName+"/README.md")
	out, err := handleReadFiles(rfArgs)
	if err != nil {
		t.Fatalf("read_files error: %v", err)
	}
	assertContains(t, out, "File: "+projectRootName+"/README.md")
	assertContains(t, out, "1 | hello")
	assertContains(t, out, "2 | world")
}

func TestCreateEntity_Dir(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	args := fmt.Sprintf(`{"entityPath":%q,"entityType":"dir","entityName":%q,"content":""}`, projectRootName+"/newdir", projectRootName+"/newdir")
	out, err := handleCreateEntity(args)
	if err != nil {
		t.Fatalf("create_entity dir error: %v", err)
	}
	assertContains(t, out, "has been created")
	assertDirExists(t, filepath.Join(projectRootDir, "newdir"))
}

func TestCreateEntity_File(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	args := fmt.Sprintf(`{"entityPath":%q,"entityType":"file","entityName":%q,"content":"first\nsecond"}`, projectRootName+"/newdir/note.txt", projectRootName+"/newdir/note.txt")
	_, err := handleCreateEntity(args)
	if err != nil {
		t.Fatalf("create_entity file error: %v", err)
	}
	assertFileExists(t, filepath.Join(projectRootDir, "newdir", "note.txt"))
}

func TestInsertIntoTextFile(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustWriteFile(t, filepath.Join(projectRootDir, "newdir", "note.txt"), "first\nsecond")

	args := fmt.Sprintf(`{"filePath":%q,"inserts":[{"insertAfter":1,"content":"inserted"}]}`, projectRootName+"/newdir/note.txt")
	out, err := handleInsertIntoTextFile(args)
	if err != nil {
		t.Fatalf("insert_into_text_file error: %v", err)
	}
	assertContains(t, out, "File: "+projectRootName+"/newdir/note.txt")
	assertContains(t, out, "1 | first")
	assertContains(t, out, "2 | inserted")
	assertContains(t, out, "3 | second")
}

func TestPatchTextFile(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustWriteFile(t, filepath.Join(projectRootDir, "newdir", "note.txt"), "first\ninserted\nsecond")

	args := fmt.Sprintf(`{"filePath":%q,"patches":[{"startLine":2,"endLine":2,"content":"REPLACED"}]}`, projectRootName+"/newdir/note.txt")
	out, err := handlePatchTextFile(args)
	if err != nil {
		t.Fatalf("patch_text_file error: %v", err)
	}
	assertContains(t, out, "File: "+projectRootName+"/newdir/note.txt")
	assertContains(t, out, "1 | first")
	assertContains(t, out, "2 | REPLACED")
}

func TestRemoveEntity_File(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustWriteFile(t, filepath.Join(projectRootDir, "newdir", "note.txt"), "content")

	args := fmt.Sprintf(`{"entityPath":%q}`, projectRootName+"/newdir/note.txt")
	_, err := handleRemoveEntity(args)
	if err != nil {
		t.Fatalf("remove_entity file error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRootDir, "newdir", "note.txt")); !os.IsNotExist(err) {
		t.Fatalf("expected note.txt to be removed, stat err: %v", err)
	}
}

func TestRemoveEntity_Dir(t *testing.T) {
	cleanup := setupTempProject(t)
	defer cleanup()

	mustMkdirAll(t, filepath.Join(projectRootDir, "newdir"))

	args := fmt.Sprintf(`{"entityPath":%q}`, projectRootName+"/newdir")
	_, err := handleRemoveEntity(args)
	if err != nil {
		t.Fatalf("remove_entity dir error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRootDir, "newdir")); !os.IsNotExist(err) {
		t.Fatalf("expected newdir to be removed, stat err: %v", err)
	}
}

// -----------------
// Test helpers
// -----------------

func setupTempProject(t *testing.T) func() {
	t.Helper()
	projectRootDir = filepath.Join(projectRootDir, "../../tmp/test-tools")
	if err := os.Mkdir(projectRootDir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", projectRootDir, err)
	}
	projectRootName = filepath.Base(projectRootDir)
	return func() { _ = os.RemoveAll(projectRootDir) }
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
