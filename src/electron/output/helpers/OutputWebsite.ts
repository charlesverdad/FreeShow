// ----- FreeShow -----
// Website items: the <webview> inside the output window is the ONE live browser instance.
// The main window preview mirrors its frames and can forward mouse/keyboard input to it,
// so things like a Canva presentation (and its remote control) are driven in a single session.

import type { WebContents } from "electron"
import { app, webContents } from "electron"
import { mainWindow, toApp } from "../.."
import { OUTPUT } from "../../../types/Channels"

const MIRROR_FPS = 15
const MIRROR_WIDTH = 960
const MIRROR_JPEG_QUALITY = 70

type MirrorInputEvent = { type: "mouseDown" | "mouseUp" | "mouseMove"; x: number; y: number; button?: "left" | "middle" | "right"; clickCount?: number; modifiers?: string[] } | { type: "mouseWheel"; x: number; y: number; deltaX: number; deltaY: number; modifiers?: string[] } | { type: "keyDown" | "keyUp" | "char"; keyCode: string; modifiers?: string[] }

interface AttachedWebsite {
    webContentsId: number
    viewport: { width: number; height: number }
    subscribed: boolean
    lastSent: number
    pendingFrame: Electron.NativeImage | null
    frameTimeout: NodeJS.Timeout | null
    viewportInterval: NodeJS.Timeout | null
}

export class OutputWebsite {
    private static attached: { [outputId: string]: AttachedWebsite } = {}
    // number of main window previews currently showing each output (kept even if nothing is attached yet)
    private static mirrorCount: { [outputId: string]: number } = {}

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
            window.focus()
        })
    }

    // LIVE OUTPUT INSTANCE

    static attach({ id, webContentsId }: { id: string; webContentsId: number }) {
        const contents = webContents.fromId(webContentsId)
        if (!id || !contents || contents.isDestroyed()) return

        const previous = this.attached[id]
        if (previous?.webContentsId === webContentsId) return
        if (previous) this.detach({ id, webContentsId: previous.webContentsId }, false)

        this.attached[id] = { webContentsId, viewport: { width: 0, height: 0 }, subscribed: false, lastSent: 0, pendingFrame: null, frameTimeout: null, viewportInterval: null }
        contents.once("destroyed", () => this.detach({ id, webContentsId }))

        this.sendState(id, true)
        if (this.mirrorCount[id] > 0) this.startFrames(id)
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
        this.mirrorCount[id] = Math.max(0, (this.mirrorCount[id] || 0) + (enabled ? 1 : -1))
        if (enabled) this.sendState(id, !!this.attached[id])

        if (!this.attached[id]) return
        if (this.mirrorCount[id] > 0) this.startFrames(id)
        else this.stopFrames(id)
    }

    // input positions are normalized (0-1) relative to the website
    static input({ id, event }: { id: string; event: MirrorInputEvent }) {
        const website = this.attached[id]
        const contents = this.getContents(id)
        if (!website || !contents) return

        try {
            if ("x" in event) {
                const { width, height } = website.viewport
                if (!width || !height) return
                const x = Math.round(clamp(event.x) * width)
                const y = Math.round(clamp(event.y) * height)
                contents.sendInputEvent({ ...event, x, y } as any)
            } else {
                contents.sendInputEvent(event as any)
            }
        } catch (err) {
            console.warn("Could not forward website input:", err)
        }
    }

    // FRAMES

    private static startFrames(id: string) {
        const website = this.attached[id]
        const contents = this.getContents(id)
        if (!website || !contents || website.subscribed) return

        website.subscribed = true
        this.updateViewport(id)
        website.viewportInterval = setInterval(() => this.updateViewport(id), 2000)

        // static pages might not repaint, so send the current state right away
        contents
            .capturePage()
            .then((image) => this.queueFrame(id, image))
            .catch(() => {})

        try {
            contents.beginFrameSubscription(false, (image) => this.queueFrame(id, image))
        } catch (err) {
            console.warn("Could not mirror website:", err)
        }
    }

    private static stopFrames(id: string) {
        const website = this.attached[id]
        if (!website?.subscribed) return

        website.subscribed = false
        website.pendingFrame = null
        if (website.frameTimeout) clearTimeout(website.frameTimeout)
        if (website.viewportInterval) clearInterval(website.viewportInterval)
        website.frameTimeout = null
        website.viewportInterval = null

        const contents = this.getContents(id)
        try {
            contents?.endFrameSubscription()
        } catch {
            // ignore
        }
    }

    // throttle to MIRROR_FPS, always sending the latest frame
    private static queueFrame(id: string, image: Electron.NativeImage) {
        const website = this.attached[id]
        if (!website?.subscribed || image.isEmpty()) return

        website.pendingFrame = image
        if (website.frameTimeout) return

        const wait = Math.max(0, 1000 / MIRROR_FPS - (Date.now() - website.lastSent))
        website.frameTimeout = setTimeout(() => {
            website.frameTimeout = null
            const frame = website.pendingFrame
            website.pendingFrame = null
            if (!frame || !website.subscribed) return

            website.lastSent = Date.now()
            const size = frame.getSize()
            const resized = size.width > MIRROR_WIDTH ? frame.resize({ width: MIRROR_WIDTH, quality: "good" }) : frame
            const data = "data:image/jpeg;base64," + resized.toJPEG(MIRROR_JPEG_QUALITY).toString("base64")
            toApp(OUTPUT, { channel: "WEBSITE_FRAME", data: { id, frame: data } })
        }, wait)
    }

    private static updateViewport(id: string) {
        const contents = this.getContents(id)
        if (!contents) return

        // sendInputEvent uses the page's view coordinates (CSS pixels * zoom factor)
        contents
            .executeJavaScript("[window.innerWidth, window.innerHeight]", true)
            .then(([width, height]: number[]) => {
                const website = this.attached[id]
                if (!website || website.webContentsId !== contents.id) return
                const zoom = contents.getZoomFactor() || 1
                website.viewport = { width: width * zoom, height: height * zoom }
            })
            .catch(() => {})
    }

    // HELPERS

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
}

function clamp(value: number) {
    return Math.min(1, Math.max(0, Number(value) || 0))
}

function getCleanUserAgent(userAgent: string) {
    return userAgent
        .replace(/\s(Electron|freeshow)\/\S+/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim()
}
