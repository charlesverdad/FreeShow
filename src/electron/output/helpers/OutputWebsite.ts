// ----- FreeShow -----
// Website items: the <webview> inside the output window is the ONE live browser instance.
// The main window preview mirrors its frames and can forward mouse/keyboard input to it,
// so things like a Canva presentation (and its remote control) are driven in a single session.
// Each live website is identified by a key: "outputId|url".

import type { WebContents } from "electron"
import { app, webContents } from "electron"
import { mainWindow, toApp } from "../.."
import { OUTPUT } from "../../../types/Channels"
import { OutputHelper } from "../OutputHelper"

const MIRROR_FPS = 15
const MIRROR_WIDTH = 960
const MIRROR_JPEG_QUALITY = 70

const MOUSE_TYPES = ["mouseDown", "mouseUp", "mouseMove"]
const KEY_TYPES = ["keyDown", "keyUp", "char"]
const MOUSE_BUTTONS = ["left", "middle", "right"]
const MODIFIERS = ["shift", "control", "alt", "meta"]

interface AttachedWebsite {
    webContentsId: number
    generation: number
    viewport: { width: number; height: number }
    frameInterval: NodeJS.Timeout | null
    viewportInterval: NodeJS.Timeout | null
    capturing: boolean
    lastFrame: string | null
}

export class OutputWebsite {
    private static attached: { [key: string]: AttachedWebsite } = {}
    // number of main window previews currently showing each website (kept even if nothing is attached yet)
    private static mirrorCount: { [key: string]: number } = {}
    private static generation = 0
    private static mainListenerAdded = false

    // GUEST SETUP (all website items, in any window)

    // Google (and some others) block sign in from "embedded" browsers identified by the Electron token.
    // Set app wide, as popups (e.g. the OAuth sign in window) get their user agent from this at creation.
    static cleanUserAgent() {
        app.userAgentFallback = getCleanUserAgent(app.userAgentFallback)
    }

