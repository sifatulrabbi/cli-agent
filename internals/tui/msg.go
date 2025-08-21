package tui

var sampleLongMessage = `You’ve got (at least) three issues causing the stall:
	1.	You’re returning a Cmd that returns another Cmd
In invokeLLM you do:

return func() tea.Msg {
    return waitForChunk(m.ch)
}

But waitForChunk already returns a tea.Cmd (i.e., func() tea.Msg).
So your tea.Cmd returns a function, not a message → Bubble Tea never receives a Msg, so nothing progresses.

✅ Fix: return the Cmd directly (or call it).

// EITHER return the Cmd directly
return waitForChunk(m.ch)

// OR if you keep the wrapper, actually call the inner Cmd
return func() tea.Msg { return waitForChunk(m.ch)() }

	2.	You mutate state inside a value receiver and then throw it away
invokeLLM sets m.busy, m.status, m.viewport, m.ch etc., but model has value receivers.
Those mutations happen on a copy, not the m you return from Update. So your UI state (busy/spinner/status/channel ref) doesn’t stick.

✅ Fix: move the state mutations into the enter branch of Update (before returning), or switch to pointer receivers. The simplest is to set fields in Update and pass the channel into invokeLLM.
	3.	You never append stream chunks to the viewport
On streamChunkMsg you set m.detailedStatus and log, but you don’t add the text to m.viewport.

✅ Fix: keep a buffer and update the viewport content.

⸻

Minimal, targeted changes

A) Add an output buffer

type model struct {
    // ...
    out string
}

B) In Update: handle Enter correctly (mutate first, then return cmds)

case "enter":
    if m.busy {
        return m, nil
    }
    val := strings.TrimSpace(m.input.Value())
    if len(val) == 0 {
        return m, nil
    }
    if val[len(val)-1] == '\\' {
        m.input.SetValue(val[:len(val)-1] + "\n")
        return m, nil
    }
    m.input.Reset()

    switch val {
    case "/exit":
        return m, tea.Quit
    case "/clear":
        m.out = ""
        m.viewport.SetContent("")
        return m, nil
    }

    // --- mutate *here* on the returned model ---
    m.busy = true
    m.status = "Streaming..."
    m.detailedStatus = ""
    m.viewport.SetContent(fmt.Sprintf("USER: %s\nAI: ", val))

    ch := make(chan string)
    m.ch = ch

    // start spinner + LLM
    return m, tea.Batch(
        m.spin.Tick,
        m.invokeLLM(ch, val), // pass the chan in
    )

C) Refactor invokeLLM to take the channel and return a proper Cmd

func (m model) invokeLLM(ch chan string, userInput string) tea.Cmd {
    log.Println("invoking llm...")

    go func() {
        defer close(ch)
        msgChunks := strings.Split(/* sampleLongMessage, " " */) // or your SplitSeq
        for _, chunk := range msgChunks {
            ch <- chunk + " "
            time.Sleep(200 * time.Millisecond)
            log.Println("pumping new chunk.")
        }
    }()

    // ✅ return the Cmd that will block waiting for a chunk
    return waitForChunk(ch)
}

If you’re keeping your custom strings.SplitSeq iterator that returns a channel, that’s fine—just iterate accordingly. The key is that invokeLLM must return waitForChunk(ch) (a tea.Cmd), not a Cmd that returns a Cmd.

D) Actually append chunks to the viewport

case streamChunkMsg:
    s := string(msg)
    m.out += s
    m.viewport.SetContent(fmt.Sprintf("%s\nAI: %s", /* user line if you want */, m.out))
    m.detailedStatus = "Stream ongoing..."
    log.Println("Stream ongoing...")
    return m, waitForChunk(m.ch)

E) Mark done on streamDoneMsg

case streamDoneMsg:
    log.Println("Stream ended.")
    m.busy = false
    m.status = successSt.Render("Done!")
    m.detailedStatus = "Stream ended"
    return m, nil

F) Fix possible panics on empty input

You already saw it: val[len(val)-1] panics if val is empty. I added a len(val) == 0 guard above.

⸻

Tiny consolidated diff (essentials)
	•	Replace return func() tea.Msg { return waitForChunk(m.ch) } with return waitForChunk(m.ch).
	•	Move m.busy = true, m.status, m.viewport.SetContent(...), and m.ch = make(chan string) into the Enter branch before returning.
	•	Pass ch into invokeLLM(ch, val) and have it return waitForChunk(ch).
	•	On streamChunkMsg, append to m.out and m.viewport.SetContent(...).

Do those four and your app will:
	•	show the spinner,
	•	stream chunks into the viewport,
	•	and write logs to ./tmp/logs/debug.log (since you set log.SetOutput(f) already).

If you want, paste just your revised Update, invokeLLM, and the two stream cases, and I’ll sanity-check them line-by-line.`
