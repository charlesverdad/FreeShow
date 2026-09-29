// Convert DOM input events from the main window preview into Electron input events
// that are forwarded to the live website in the output window (webContents.sendInputEvent).

// one live website per output & url
export function getWebsiteKey(outputId: string, src: string) {
    return outputId + "|" + src
}

type Modifiers = { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }

export type WebsiteInputEvent = { type: "mouseDown" | "mouseUp" | "mouseMove"; x: number; y: number; button?: "left" | "middle" | "right"; clickCount?: number; modifiers?: string[] } | { type: "mouseWheel"; x: number; y: number; deltaX: number; deltaY: number; modifiers?: string[] } | { type: "keyDown" | "keyUp" | "char"; keyCode: string; modifiers?: string[] }

// DOM KeyboardEvent.key -> Electron accelerator key code
const KEY_CODES: { [key: string]: string } = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    " ": "Space",
    Enter: "Enter",
    Escape: "Escape",
    Backspace: "Backspace",
    Delete: "Delete",
    Tab: "Tab",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Insert: "Insert",
    "+": "Plus"
}
const IGNORED_KEYS = ["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead", "Unidentified"]

export function getModifiers(e: Modifiers): string[] {
    const modifiers: string[] = []
    if (e.shiftKey) modifiers.push("shift")
    if (e.ctrlKey) modifiers.push("control")
    if (e.altKey) modifiers.push("alt")
    if (e.metaKey) modifiers.push("meta")
    return modifiers
}

export function getKeyCode(key: string): string | null {
    if (!key || IGNORED_KEYS.includes(key)) return null
    if (KEY_CODES[key]) return KEY_CODES[key]
    if (/^F\d{1,2}$/.test(key)) return key
    if (key.length === 1) return key
    return null
}

// a keydown produces keyDown + char (for text input), keyup produces keyUp
export function getKeyEvents(e: Modifiers & { key: string }, type: "keydown" | "keyup"): WebsiteInputEvent[] {
    const keyCode = getKeyCode(e.key)
    if (!keyCode) return []

    const modifiers = getModifiers(e)
    if (type === "keyup") return [{ type: "keyUp", keyCode, modifiers }]

    const events: WebsiteInputEvent[] = [{ type: "keyDown", keyCode, modifiers }]
    // typed characters (not shortcuts)
    const isShortcut = e.ctrlKey || e.metaKey
    if (!isShortcut && (e.key.length === 1 || e.key === "Enter")) events.push({ type: "char", keyCode: e.key === "Enter" ? "\r" : e.key, modifiers })
    return events
}

const MOUSE_BUTTONS = ["left", "middle", "right"] as const
export function getMouseButton(button: number): "left" | "middle" | "right" {
    return MOUSE_BUTTONS[button] || "left"
}

// position relative to the element (0-1)
export function getRelativePosition(e: { clientX: number; clientY: number }, rect: { left: number; top: number; width: number; height: number }) {
    if (!rect.width || !rect.height) return { x: 0, y: 0 }
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
}
