import { describe, expect, it } from "vitest"
import { getKeyCode, getKeyEvents, getMouseButton, getRelativePosition } from "./websiteInput"

const noModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }

describe("websiteInput", () => {
    it("maps DOM keys to Electron key codes", () => {
        expect(getKeyCode("ArrowRight")).toBe("Right")
        expect(getKeyCode(" ")).toBe("Space")
        expect(getKeyCode("a")).toBe("a")
        expect(getKeyCode("F5")).toBe("F5")
        expect(getKeyCode("Shift")).toBeNull()
        expect(getKeyCode("AudioVolumeUp")).toBeNull()
    })

    it("sends keyDown + char for typed characters", () => {
        expect(getKeyEvents({ ...noModifiers, key: "a" }, "keydown")).toEqual([
            { type: "keyDown", keyCode: "a", modifiers: [] },
            { type: "char", keyCode: "a", modifiers: [] }
        ])
    })

    it("does not send char for navigation keys or shortcuts", () => {
        expect(getKeyEvents({ ...noModifiers, key: "ArrowLeft" }, "keydown")).toEqual([{ type: "keyDown", keyCode: "Left", modifiers: [] }])
        expect(getKeyEvents({ ...noModifiers, metaKey: true, key: "v" }, "keydown")).toEqual([{ type: "keyDown", keyCode: "v", modifiers: ["meta"] }])
    })

    it("sends keyUp on release", () => {
        expect(getKeyEvents({ ...noModifiers, shiftKey: true, key: "Enter" }, "keyup")).toEqual([{ type: "keyUp", keyCode: "Enter", modifiers: ["shift"] }])
    })

    it("maps mouse buttons", () => {
        expect(getMouseButton(0)).toBe("left")
        expect(getMouseButton(1)).toBe("middle")
        expect(getMouseButton(2)).toBe("right")
        expect(getMouseButton(4)).toBe("left")
    })

    it("normalizes and clamps positions", () => {
        const rect = { left: 100, top: 50, width: 200, height: 100 }
        expect(getRelativePosition({ clientX: 200, clientY: 100 }, rect)).toEqual({ x: 0.5, y: 0.5 })
        expect(getRelativePosition({ clientX: 0, clientY: 500 }, rect)).toEqual({ x: 0, y: 1 })
        expect(getRelativePosition({ clientX: 0, clientY: 0 }, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 })
    })
})
