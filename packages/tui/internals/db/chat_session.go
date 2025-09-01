package db

import (
    "context"
    "encoding/json"
    "errors"
    "time"

    "github.com/google/uuid"
    "gorm.io/datatypes"
    "gorm.io/gorm"
)

// ChatSession represents a single chat with a list of messages embedded as JSON.
// It uses soft deletes via gorm.DeletedAt.
type ChatSession struct {
    ID        string         `gorm:"primaryKey" json:"id"`
    Messages  datatypes.JSON `gorm:"type:json" json:"messages"`
    CreatedAt time.Time      `gorm:"autoCreateTime" json:"created_at"`
    UpdatedAt time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`
}

// ChatMessage is a minimal, structured message stored inside ChatSession.Messages JSON.
type ChatMessage struct {
    ID        string    `json:"id"`
    Role      string    `json:"role"`
    Content   string    `json:"content"`
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

// BeforeCreate hook to ensure ID and non-nil Messages are set.
func (c *ChatSession) BeforeCreate(tx *gorm.DB) error {
    if c.ID == "" {
        c.ID = uuid.NewString()
    }
    if len(c.Messages) == 0 {
        // default to empty list []
        c.Messages = datatypes.JSON([]byte("[]"))
    }
    return nil
}

// AutoMigrateChatSession migrates the ChatSession table.
func AutoMigrateChatSession() error {
    return AutoMigrate(&ChatSession{})
}

// GetAllChatSessions returns all non-deleted chat sessions, ordered by updated_at DESC.
func GetAllChatSessions(ctx context.Context) ([]ChatSession, error) {
    db, err := Get()
    if err != nil {
        return nil, err
    }
    var sessions []ChatSession
    if err := db.WithContext(ctx).Order("updated_at DESC").Find(&sessions).Error; err != nil {
        return nil, err
    }
    return sessions, nil
}

// CreateChatSession creates a new session with optional initial messages.
func CreateChatSession(ctx context.Context, initial []ChatMessage) (*ChatSession, error) {
    db, err := Get()
    if err != nil {
        return nil, err
    }
    sess := &ChatSession{}
    if len(initial) > 0 {
        // Ensure message IDs and timestamps
        now := time.Now()
        for i := range initial {
            if initial[i].ID == "" {
                initial[i].ID = uuid.NewString()
            }
            if initial[i].CreatedAt.IsZero() {
                initial[i].CreatedAt = now
            }
            initial[i].UpdatedAt = now
        }
        b, _ := json.Marshal(initial)
        sess.Messages = datatypes.JSON(b)
    }
    if err := db.WithContext(ctx).Create(sess).Error; err != nil {
        return nil, err
    }
    return sess, nil
}

// SoftDeleteChatSession marks the session as deleted (soft delete).
func SoftDeleteChatSession(ctx context.Context, sessionID string) error {
    db, err := Get()
    if err != nil {
        return err
    }
    return db.WithContext(ctx).Where("id = ?", sessionID).Delete(&ChatSession{}).Error
}

// InsertMessage appends a new message to the chat session.
func InsertMessage(ctx context.Context, sessionID string, msg ChatMessage) error {
    db, err := Get()
    if err != nil {
        return err
    }
    var sess ChatSession
    if err := db.WithContext(ctx).First(&sess, "id = ?", sessionID).Error; err != nil {
        return err
    }

    var messages []ChatMessage
    if len(sess.Messages) > 0 {
        if err := json.Unmarshal(sess.Messages, &messages); err != nil {
            return err
        }
    }

    now := time.Now()
    if msg.ID == "" {
        msg.ID = uuid.NewString()
    }
    if msg.CreatedAt.IsZero() {
        msg.CreatedAt = now
    }
    msg.UpdatedAt = now

    messages = append(messages, msg)
    b, _ := json.Marshal(messages)
    sess.Messages = datatypes.JSON(b)

    return db.WithContext(ctx).Save(&sess).Error
}

// UpdateMessage updates an existing message in the chat session by message ID.
// It returns gorm.ErrRecordNotFound if the message is not present.
func UpdateMessage(ctx context.Context, sessionID, messageID string, updateFn func(m *ChatMessage)) error {
    if updateFn == nil {
        return errors.New("updateFn cannot be nil")
    }
    db, err := Get()
    if err != nil {
        return err
    }
    var sess ChatSession
    if err := db.WithContext(ctx).First(&sess, "id = ?", sessionID).Error; err != nil {
        return err
    }
    var messages []ChatMessage
    if len(sess.Messages) > 0 {
        if err := json.Unmarshal(sess.Messages, &messages); err != nil {
            return err
        }
    }
    found := false
    for i := range messages {
        if messages[i].ID == messageID {
            updateFn(&messages[i])
            messages[i].UpdatedAt = time.Now()
            found = true
            break
        }
    }
    if !found {
        return gorm.ErrRecordNotFound
    }

    b, _ := json.Marshal(messages)
    sess.Messages = datatypes.JSON(b)
    return db.WithContext(ctx).Save(&sess).Error
}

// RemoveMessage removes a message by ID from the session.
// It is not an error if the message does not exist; no-op in that case.
func RemoveMessage(ctx context.Context, sessionID, messageID string) error {
    db, err := Get()
    if err != nil {
        return err
    }
    var sess ChatSession
    if err := db.WithContext(ctx).First(&sess, "id = ?", sessionID).Error; err != nil {
        return err
    }
    var messages []ChatMessage
    if len(sess.Messages) > 0 {
        if err := json.Unmarshal(sess.Messages, &messages); err != nil {
            return err
        }
    }
    if len(messages) == 0 {
        return nil
    }
    out := messages[:0]
    for i := range messages {
        if messages[i].ID != messageID {
            out = append(out, messages[i])
        }
    }
    b, _ := json.Marshal(out)
    sess.Messages = datatypes.JSON(b)
    return db.WithContext(ctx).Save(&sess).Error
}