    static setupGuest(contents: WebContents) {
        // allow popups (OAuth sign in, "open in new window", presenter view) as normal, sandboxed windows
        contents.setWindowOpenHandler(({ url }) => {
            if (!/^https?:\/\//i.test(url) && url !== "about:blank") return { action: "deny" }

            // open on the operator screen (not on top of the outputs)
            const bounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null
            const width = 1000
            const height = 750
            const position = bounds ? { x: Math.round(bounds.x + (bounds.width - width) / 2), y: Math.round(bounds.y + (bounds.height - height) / 2) } : {}

            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    ...position,
                    width,
                    height,
                    autoHideMenuBar: true,
                    backgroundColor: "#ffffff",
                    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false }
                }
            }
        })

        contents.on("did-create-window", (window) => {
            // popups should appear above always on top outputs
            window.setAlwaysOnTop(true, "pop-up-menu", 2)
            // popups opened from popups follow the same rules
            OutputWebsite.setupGuest(window.webContents)
        })
    }

    // LIVE OUTPUT INSTANCE

    static attach({ id, webContentsId }: { id: string; webContentsId: number }) {
        if (typeof id !== "string" || !id) return
        const contents = webContents.fromId(Number(webContentsId))
        if (!contents || contents.isDestroyed() || !isOutputWebview(contents)) return

        const previous = this.attached[id]
        if (previous?.webContentsId === contents.id) return
        if (previous) this.detach({ id, webContentsId: previous.webContentsId }, false)

        this.generation++
        this.attached[id] = { webContentsId: contents.id, generation: this.generation, viewport: { width: 0, height: 0 }, frameInterval: null, viewportInterval: null, capturing: false, lastFrame: null }
        contents.once("destroyed", () => this.detach({ id, webContentsId: contents.id }))
        contents.on("render-process-gone", () => this.detach({ id, webContentsId: contents.id }))

        this.sendState(id, true)
        if (this.mirrorCount[id]) this.startFrames(id)
    }

    static detach({ id, webContentsId }: { id: string; webContentsId?: number }, notify = true) {
        const website = this.attached[id]
        if (!website) return
        // a newer instance (e.g. during a slide transition) might already have replaced this one
        if (webContentsId !== undefined && website.webContentsId !== webContentsId) return

        this.stopFrames(id)
        delete this.attached[id]
        if (notify) this.sendState(id, false)
    }

    static mirror({ id, enabled }: { id: string; enabled: boolean }) {
        if (typeof id !== "string" || !id) return
        this.addMainListener()

        this.mirrorCount[id] = Math.max(0, (this.mirrorCount[id] || 0) + (enabled ? 1 : -1))
        if (!this.mirrorCount[id]) delete this.mirrorCount[id]

        const website = this.attached[id]
        if (enabled) {
            this.sendState(id, !!website)
            // a new preview should not wait for the page to change
            if (website?.lastFrame) this.sendFrame(id, website.lastFrame)
        }

        if (!website) return
        if (this.mirrorCount[id]) this.startFrames(id)
        else this.stopFrames(id)
    }

    // input positions are normalized (0-1) relative to the website
    static input({ id, event }: { id: string; event: any }) {
        const website = this.attached[id]
        const contents = this.getContents(id)
        if (!website || !contents) return

        const inputEvent = validateInput(event, website.viewport)
        if (!inputEvent) return

        try {
            contents.sendInputEvent(inputEvent)
        } catch (err) {
            console.warn("Could not forward website input:", err)
        }
    }

    // FRAMES

    // poll at MIRROR_FPS (instead of reading back every painted frame of e.g. a video)
    private static startFrames(id: string) {
        const website = this.attached[id]
        if (!website || website.frameInterval) return

        this.updateViewport(id)
        website.viewportInterval = setInterval(() => this.updateViewport(id), 2000)
        website.frameInterval = setInterval(() => this.captureFrame(id, website.generation), 1000 / MIRROR_FPS)
        this.captureFrame(id, website.generation)
    }

    private static stopFrames(id: string) {
        const website = this.attached[id]
        if (!website) return

        if (website.frameInterval) clearInterval(website.frameInterval)
        if (website.viewportInterval) clearInterval(website.viewportInterval)
        website.frameInterval = null
        website.viewportInterval = null
    }

    private static captureFrame(id: string, generation: number) {
        const website = this.attached[id]
        const contents = this.getContents(id)
        // only one capture in flight
        if (!website || !contents || website.capturing) return

        website.capturing = true
        contents
            .capturePage()
            .then((image) => {
                // the website might have been replaced while capturing
                if (this.attached[id]?.generation !== generation || image.isEmpty()) return

                const size = image.getSize()
                const resized = size.width > MIRROR_WIDTH ? image.resize({ width: MIRROR_WIDTH, quality: "good" }) : image
                const frame = "data:image/jpeg;base64," + resized.toJPEG(MIRROR_JPEG_QUALITY).toString("base64")
                if (frame === website.lastFrame) return

                website.lastFrame = frame
                this.sendFrame(id, frame)
            })
            .catch(() => {})
            .finally(() => {
                website.capturing = false
            })
    }

    private static updateViewport(id: string) {
        const website = this.attached[id]
        const contents = this.getContents(id)
        if (!website || !contents) return

        const generation = website.generation
        // sendInputEvent uses the page's view coordinates (CSS pixels * zoom factor)
        contents
            .executeJavaScript("[window.innerWidth, window.innerHeight]")
            .then(([width, height]: number[]) => {
                if (this.attached[id]?.generation !== generation) return
                const zoom = contents.getZoomFactor() || 1
                website.viewport = { width: width * zoom, height: height * zoom }
            })
            .catch(() => {})
    }

    // HELPERS

    // previews are gone if the main window reloads/crashes
    private static addMainListener() {
        if (this.mainListenerAdded || !mainWindow || mainWindow.isDestroyed()) return
        this.mainListenerAdded = true

        const reset = () => {
            this.mirrorCount = {}
            Object.keys(this.attached).forEach((id) => this.stopFrames(id))
        }
        mainWindow.webContents.on("did-start-loading", reset)
        mainWindow.webContents.on("render-process-gone", reset)
    }

    private static getContents(id: string) {
        const website = this.attached[id]
        if (!website) return null
        const contents = webContents.fromId(website.webContentsId)
        if (!contents || contents.isDestroyed()) return null
        return contents
    }

    private static sendState(id: string, attached: boolean) {
        toApp(OUTPUT, { channel: "WEBSITE_STATE", data: { id, attached } })
    }

    private static sendFrame(id: string, frame: string) {
        toApp(OUTPUT, { channel: "WEBSITE_FRAME", data: { id, frame } })
    }
}

// only website items inside output windows can be the live instance
function isOutputWebview(contents: WebContents) {
    if (contents.getType() !== "webview") return false
    const host = contents.hostWebContents
    if (!host) return false
    return OutputHelper.getAllOutputs().some((output) => output.window && !output.window.isDestroyed() && output.window.webContents.id === host.id)
}

function validateInput(event: any, viewport: { width: number; height: number }): Electron.MouseInputEvent | Electron.MouseWheelInputEvent | Electron.KeyboardInputEvent | null {
    if (!event || typeof event !== "object") return null
    const modifiers = Array.isArray(event.modifiers) ? event.modifiers.filter((a: any) => MODIFIERS.includes(a)) : []

    if (KEY_TYPES.includes(event.type)) {
        if (typeof event.keyCode !== "string" || !event.keyCode || event.keyCode.length > 20) return null
        return { type: event.type, keyCode: event.keyCode, modifiers }
    }

    if (!MOUSE_TYPES.includes(event.type) && event.type !== "mouseWheel") return null
    if (!viewport.width || !viewport.height) return null
    const x = Math.round(clamp(event.x) * viewport.width)
    const y = Math.round(clamp(event.y) * viewport.height)

    if (event.type === "mouseWheel") return { type: "mouseWheel", x, y, deltaX: finite(event.deltaX), deltaY: finite(event.deltaY), modifiers }

    const button = MOUSE_BUTTONS.includes(event.button) ? event.button : undefined
    const clickCount = Math.min(3, Math.max(1, Math.round(finite(event.clickCount) || 1)))
    return { type: event.type, x, y, button, clickCount, modifiers }
}

function finite(value: any) {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
}

function clamp(value: number) {
    return Math.min(1, Math.max(0, finite(value)))
}

function getCleanUserAgent(userAgent: string) {
    return userAgent
        .replace(/\s(Electron|freeshow)\/\S+/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim()
}
