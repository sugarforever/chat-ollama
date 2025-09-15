---
title: UI Improvements and Chat Reliability Fixes
date: 2025-08-18
slug: 20250818-ui-improvements-and-chat-fixes
description: Hey everyone! 👋
---

# UI Improvements and Chat Reliability Fixes

*August 18, 2025*

Hey everyone! 👋

I've been working on some important improvements to the chat interface over the past few days. Here's what's new and what got fixed.

## 🐛 Major Bug Fixes

### Chat Creation Button Issues
One of the most frustrating bugs was the unresponsive "create new chat" button. Users would click it, nothing would happen, then they'd click multiple times and suddenly get several new chats created at once. 

**What was happening:**
- The `scrollToBottom` function was trying to access `messageListEl.value.scrollHeight` before the DOM element was ready
- No loading state protection meant rapid clicks could trigger multiple API calls
- Race conditions in the chat creation flow

**The fix:**
```javascript
// Added null check in scrollToBottom
const scrollToBottom = (_behavior: ScrollBehavior) => {
    behavior.value = _behavior
    if (messageListEl.value) {
        y.value = messageListEl.value.scrollHeight
    }
}

// Added loading state in ChatSessionList
const isCreatingChat = ref(false)

async function onNewChat() {
    if (isCreatingChat.value) return
    
    isCreatingChat.value = true
    try {
        const data = await createChatSession()
        sessionList.value.unshift(data)
        await router.push(`/chat/${data.id}`)
    } finally {
        isCreatingChat.value = false
    }
}
```

This was a classic example of how small timing issues can create really annoying UX problems!

## ✨ New Feature: Enhanced Preview Panel

The artifact preview system got a major upgrade! Previously, users could only view code artifacts in a basic side panel. Now we have:

### Split View Mode
- Chat takes up the remaining space
- Preview panel has a fixed 500px width
- Both are visible simultaneously for context

### Fullscreen Mode
- Preview covers the entire viewport
- Header is completely hidden for maximum viewing area
- Floating close button with semi-transparent background
- Perfect for viewing complex HTML demos or detailed diagrams

### Smart State Management
This was trickier than it sounds. The key insight was separating the "show/hide preview" state from the "normal/fullscreen" state:

```javascript
// Two separate states instead of one confusing state
const showArtifacts = ref(false)
const isFullscreen = ref(false)

// Smart close behavior
const closeArtifacts = () => {
    showArtifacts.value = false
    isFullscreen.value = false  // Reset fullscreen when closing
}

// Fullscreen close just exits fullscreen, doesn't close preview
const toggleFullscreen = () => {
    isFullscreen.value = !isFullscreen.value
}
```

The UX flow is now:
1. Click preview → Opens in split view
2. Click fullscreen → Expands to fullscreen
3. Click X in fullscreen → Returns to split view
4. Click X in split view → Closes preview completely

## 🎨 Animation Polish

Changed the preview icon animation from a slide-in effect to a fade-in effect. Sometimes the smallest changes make the biggest difference in how polished an interface feels.

```scss
// Before: Slide in from right
.artifact-btn {
    opacity: 0;
    transform: translateX(8px);
}

// After: Simple fade
.artifact-btn {
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

## 📚 What I Learned

### 1. DOM Timing Issues Are Everywhere
The `scrollToBottom` bug was a reminder that Vue's reactivity is fast, but the DOM still needs time to update. Always check if elements exist before accessing their properties.

### 2. State Management Complexity
Initially, I tried to make the preview system "smart" with resizable splits and complex state. But simpler is often better - two clear modes (split/fullscreen) with obvious transitions work much better for users.

### 3. User Testing Reveals Edge Cases
The chat creation bug only happened under specific timing conditions. Real user behavior (rapid clicking when something seems broken) often reveals issues that don't show up in normal development testing.

## 💭 Thoughts for Fellow Developers

These kinds of UI reliability fixes might not be glamorous, but they have huge impact on user experience. A button that works 95% of the time feels broken to users. Taking the time to handle edge cases and race conditions is what separates good interfaces from great ones.

Also, when building preview/modal systems, always think about the exit flow as much as the entry flow. Users need to understand how to get back to where they came from!

---

*What features would you like to see improved next? Drop your thoughts in the issues!*

*- Your dev team*