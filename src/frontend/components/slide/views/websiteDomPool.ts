import { send } from "../../../utils/request"
import { OUTPUT } from "../../../../types/Channels"
import { websiteAction } from "../../../stores"

type AttachedSlot = {
    webview: any
    src: string
    currentParent: HTMLElement | null
    // the output this webview is shown for ("" for slide thumbnails, the editor etc.)
    outputId: string
    lastUsed: number
    // options of the placement currently showing it, so its events reach the right component
    options: AttachOptions
    actionUnsubscribe?: () => void
}

type AttachOptions = {
    src: string
    zoom?: number
    isOutput?: boolean
    outputId?: string
    onReady?: (webview: any) => void
    onNavigate?: (url: string) => void
}

const MAX_CACHED_WEBVIEWS = 3
const webviewPool: AttachedSlot[] = []

let hiddenContainer: HTMLElement | null = null
function getHiddenContainer(): HTMLElement {
    if (!hiddenContainer) {
        hiddenContainer = document.createElement("div")
        hiddenContainer.id = "hidden-website-pool"
        hiddenContainer.style.cssText = "position:fixed;top:-99999px;left:-99999px;width:100px;height:100px;visibility:hidden;pointer-events:none;z-index:-9999;"
        document.body.appendChild(hiddenContainer)
    }
    return hiddenContainer
}

const isUnattached = (slot: AttachedSlot) => !slot.currentParent || slot.currentParent === hiddenContainer

export function cleanupOldWebviews() {
    const unattached = webviewPool.filter(isUnattached)
    if (unattached.length > MAX_CACHED_WEBVIEWS) {
        unattached.sort((a, b) => a.lastUsed - b.lastUsed)
        for (const slot of unattached.slice(0, unattached.length - MAX_CACHED_WEBVIEWS)) {
            slot.actionUnsubscribe?.()
            slot.webview.remove?.()
            webviewPool.splice(webviewPool.indexOf(slot), 1)
        }
    }
}

function createSlot(options: AttachOptions): AttachedSlot {
    const src = options.src
    const webview = document.createElement("webview") as any
    webview.src = src
    webview.style.cssText = "width:100%;height:100%;display:block;"

    const actionUnsubscribe = websiteAction.subscribe((action) => {
        if (!action || (action.src && action.src !== src)) return

        try {
            if (action.type === "key") {
                webview.sendInputEvent?.({ type: "keyDown", keyCode: action.keyCode })
                webview.sendInputEvent?.({ type: "keyUp", keyCode: action.keyCode })
            } else if (action.type === "reload") {
                webview.reload?.()
            }
        } catch (err) {
            console.debug("Website action failed:", err)
        }
    })

    const slot: AttachedSlot = { webview, src, currentParent: null, outputId: options.outputId || "", lastUsed: Date.now(), options, actionUnsubscribe }

    webview.addEventListener("dom-ready", () => {
        const opts = slot.options
        applyWebviewStyle(webview, opts.zoom, opts.isOutput, src)
        opts.onReady?.(webview)

        if (opts.isOutput && opts.outputId) {
            send(OUTPUT, ["FOCUS"], { id: opts.outputId })
            setTimeout(() => {
                try {
                    webview.focus?.()
                } catch (err) {
                    console.debug("Webview focus failed:", err)
                }
            })
        }
    })

    webview.addEventListener("did-navigate", () => {
        try {
            slot.options.onNavigate?.(webview.getURL?.() || src)
        } catch (e) {
            console.debug(e)
        }
    })

    webviewPool.push(slot)
    return slot
}

// Several places can show the same website at once (the slide thumbnail, the preview of each output).
// Each placement gets its own webview, but a loaded one is reused where possible so the website keeps its state:
// 1. the one already showing this website for the same output (moving to the next slide with the same website)
// 2. one that is loaded but not shown anywhere
function claimSlot(options: AttachOptions): AttachedSlot {
    const outputId = options.outputId || ""
    const sameSrc = webviewPool.filter((slot) => slot.src === options.src)

    const slot = (outputId && sameSrc.find((a) => a.outputId === outputId)) || sameSrc.find(isUnattached) || createSlot(options)
    slot.outputId = outputId
    slot.options = options
    slot.lastUsed = Date.now()
    return slot
}

export function attachPersistentWebview(targetNode: HTMLElement, options: AttachOptions) {
    if (!options.src) return

    let slot: AttachedSlot | null = null
    attach(options)

    return {
        update(newOptions: AttachOptions) {
            if (newOptions.src !== slot?.src) {
                detach()
                attach(newOptions)
            } else {
                slot.options = newOptions
                applyWebviewStyle(slot.webview, newOptions.zoom, newOptions.isOutput, slot.src)
            }
        },
        destroy() {
            detach()
        }
    }

    function attach(opts: AttachOptions) {
        slot = null
        if (!opts.src) return

        slot = claimSlot(opts)
        slot.currentParent = targetNode
        targetNode.appendChild(slot.webview)
        applyWebviewStyle(slot.webview, opts.zoom, opts.isOutput, slot.src)
        opts.onReady?.(slot.webview)
    }

    function detach() {
        // another placement may have taken it over already
        if (!slot || slot.webview.parentNode !== targetNode) return

        slot.currentParent = getHiddenContainer()
        getHiddenContainer().appendChild(slot.webview)
        if (slot.options.isOutput) {
            try {
                slot.webview.setAudioMuted?.(true)
            } catch (e) {
                console.debug(e)
            }
        }
        cleanupOldWebviews()
    }
}

function applyWebviewStyle(webview: any, zoom = 100, isOutput = false, src = "") {
    if (!webview) return
    try {
        webview.setAudioMuted?.(!isOutput)

        const factor = (parseFloat(zoom?.toString() || "100") || 100) / 100
        webview.setZoomFactor?.(factor)

        const iframe = webview.shadowRoot?.querySelector("iframe")
        if (iframe) {
            iframe.style.height = "100%"
            iframe.style.flex = "1 1 auto"
        }

        if (src.includes("embed")) return

        webview
            .executeJavaScript?.(
                `
            if (document.documentElement) {
                document.documentElement.style.zoom = '${factor}';
                document.documentElement.style.width = '100%';
                document.documentElement.style.height = '100%';
            }
            if (document.body) {
                document.body.style.transformOrigin = '0 0';
                document.body.style.width = '100%';
                document.body.style.height = '100%';
            }
        `
            )
            .catch((err: any) => console.debug("Webview executeJavaScript failed:", err))
    } catch (err) {
        console.debug("Failed applying webview style:", err)
    }
}
